import fs from 'fs';
import path from 'path';
import Joi from 'joi';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { registrationDb, procurementDb, userManagementDb } from '../../../config/databases.js';
import {
  displayNameFromJwtPayload,
  mergeGatewayJwtUserPayload,
  nimFromStudentDetailJwtPayload,
  nipFromEmployeeJwtPayload,
  nipOrNimFromJwtPayload,
} from '../../../core/utils/jwtIdentityFromPayload.js';
import * as svc from '../services/submissionService.js';
import * as notificationSvc from '../services/notificationService.js';
import * as pdfService from '../services/pdfService.js';
import * as financialProposalPdf from '../services/financialProposalPdf.js';
import * as finPropSigningSvc from '../services/financialProposalSigningService.js';
import * as justifSigningSvc from '../services/justificationSigningService.js';
import * as justifDataSvc from '../services/justificationDataService.js';
import * as handoverBeritaAcaraPdf from '../services/handoverBeritaAcaraPdf.js';
import * as submissionProposalSvc from '../services/submissionProposalService.js';
import * as reimbursementWetDocSvc from '../services/reimbursementWetDocumentService.js';
import * as submissionSvc from '../services/submissionService.js';
import * as submissionStatusLogSvc from '../services/submissionStatusLogService.js';
import * as submissionReferenceSvc from '../services/submissionReferenceService.js';
import * as laboranPassSvc from '../services/laboranPassService.js';
import * as vendorPurchaseSvc from '../services/vendorPurchaseService.js';
import {
  isTpaOrLaboranRequesterRole,
  resolveLaboratoriumIntegraLab,
} from '../utils/laboratoriumIntegra.js';
import {
  SUBMISSION_REQUESTER_ALLOWED,
  normalizeSubmissionRequesterRole,
  preferTpaLaboranRequesterRole,
  collectUserRoleCandidates,
  resolveInitialSubmissionStatus,
  isTpaLaboranDirectSubmissionRequester,
  shouldAppendInitialSubmissionStatusLog,
} from '../utils/requesterRoleUtils.js';
const {
  buildProposalPdfFilename,
  buildFinancialProposalPdfFilename,
  buildJustificationPdfFilename,
  buildHandoverBeritaAcaraPdfFilename,
} = submissionReferenceSvc;
import * as reimbursementSignerLookupSvc from '../services/reimbursementSignerLookupService.js';
import { fetchGatewayJwtPayloadClaims } from '../services/gatewayJwtPayloadService.js';

const USER_MGMT_URL = process.env.USER_MGMT_URL || 'http://user-management:3000';

async function _applyWetSignaturePlaceholderNames(submission) {
  if (!submission) return submission;
  const names = await reimbursementSignerLookupSvc.resolveWetSignaturePlaceholderNames(submission);
  submission._wet_kaur_signer_name = names.kaurName || '';
  submission._wet_kaprodi_signer_name = names.kaprodiName || '';
  return submission;
}

/**
 * Ambil string JWT dari header (case-insensitive `Bearer`) atau `req.token` (di-set validateJWT).
 */
function _extractBearerTokenString(req) {
  const auth =
    (typeof req.get === 'function' && req.get('authorization')) ||
    req.headers?.authorization ||
    req.headers?.Authorization;
  if (auth && typeof auth === 'string') {
    const m = auth.match(/^\s*Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  if (req.token && typeof req.token === 'string') return req.token.trim();
  return '';
}

/**
 * Gabungkan `req.user` dengan hasil `jwt.decode` dari Bearer token.
 * Beberapa gateway / middleware hanya mengisi `req.user` dengan subset klaim (nama/id/role)
 * sehingga `nipnim` / nested `employee` hilang — padahal masih ada di payload token.
 */
function _jwtUserForSignerSnapshot(req) {
  const fromMiddleware = req.user && typeof req.user === 'object' ? { ...req.user } : {};
  const token = _extractBearerTokenString(req);
  if (!token) return mergeGatewayJwtUserPayload(fromMiddleware);
  try {
    const decoded = jwt.decode(token, { complete: false });
    if (decoded && typeof decoded === 'object') {
      /** Klaim dari token menimpa `req.user` agar nilai seperti `nipnim` tidak hilang karena subset dari gateway. */
      const merged = { ...fromMiddleware, ...decoded };
      if (merged.id == null && decoded.sub != null) merged.id = String(decoded.sub);
      return mergeGatewayJwtUserPayload(merged);
    }
  } catch (_) {
    /* ignore */
  }
  return mergeGatewayJwtUserPayload(fromMiddleware);
}

/** Trim untuk snapshot kolom; tidak memfilter pola SSO (bisa bentrok dengan kode internal dev). */
function _trimNipnimSnapshot(v) {
  if (v == null) return '';
  return String(v).trim();
}

const ALLOWED_LABS = ['lab integra', 'lab kimia', 'lab fisika'];

const createSchema = Joi.object({
  requester_name: Joi.forbidden(),
  requester_nim: Joi.forbidden(),
  requester_role: Joi.forbidden(),

  // We no longer accept textual department/lab; accept only IDs
  study_program_id: Joi.string().guid({ version: ['uuidv4','uuidv5','uuidv1','uuidv3'] }).allow(null),
  lab_id: Joi.string().guid({ version: ['uuidv4','uuidv5','uuidv1','uuidv3'] }).allow(null),
  items: Joi.array().items(
    Joi.object({
      item_name: Joi.string().min(1).required(),
      specification: Joi.string().allow('', null),
      quantity: Joi.number().integer().min(1).required(),
      unit_price: Joi.number().min(0).required(),
      urgency_level: Joi.string().max(500).allow('', null),
      purchase_link: Joi.string().uri().allow('', null),
      unit: Joi.string().max(64).allow('', null),
      // allow inventory identifiers (camelCase or snake_case) when frontend supplies them
      inventoryId: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
      inventory_id: Joi.alternatives().try(Joi.string(), Joi.number()).optional()
    })
  ).min(1).required(),
  purpose: Joi.string().allow('', null),
  action: Joi.string().valid('draft', 'submit').optional()
});

function isMeaningfulString(v) {
  return typeof v === 'string' && v.trim() !== '' && v.trim().toLowerCase() !== 'string';
}

function submissionItemIsFromInventory(it) {
  const invId = it?.inventoryId ?? it?.inventory_id;
  if (invId == null) return false;
  if (typeof invId === 'number') return invId !== 0;
  const s = String(invId).trim().toLowerCase();
  return s !== '' && s !== 'null' && s !== '0' && s !== 'false';
}

function validateItemUnitPrices(items = []) {
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const price = Number(it.unit_price);
    if (submissionItemIsFromInventory(it)) {
      if (Number.isNaN(price) || price < 0) {
        return `items[${i}].unit_price must be >= 0 for inventory items`;
      }
    } else if (Number.isNaN(price) || price <= 0) {
      return `items[${i}].unit_price must be positive for custom items`;
    }
  }
  return null;
}

function normalizeRole(raw) {
  return normalizeSubmissionRequesterRole(raw);
}

export async function createSubmission(req, res, next) {
  try {
    // Allowed normalized roles for creating submissions (hoisted — used early when enriching from user-mgmt)
    const ALLOWED = SUBMISSION_REQUESTER_ALLOWED;

    const incomingRaw = { ...req.body };
    if (incomingRaw.created_by !== undefined) delete incomingRaw.created_by;
    if ((incomingRaw.items === undefined || !Array.isArray(incomingRaw.items) || incomingRaw.items.length === 0)
        && incomingRaw.item_name) {
      incomingRaw.items = [{
        item_name: incomingRaw.item_name,
        specification: incomingRaw.specification,
        unit_price: incomingRaw.unit_price,
        quantity: incomingRaw.quantity
      }];
      delete incomingRaw.item_name;
      delete incomingRaw.unit_price;
      delete incomingRaw.quantity;
      delete incomingRaw.specification;
    }

    const { error, value } = createSchema.validate(incomingRaw);
    if (error) return res.status(400).json({ error: error.message });
    const unitPriceErr = validateItemUnitPrices(value.items);
    if (unitPriceErr) return res.status(400).json({ error: unitPriceErr });

    const headers = {};
    if (req.headers && req.headers.authorization) headers.Authorization = req.headers.authorization;
    const client = { ...value };

    const userId = req.user?.id ?? null;
    let fetchedName = null;
    let fetchedRole = null;
    let rolesDataFromMgmt = null;
    let activeRolesFromLocal = [];
    if (userId) {
      try {
        const [profileRes, rolesRes] = await Promise.all([
          axios.get(`${USER_MGMT_URL}/api/user-management/users/${userId}/profile`, { headers }),
          axios.get(`${USER_MGMT_URL}/api/user-management/users/${userId}/roles`, { headers })
        ]);

        const profileData = profileRes?.data?.data ?? profileRes?.data;
        if (profileData) {
          const candidateName = profileData.full_name || profileData?.name || profileData.username || profileData.displayName;
          if (isMeaningfulString(candidateName)) fetchedName = candidateName;
        }

        const rolesData = rolesRes?.data?.data ?? rolesRes?.data;
        rolesDataFromMgmt = rolesData;
        if (rolesData) {
          try {
            console.debug('Submission: fetched roles payload from user-management:', { userId, rolesData });
          } catch (logErr) {
            /* ignore logging errors */
          }
          if (Array.isArray(rolesData) && rolesData.length > 0) {
            // Scan the returned roles array and prefer the first one that normalizes to an allowed role
            for (const rr of rolesData) {
              const candidate = typeof rr === 'string' ? rr : (rr.role || rr.name || rr.code || null);
              const nn = normalizeRole(candidate);
              if (nn && ALLOWED.includes(nn)) {
                fetchedRole = candidate;
                break;
              }
            }
            // If none normalized to allowed, fall back to first element's raw value
            if (!fetchedRole) {
              const first = rolesData[0];
              fetchedRole = typeof first === 'string' ? first : (first.role || first.name || first.code || null);
            }
          } else if (typeof rolesData === 'string') {
            fetchedRole = rolesData;
          }
          // Debug fetchedRole (may be null if shape unexpected)
          console.debug('Submission: fetchedRole determined from user-management response', { userId, fetchedRole });
        }
      } catch (e) {
        console.error('Failed fetching user-management data for submission:', e?.message || e);
      }
    }

    if (fetchedName) {
      client.requester_name = fetchedName;
    } else if (req.user?.name || req.user?.full_name || req.user?.username) {
      client.requester_name = req.user.full_name || req.user.name || req.user.username;
    }

    let rawRole = fetchedRole || null;
  // Debug: show what we obtained from user-management vs JWT roles
  console.debug('Submission: pre-role-selection state', { userId, fetchedRole, jwtRoles: req.user?.roles });
    if (!rawRole && req.user) {
      // Prefer to scan the roles array and pick the first one that can be normalized
      if (req.user.roles && Array.isArray(req.user.roles) && req.user.roles.length > 0) {
        for (const r of req.user.roles) {
          const candidate = typeof r === 'string' ? r : (r.role || r.name || null);
          const normalizedCandidate = normalizeRole(candidate);
          if (normalizedCandidate) {
            rawRole = candidate;
            break;
          }
        }
        // fallback to the first role if none matched normalization rules
        if (!rawRole) {
          const first = req.user.roles[0];
          rawRole = typeof first === 'string' ? first : (first.role || first.name || null);
        }
      } else if (req.user.role) {
        rawRole = typeof req.user.role === 'string' ? req.user.role : (req.user.role.name || null);
      }
    }

    // Strategy: accept if ANY available role (fetchedRole, JWT roles array, or local assigned roles)
    // normalizes to one of the ALLOWED roles. Prefer fetchedRole -> JWT roles order -> local assigned roles.
    let normalized = null;

    // 1) Try fetched/raw role
    if (rawRole) {
      const n = normalizeRole(rawRole);
      console.debug('Submission: normalizeRole applied to rawRole', { rawRole, normalizedCandidate: n });
      if (n && ALLOWED.includes(n)) normalized = n;
    }

    // 2) Try scanning JWT roles array (prefer any role that normalizes to allowed)
    if (!normalized && req.user && Array.isArray(req.user.roles) && req.user.roles.length > 0) {
      for (const r of req.user.roles) {
        const candidate = typeof r === 'string' ? r : (r.role || r.name || null);
        const n = normalizeRole(candidate);
        if (n && ALLOWED.includes(n)) { normalized = n; break; }
      }
    }

    // 3) Fallback: check local user-management assigned roles
    if (!normalized && userId) {
      try {
        const roleSvc = await import('../../user-management/services/roleService.js');
        const activeRoles = await roleSvc.getActiveUserRoles(userId);
        activeRolesFromLocal = activeRoles;
        console.debug('Submission: activeRoles from roleService.getActiveUserRoles', { userId, activeRoles });
        if (Array.isArray(activeRoles) && activeRoles.length > 0) {
          for (const ar of activeRoles) {
            const candidate = (ar && (ar.role || ar.name)) ? (ar.role || ar.name) : ar;
            const n = normalizeRole(candidate);
            if (n && ALLOWED.includes(n)) { normalized = n; break; }
          }
          if (normalized) {
            console.info('Submission: determined requester_role from local assigned roles', { userId, requester_role: normalized });
          } else {
            console.info('Submission: local assigned roles found but none normalized to allowed', { userId, activeRoles });
          }
        }
      } catch (e) {
        // non-fatal: ignore and continue
        console.error('Error checking local user roles for submission fallback:', e?.message || e);
      }
    }

    const roleCandidates = collectUserRoleCandidates(
      req.user,
      fetchedRole,
      rolesDataFromMgmt,
      activeRolesFromLocal,
    );
    if (normalized) {
      normalized = preferTpaLaboranRequesterRole(normalized, roleCandidates);
    }

  // Assign requester role if normalized and log before/after to debug unexpected missing property
  console.debug('Submission: client snapshot before role assignment', { userId, clientKeys: Object.keys(client), client });
  if (normalized) client.requester_role = normalized;
  // Final debug: show what role we ended up using (or null)
  console.debug('Submission: client snapshot after role assignment', { userId, clientKeys: Object.keys(client), client });
  console.debug('Submission: final role resolution result', { userId, client_role: client.requester_role, normalized });
    if (!client.requester_role) {
      console.error('Submission: enrichment gagal — requester_role masih kosong; req.user:', req.user ? { id: req.user.id, roles: req.user.roles, role: req.user.role } : null);
      return res.status(422).json({ error: 'Gagal menentukan role pemohon. Pastikan token valid dan user memiliki role yang diizinkan.' });
    }
    if (!ALLOWED.includes(client.requester_role)) return res.status(403).json({ error: 'Role tidak diperbolehkan membuat submission' });
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const koasLabErr = await _enrichKoordinatorAsistenSubmissionContext(client, req.user.id);
    if (koasLabErr) return res.status(422).json({ error: koasLabErr });

    let labValue = client.lab;
    if (!labValue || String(labValue).trim() === '') {
      labValue = 'lab integra';
    } else {
      const lc = String(labValue).toLowerCase();
      if (!ALLOWED_LABS.map(x => x.toLowerCase()).includes(lc)) {
        return res.status(400).json({ error: `Lab tidak valid. Pilihan: ${ALLOWED_LABS.join(', ')}` });
      }
      labValue = ALLOWED_LABS.find(x => x.toLowerCase() === lc) || labValue;
    }

    const items = client.items.map(it => {
      const unit = Number(it.unit_price);
      const qty = Number(it.quantity);
      return {
        item_name: it.item_name,
        specification: it.specification || null,
        unit_price: unit,
        quantity: qty,
        total_price: unit * qty,
        urgency_level: it.urgency_level ?? it.urgency ?? null,
        purchase_link: it.purchase_link ?? it.purchaseLink ?? null,
        unit: typeof it.unit === 'string' ? it.unit.trim() || null : null,
        // preserve inventory id if provided (either naming)
        inventory_id: it.inventoryId ?? it.inventory_id ?? null,
      };
    });
    const overall_total = items.reduce((s, it) => s + Number(it.total_price), 0);

  const action = (client.action || 'submit').toLowerCase();
  const status = resolveInitialSubmissionStatus(action, client.requester_role);

    const requester_id = req.user.id;
    const requester_name = client.requester_name || req.user.full_name || req.user.name || req.user.username || null;
    const requester_role = client.requester_role;

    const legacyItem = items.length === 1 ? items[0] : null;
    let masterItemName = null;
    let masterSpecification = null;
    if (items.length === 1) {
      masterItemName = items[0].item_name;
      masterSpecification = items[0].specification || null;
    } else if (items.length > 1) {
      masterItemName = items.map(i => i.item_name).join(' ; ');
      masterSpecification = items.map(i => i.specification || '').join(' ; ');
    }

    let masterQuantityText = null;
    let masterUnitPriceText = null;
    if (items.length === 1) {
      masterQuantityText = String(items[0].quantity);
      masterUnitPriceText = String(items[0].unit_price);
    } else if (items.length > 1) {
      masterQuantityText = items.map(i => i.quantity).join(' ; ');
      masterUnitPriceText = items.map(i => i.unit_price).join(' ; ');
    }

    // Validate study_program_id and lab_id against registration DB if provided
    let resolvedStudyProgramId = null;
    let resolvedLabId = null;
    let resolvedStudyProgramName = null;
    let resolvedLabName = null;

    if (client.study_program_id) {
      try {
        const sp = await registrationDb.query('SELECT id, name FROM study_programs WHERE id = $1 AND (COALESCE((SELECT 1 FROM information_schema.tables WHERE table_name = \'' + "study_programs" + '\'),1)=1) LIMIT 1', [client.study_program_id]);
        // simple check: presence
        if (!sp || !sp.rows || sp.rows.length === 0) {
          return res.status(422).json({ error: 'Invalid study_program_id' });
        }
        resolvedStudyProgramId = sp.rows[0].id;
        resolvedStudyProgramName = sp.rows[0].name || null;
      } catch (e) {
        console.error('Error validating study_program_id:', e?.message || e);
        return res.status(422).json({ error: 'Invalid study_program_id' });
      }
    }

    if (client.lab_id) {
      try {
        const lb = await registrationDb.query('SELECT id, name FROM laboratories WHERE id = $1 LIMIT 1', [client.lab_id]);
        if (!lb || !lb.rows || lb.rows.length === 0) {
          return res.status(422).json({ error: 'Invalid lab_id' });
        }
        resolvedLabId = lb.rows[0].id;
        resolvedLabName = lb.rows[0].name || null;
      } catch (e) {
        console.error('Error validating lab_id:', e?.message || e);
        return res.status(422).json({ error: 'Invalid lab_id' });
      }
    }

    if (isTpaOrLaboranRequesterRole(client.requester_role)) {
      const integra = await resolveLaboratoriumIntegraLab();
      if (!integra) {
        return res.status(422).json({
          error:
            'Laboratorium Integra tidak ditemukan di master data registrasi. Hubungi admin.',
        });
      }
      resolvedLabId = integra.id;
      resolvedLabName = integra.name || 'Laboratorium Integra';
    }

    let submission_reference = null;
    if (status !== 'draft') {
      if (!resolvedLabId) {
        return res.status(422).json({ error: 'Laboratory is required to submit' });
      }
      try {
        submission_reference = await submissionReferenceSvc.allocateSubmissionReferenceTransactional({
          labId: resolvedLabId,
          labName: resolvedLabName || 'lab',
        });
      } catch (refErr) {
        console.error('Failed to allocate submission reference:', refErr?.message || refErr);
        return res.status(500).json({ error: 'Failed to generate submission reference' });
      }
    }

    const payload = {
      requester_name,
      requester_role: client.requester_role,
      requester_id,
      // store canonical IDs only; textual names removed from schema
      study_program_id: resolvedStudyProgramId,
      lab_id: resolvedLabId,
      item_name: masterItemName,
      specification: masterSpecification,
      quantity_text: masterQuantityText,
      unit_price_text: masterUnitPriceText,
      total_price: overall_total,
      purpose: client.purpose || null,
      submission_reference,
      status,
    };

    const created = await svc.create(payload);

    try {
      for (const it of items) {
        const itemStatus = action === 'draft' ? 'draft' : 'pending';
        await svc.createItem(created.id, { ...it, status: itemStatus });
      }
    } catch (itemErr) {
      // Prevent orphan waiting submission when item insertion/stock decrement fails.
      try {
        if (String(status).toLowerCase() === 'waiting' || String(status).toLowerCase() === 'approved_by_tpa') {
          await svc.cancelSubmission(created.id, requester_id);
        } else {
          await procurementDb.query('DELETE FROM procurement_submission_items WHERE submission_id = $1', [created.id]);
          await procurementDb.query('DELETE FROM procurement_submission WHERE id = $1', [created.id]);
        }
      } catch (cleanupErr) {
        console.error('Failed to cleanup partial submission after createItem error:', cleanupErr?.message || cleanupErr);
      }
      throw itemErr;
    }

    const result = await svc.findByIdWithItems(created.id);

    if (shouldAppendInitialSubmissionStatusLog(status)) {
      try {
        await submissionStatusLogSvc.appendStatusLog({
          submissionId: result.id,
          fromStatus: null,
          toStatus: status,
          actorUserId: requester_id,
          actorName: requester_name,
          actorRole: 'requester',
        });
      } catch (logErr) {
        console.error('createSubmission: initial status log failed', logErr?.message || logErr);
      }
    }

    // Return a stable API response envelope expected by the FE
    return res.status(201).json({
      success: true,
      message: 'Submission created',
      data: result,
      status_code: 201
    });
  } catch (err) {
    if (err?.code === 'INSUFFICIENT_STOCK' || err?.code === 'INVENTORY_NOT_FOUND') {
      return res.status(422).json({ error: 'Sorry, the item you requested is out of stock.' });
    }
    if (err?.code === 'INVENTORY_LINK_UNAVAILABLE') {
      return res.status(500).json({ error: 'Inventory linkage is not available. Please contact administrator.' });
    }
    next(err);
  }
}

// GET /stats/dosen-pembina — pending count (approved_by_kordas) for supervised lab (dosen_pembina only)
export async function getDosenPembinaLabStats(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const roleSvc = await import('../../user-management/services/roleService.js');
    const uid = String(req.user.id);
    const hasJwt = _userHasRole(req.user, 'dosen_pembina');
    let hasDb = false;
    try {
      hasDb = await roleSvc.userHasRole(uid, 'dosen_pembina');
    } catch (_) {
      hasDb = false;
    }
    if (!hasJwt && !hasDb) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const data = await svc.getDosenPembinaDashboardStats(uid);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// GET /stats/dosen-pembina/submissions — `approved_by_kordas` queue for supervised lab (after KO)
export async function getDosenPembinaLabSubmissions(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const roleSvc = await import('../../user-management/services/roleService.js');
    const uid = String(req.user.id);
    const hasJwt = _userHasRole(req.user, 'dosen_pembina');
    let hasDb = false;
    try {
      hasDb = await roleSvc.userHasRole(uid, 'dosen_pembina');
    } catch (_) {
      hasDb = false;
    }
    if (!hasJwt && !hasDb) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const payload = await svc.getDosenPembinaLabSubmissionsPayload(uid, { limit, offset });
    const normalized = payload.rows.map(s => {
      const copy = { ...s };
      if (copy.items && typeof copy.items === 'string') {
        try {
          copy.items = JSON.parse(copy.items);
        } catch (e) {
          copy.items = [];
        }
      }
      copy.items = Array.isArray(copy.items) ? copy.items : [];
      copy.status = copy.status ?? null;
      copy.items = copy.items.map(it => ({ ...it, status: it.status ?? null }));
      return copy;
    });

    return res.status(200).json({
      success: true,
      data: normalized,
      meta: {
        page,
        limit,
        count: normalized.length,
        lab_id: payload.lab_id,
        lab_name: payload.lab_name,
        lab_source: payload.lab_source,
        submission_status: 'approved_by_kordas',
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /stats/koordinator-asisten — supervised lab; counts **waiting** (KO inbox, first lab review)
export async function getKoordinatorAsistenLabStats(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const roleSvc = await import('../../user-management/services/roleService.js');
    const uid = String(req.user.id);
    const hasJwt = _userHasRole(req.user, 'koordinator_asisten');
    let hasDb = false;
    try {
      hasDb = await roleSvc.userHasRole(uid, 'koordinator_asisten');
    } catch (_) {
      hasDb = false;
    }
    if (!hasJwt && !hasDb) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const data = await svc.getKoordinatorAsistenDashboardStats(uid);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// GET /stats/koordinator-asisten/submissions — `waiting` queue for KO asisten supervised lab
export async function getKoordinatorAsistenLabSubmissions(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const roleSvc = await import('../../user-management/services/roleService.js');
    const uid = String(req.user.id);
    const hasJwt = _userHasRole(req.user, 'koordinator_asisten');
    let hasDb = false;
    try {
      hasDb = await roleSvc.userHasRole(uid, 'koordinator_asisten');
    } catch (_) {
      hasDb = false;
    }
    if (!hasJwt && !hasDb) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const payload = await svc.getKoordinatorAsistenLabSubmissionsPayload(uid, { limit, offset });
    const normalized = payload.rows.map(s => {
      const copy = { ...s };
      if (copy.items && typeof copy.items === 'string') {
        try {
          copy.items = JSON.parse(copy.items);
        } catch (e) {
          copy.items = [];
        }
      }
      copy.items = Array.isArray(copy.items) ? copy.items : [];
      copy.status = copy.status ?? null;
      copy.items = copy.items.map(it => ({ ...it, status: it.status ?? null }));
      return copy;
    });

    return res.status(200).json({
      success: true,
      data: normalized,
      meta: {
        page,
        limit,
        count: normalized.length,
        lab_id: payload.lab_id,
        lab_name: payload.lab_name,
        lab_source: payload.lab_source,
        submission_status: 'waiting',
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /stats/me - aggregated counts for currently authenticated user's submissions
export async function getUserStats(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user.id;
    try {
      const stats = await svc.getUserStats(userId);
      return res.status(200).json({ success: true, data: stats });
    } catch (e) {
      console.error('getUserStats: svc.getUserStats() failed:', e?.message || e);
      // Try lightweight direct SQL fallback (resilient)
      try {
        const uid = userId == null ? '' : String(userId).trim();
        const sk = svc.SQL_PROCUREMENT_STATUS_KEY;
        const q = `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE ${sk} = 'waiting' OR lower(trim(COALESCE(status, ''))) LIKE '%need%'
          )::int AS waiting,
          COUNT(*) FILTER (WHERE ${sk} = 'ready_to_pickup')::int AS ready_to_pickup,
          COUNT(*) FILTER (WHERE ${sk} = 'rejected')::int AS rejected,
          COUNT(*) FILTER (WHERE ${sk} IN ('draft', 'drafted'))::int AS drafted
        FROM procurement_submission
        WHERE trim(COALESCE(requester_id::text, '')) = $1`;
        const { rows } = await procurementDb.query(q, [uid]);
        const r0 = rows && rows[0] ? rows[0] : {};
        const stats2 = {
          total: Number(r0.total) || 0,
          waiting: Number(r0.waiting) || 0,
          ready_to_pickup: Number(r0.ready_to_pickup) || 0,
          rejected: Number(r0.rejected) || 0,
          drafted: Number(r0.drafted) || 0,
        };
        return res.status(200).json({ success: true, data: stats2 });
      } catch (e2) {
        console.error('getUserStats: direct SQL fallback failed:', e2?.message || e2);
        return res.status(200).json({ success: true, data: { total: 0, waiting: 0, ready_to_pickup: 0, rejected: 0, drafted: 0 } });
      }
    }
  } catch (err) {
    next(err);
  }
}

const updateItemSchema = Joi.object({
  item_name: Joi.string().min(1).optional(),
  specification: Joi.string().allow('', null).optional(),
  unit_price: Joi.number().min(0).optional(),
  quantity: Joi.number().integer().min(1).optional(),
  urgency_level: Joi.string().max(500).allow('', null).optional(),
  purchase_link: Joi.string().uri().allow('', null).optional()
}).or('item_name','specification','unit_price','quantity','urgency_level','purchase_link');

export async function updateSubmissionItem(req, res, next) {
  try {
    const { itemId } = req.params;
    const { error, value } = updateItemSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const item = await svc.getItemById(itemId);
    if (!item) return res.status(404).json({ error: 'Item tidak ditemukan' });

    if (item.status !== 'pending') {
      return res.status(409).json({ error: 'Item tidak dapat diubah karena bukan status pending' });
    }

    const submission = await svc.getSubmissionById(item.submission_id);
    if (!submission) return res.status(404).json({ error: 'Submission terkait tidak ditemukan' });

    if (String(submission.requester_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Anda tidak berwenang mengubah item ini' });
    }

    const newUnit = (value.unit_price !== undefined) ? Number(value.unit_price) : Number(item.unit_price);
    const newQty = (value.quantity !== undefined) ? Number(value.quantity) : Number(item.quantity);
    const newTotal = newUnit * newQty;

    const updated = await svc.updateItem(itemId, {
      item_name: value.item_name ?? item.item_name,
      specification: value.specification ?? item.specification,
      unit_price: newUnit,
      quantity: newQty,
      total_price: newTotal,
      urgency_level: value.urgency_level ?? item.urgency_level ?? null,
      purchase_link: value.purchase_link ?? item.purchase_link ?? null
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// DELETE single item
export async function deleteSubmissionItem(req, res, next) {
  try {
    const { itemId } = req.params;
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const item = await svc.getItemById(itemId);
    if (!item) return res.status(404).json({ error: 'Item tidak ditemukan' });

    // service enforces ownership and pending status
    try {
      const deleted = await svc.deleteItem(itemId, req.user.id);
      if (!deleted) return res.status(404).json({ error: 'Item tidak ditemukan' });
      return res.status(200).json({ success: true, data: deleted });
    } catch (e) {
      if (e.code === 'NOT_PENDING') return res.status(409).json({ error: 'Item tidak dapat dihapus karena bukan status pending' });
      if (e.code === 'FORBIDDEN') return res.status(403).json({ error: 'Anda tidak berwenang menghapus item ini' });
      throw e;
    }
  } catch (err) {
    next(err);
  }
}

// PUT /:id — update a submission that is still in 'draft' status (requester only)
export async function updateSubmission(req, res, next) {
  try {
    const { id } = req.params;
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const updateSchema = Joi.object({
      study_program_id: Joi.string().guid({ version: ['uuidv4','uuidv5','uuidv1','uuidv3'] }).allow(null).optional(),
      lab_id: Joi.string().guid({ version: ['uuidv4','uuidv5','uuidv1','uuidv3'] }).allow(null).optional(),
      purpose: Joi.string().allow('', null).optional(),
      items: Joi.array().items(
        Joi.object({
          item_name: Joi.string().min(1).required(),
          specification: Joi.string().allow('', null).optional(),
          quantity: Joi.number().integer().min(1).required(),
          unit_price: Joi.number().min(0).required(),
          urgency_level: Joi.string().max(500).allow('', null),
          purchase_link: Joi.string().uri().allow('', null),
          unit: Joi.string().max(64).allow('', null),
          inventoryId: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
          inventory_id: Joi.alternatives().try(Joi.string(), Joi.number()).optional()
        })
      ).min(1).optional()
    });

    const { error, value } = updateSchema.validate(req.body, { allowUnknown: false, stripUnknown: true });
    if (error) return res.status(400).json({ error: error.message });
    if (Array.isArray(value.items)) {
      const unitPriceErr = validateItemUnitPrices(value.items);
      if (unitPriceErr) return res.status(400).json({ error: unitPriceErr });
    }

    try {
      const updated = await svc.updateDraftSubmission(id, req.user.id, value);
      if (!updated) return res.status(404).json({ error: 'Submission tidak ditemukan' });
      return res.status(200).json({ success: true, data: updated });
    } catch (e) {
      if (e.code === 'FORBIDDEN') return res.status(403).json({ error: 'Anda tidak berwenang mengubah submission ini' });
      if (e.code === 'NOT_DRAFT') return res.status(409).json({ error: 'Hanya submission berstatus draft yang dapat diedit' });
      throw e;
    }
  } catch (err) {
    next(err);
  }
}

// DELETE whole submission
export async function deleteSubmission(req, res, next) {
  try {
    const { id } = req.params;
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const submission = await svc.getSubmissionById(id);
    if (!submission) return res.status(404).json({ error: 'Submission tidak ditemukan' });

    try {
      const deleted = await svc.deleteSubmission(id, req.user.id);
      if (!deleted) return res.status(404).json({ error: 'Submission tidak ditemukan' });
      return res.status(200).json({ success: true, data: deleted });
    } catch (e) {
      if (e.code === 'NOT_PENDING_ITEMS') return res.status(409).json({ error: 'Tidak dapat menghapus submission karena beberapa item bukan status pending' });
      if (e.code === 'FORBIDDEN') return res.status(403).json({ error: 'Anda tidak berwenang menghapus submission ini' });
      throw e;
    }
  } catch (err) {
    next(err);
  }
}

// POST /:id/cancel - cancel a waiting submission by the requester
export async function cancelSubmission(req, res, next) {
  try {
    const { id } = req.params;
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const submission = await svc.getSubmissionById(id);
    if (!submission) return res.status(404).json({ error: 'Submission tidak ditemukan' });

    try {
      const cancelled = await svc.cancelSubmission(id, req.user.id);
      return res.status(200).json({ success: true, message: 'Submission cancelled', data: cancelled });
    } catch (e) {
      if (e.code === 'FORBIDDEN') return res.status(403).json({ error: 'Anda tidak berwenang membatalkan submission ini' });
      if (e.code === 'NOT_CANCELLABLE') return res.status(409).json({ error: 'Submission tidak dapat dibatalkan pada status saat ini' });
      throw e;
    }
  } catch (err) {
    next(err);
  }
}

// GET current user's submissions (paginated)
export async function getMySubmissions(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    // Default page size 10 per request
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    // allow optional status filter: ?status=draft|waiting|submitted|on_review
    const status = req.query.status ? String(req.query.status).toLowerCase() : null;

    const submissions = await svc.getSubmissionsByRequester(req.user.id, { limit, offset, status });

    // Ensure items is an array (pg may return JSON as string depending on driver config)
    const normalized = submissions.map(s => {
      const copy = { ...s };
      if (copy.items && typeof copy.items === 'string') {
        try { copy.items = JSON.parse(copy.items); } catch (e) { copy.items = []; }
      }
      // ensure statuses exist on submission and items (they come from DB)
      copy.status = copy.status ?? null;
      copy.items = Array.isArray(copy.items) ? copy.items : [];
      return copy;
    });

    return res.status(200).json({ success: true, data: normalized, meta: { page, limit, count: normalized.length } });
  } catch (err) {
    next(err);
  }
}

// GET /:id - get single submission by id (owner or TPA)
export async function getSubmissionById(req, res, next) {
  try {
    const { id } = req.params;
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const submission = await svc.findByIdWithItems(id);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    // Debug: log brief request context to help diagnose Kaprodi 403s
    try {
      console.info('getSubmissionById: request', {
        user: { id: req.user?.id, role: req.user?.role, roles: req.user?.roles },
        query: req.query,
        submissionId: id,
      });
    } catch (_) {}

    // allow owner or TPA role to view
    if (String(submission.requester_id) !== String(req.user.id) && !_userHasRole(req.user, 'tpa')) {
      const st = _normalizeProcurementStatusKey(submission.status);

      const finPropMode = String(submission.financial_proposal_signing_mode ?? '').trim();
      const isReimbTerminal = st === 'completed' || st === 'closed';
      const isFinPropFlow = isReimbTerminal && finPropMode !== '';
      const justifMode = String(submission.justification_signing_mode ?? '').trim();
      const isJustifFlow =
        isReimbTerminal &&
        justifMode !== '' &&
        justifSigningSvc.submissionMeetsJustificationThreshold(submission);

      if (isFinPropFlow || isJustifFlow) {
        const isKaur =
          (await _userIsKaurLab(req)) ||
          _userHasRole(req.user, 'kaur_lab') ||
          _userHasRole(req.user, 'kaur');
        const isKaprodi =
          (await _userIsKaprodi(req)) || _userHasRole(req.user, 'kaprodi');
        const userSp =
          req.query?.study_program_id ||
          req.query?.studyProgramId ||
          (await _resolveKaprodiUserStudyProgramId(req)) ||
          req.user?.study_program_id ||
          req.user?.studyProgramId ||
          submission.study_program_id ||
          submission.studyProgramId ||
          null;
        let mayView = false;
        if (isFinPropFlow) {
          mayView = await finPropSigningSvc.userMayViewFinancialProposalSubmission(
            req,
            submission,
            id,
            { isKaur, isKaprodi, kaprodiStudyProgramId: userSp },
          );
        }
        if (!mayView && isJustifFlow) {
          mayView = await justifSigningSvc.userMayViewJustificationSubmission(
            req,
            submission,
            id,
            { isKaur, isKaprodi, kaprodiStudyProgramId: userSp },
          );
        }
        if (!mayView) return res.status(403).json({ error: 'Forbidden' });
      }
      // Kaur Lab: procurement review queue OR completed financial proposal signing
      else if ((await _userIsKaurLab(req)) || _userHasRole(req.user, 'kaur_lab') || _userHasRole(req.user, 'kaur')) {
        const kaurOk = st === 'approved_by_tpa';
        if (!kaurOk) return res.status(403).json({ error: 'Forbidden' });
      }
      // Kaprodi: procurement review OR completed financial proposal signing
      else if ((await _userIsKaprodi(req)) || _userHasRole(req.user, 'kaprodi')) {
        const kaprodiProcurementOk = st === 'approved_by_kaur' || st === 'approved_by_kaprodi';
        if (!kaprodiProcurementOk) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        // Ensure kaprodi only sees submissions from their own study program.
        // Allow frontend to pass study_program_id as a query fallback when JWT lacks it.
        // Try to determine the Kaprodi's study program from multiple sources:
        // 1) query params (frontend may send resolved prodi)
        // 2) JWT claims (if present)
        // 3) server-side lookup to user-management profile as a fallback
        let userSp =
          req.query?.study_program_id ||
          req.query?.studyProgramId ||
          (await _resolveKaprodiUserStudyProgramId(req)) ||
          req.user?.study_program_id ||
          req.user?.studyProgramId ||
          req.user?.prodi_id ||
          req.user?.prodi ||
          null;

        const subSp =
          submission.study_program_id ||
          submission.studyProgramId ||
          submission.prodi_id ||
          (submission.study_program &&
            (submission.study_program.id || submission.study_program._id)) ||
          submission.prodi ||
          null;

        if (!userSp) {
          try {
            const headers = {};
            if (req.headers && req.headers.authorization) {
              headers.Authorization = req.headers.authorization;
            }
            const profileRes = await axios.get(
              `${USER_MGMT_URL}/api/user-management/users/${req.user.id}/profile`,
              { headers },
            );
            const profileData = profileRes?.data?.data ?? profileRes?.data ?? null;
            userSp =
              profileData?.profile?.study_program_id ||
              profileData?.profile?.prodi_id ||
              profileData?.study_program_id ||
              profileData?.prodi_id ||
              profileData?.profile?.study_program?.id ||
              profileData?.study_program?.id ||
              userSp ||
              null;
          } catch (e) {
            try {
              console.info('getSubmissionById: failed to fetch profile for kaprodi fallback', {
                err: e?.message || e,
                userId: req.user?.id,
              });
            } catch (_) {}
          }
        }

        if (!userSp || !subSp || String(userSp) !== String(subSp)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      } else if ((await _userIsDosenPembina(req)) || (await _userIsKoordinatorAsisten(req))) {
        const resolved = await svc.resolveDosenPembinaLabContext(String(req.user.id));
        if (!resolved.labId || String(submission.lab_id ?? '') !== String(resolved.labId)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }
      // otherwise forbidden
      else {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    // Normalize items and statuses
    const copy = { ...submission };
    copy.items = Array.isArray(copy.items) ? copy.items : [];
    copy.status = copy.status ?? null;
    copy.items = copy.items.map(it => ({ ...it, status: it.status ?? null }));

    // Attach proposal-file metadata so requester/TPA detail view can show availability
    const proposalMeta = await submissionProposalSvc.getProposalMetaBySubmissionId(id);
    copy.proposal_file = proposalMeta;
    copy.has_proposal_file = !!proposalMeta;

    const wetDocs = await reimbursementWetDocSvc.listWetDocumentMetaBySubmissionId(id);
    copy.reimbursement_wet_documents = wetDocs;
    copy.has_financial_proposal_wet_document =
      !!wetDocs[reimbursementWetDocSvc.WET_DOC_FINANCIAL_PROPOSAL];
    copy.has_justification_wet_document =
      !!wetDocs[reimbursementWetDocSvc.WET_DOC_JUSTIFICATION];
    copy.has_reimbursement_bast_document = !!wetDocs[reimbursementWetDocSvc.WET_DOC_BAST];

    return res.status(200).json({ success: true, data: copy });
  } catch (err) {
    next(err);
  }
}

// GET /:id/timeline — status history for requester (owner only)
export async function getSubmissionTimeline(req, res, next) {
  try {
    const { id } = req.params;
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const submission = await svc.findByIdWithItems(id);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    if (String(submission.requester_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const events = await submissionStatusLogSvc.buildSubmissionTimeline(submission);
    return res.status(200).json({
      success: true,
      data: {
        submission_id: submission.id,
        purpose: submission.purpose || null,
        submission_reference: submission.submission_reference || null,
        current_status: submission.status || null,
        events,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function _userIsDosenPembina(req) {
  if (!req.user?.id) return false;
  if (_userHasRole(req.user, 'dosen_pembina')) return true;
  try {
    const roleSvc = await import('../../user-management/services/roleService.js');
    return await roleSvc.userHasRole(String(req.user.id), 'dosen_pembina');
  } catch {
    return false;
  }
}

async function _userIsKoordinatorAsisten(req) {
  if (!req.user?.id) return false;
  if (_userHasRole(req.user, 'koordinator_asisten')) return true;
  try {
    const roleSvc = await import('../../user-management/services/roleService.js');
    return await roleSvc.userHasRole(String(req.user.id), 'koordinator_asisten');
  } catch {
    return false;
  }
}

/** Koordinator asisten: may approve/reject when submission is `waiting` in supervised lab (first lab review). */
async function _koordinatorAsistenCanActOnWaitingInLab(req, submission) {
  if (!submission) return false;
  const st = String(submission.status ?? '').trim().toLowerCase();
  if (st !== 'waiting') return false;
  if (!(await _userIsKoordinatorAsisten(req))) return false;
  const resolved = await svc.resolveDosenPembinaLabContext(String(req.user.id));
  if (!resolved.labId) return false;
  return String(submission.lab_id ?? '') === String(resolved.labId);
}

/** Koordinator asisten submit: lab + study program from supervised laboratory assignment. */
async function _enrichKoordinatorAsistenSubmissionContext(client, userId) {
  if (client.requester_role !== 'koordinator_asisten') return null;
  const resolved = await svc.resolveDosenPembinaLabContext(String(userId));
  if (!resolved.labId) {
    return 'Laboratorium supervised belum diatur pada profil Anda. Hubungi laboran/TPA untuk penugasan laboratory.';
  }
  client.lab_id = resolved.labId;
  try {
    const lb = await registrationDb.query(
      'SELECT id, name, study_program_id FROM laboratories WHERE id = $1 LIMIT 1',
      [resolved.labId],
    );
    if (!lb?.rows?.length) {
      return 'Laboratorium supervised tidak ditemukan.';
    }
    if (lb.rows[0].study_program_id) {
      client.study_program_id = lb.rows[0].study_program_id;
    }
  } catch (e) {
    console.error('_enrichKoordinatorAsistenSubmissionContext: laboratory lookup failed', e?.message || e);
    return 'Gagal memuat data laboratorium supervised.';
  }
  return null;
}

/** Dosen pembina: act on submissions **approved_by_kordas** in supervised lab (after KO). */
async function _dosenPembinaCanActOnApprovedByKordasInLab(req, submission) {
  if (!submission) return false;
  const st = String(submission.status ?? '').trim().toLowerCase();
  if (st !== 'approved_by_kordas') return false;
  if (!(await _userIsDosenPembina(req))) return false;
  const resolved = await svc.resolveDosenPembinaLabContext(String(req.user.id));
  if (!resolved.labId) return false;
  return String(submission.lab_id ?? '') === String(resolved.labId);
}

/** Reject: KO on `waiting` in lab, or dosen pembina on `approved_by_kordas` in lab. */
async function _supervisedLabReviewerCanReject(req, submission) {
  if (await _koordinatorAsistenCanActOnWaitingInLab(req, submission)) return true;
  if (await _dosenPembinaCanActOnApprovedByKordasInLab(req, submission)) return true;
  return false;
}

/** Match Flutter `Procurement*ReviewScreen._workflowStatusKey` (spaces/hyphens → underscores). */
function _normalizeProcurementStatusKey(raw) {
  let t = String(raw ?? '').trim().toLowerCase();
  t = t.replace(/[\s\-–—]+/g, '_');
  while (t.includes('__')) t = t.replace(/__/g, '_');
  return t;
}

async function _userIsKaurLab(req) {
  if (!req.user?.id) return false;
  if (_userHasRole(req.user, 'kaur_lab') || _userHasRole(req.user, 'kaur')) return true;
  try {
    const roleSvc = await import('../../user-management/services/roleService.js');
    const uid = String(req.user.id);
    return (await roleSvc.userHasRole(uid, 'kaur_lab')) || (await roleSvc.userHasRole(uid, 'kaur'));
  } catch {
    return false;
  }
}

/** Kaur Lab: normal at approved_by_tpa, or after laboran pass at approved_by_kaur (not signed yet). */
async function _kaurLabCanActWhileApprovedByTpa(req, submission) {
  if (!submission) return false;
  if (!(await _userIsKaurLab(req))) return false;
  const st = _normalizeProcurementStatusKey(submission.status);
  const sig = (submission.kaur_lab_signature ?? '').toString().trim();
  if (sig) return false;
  if (st === 'approved_by_tpa') return true;
  if (st === 'approved_by_kaur' && (await laboranPassSvc.hasPassLog(submission.id, 'kaur'))) {
    return true;
  }
  return false;
}

function _userHasRole(user, roleName) {
  if (!user) return false;
  const rn = String(roleName).toLowerCase().trim();
  const normalize = (value) => {
    const s = String(value).toLowerCase().trim();
    if (s === 'kaur' || s === 'kaur-lab' || s === 'kaur lab') return 'kaur_lab';
    return s;
  };
  if (user.role && normalize(user.role) === normalize(rn)) return true;
  if (Array.isArray(user.roles) && user.roles.length > 0) {
    return user.roles.some(r => {
      if (!r) return false;
      if (typeof r === 'string') return normalize(r) === normalize(rn);
      const v = r.role || r.name || r.code || null;
      return v && normalize(v) === normalize(rn);
    });
  }
  return false;
}

async function _resolveKaprodiUserStudyProgramId(req) {
  if (!req.user?.id) return null;
  let userSp = req.query?.study_program_id || req.query?.studyProgramId || req.user?.study_program_id || req.user?.studyProgramId || req.user?.prodi_id || req.user?.prodi || null;
  if (!userSp) {
    try {
      const headers = {};
      if (req.headers && req.headers.authorization) headers.Authorization = req.headers.authorization;
      const profileRes = await axios.get(`${USER_MGMT_URL}/api/user-management/users/${req.user.id}/profile`, { headers });
      const profileData = profileRes?.data?.data ?? profileRes?.data ?? null;
      userSp = profileData?.profile?.study_program_id || profileData?.profile?.prodi_id || profileData?.study_program_id || profileData?.prodi_id || profileData?.profile?.study_program?.id || profileData?.study_program?.id || userSp || null;
    } catch (e) {
      try { console.info('kaprodi: failed to fetch profile for study program', { err: e?.message || e, userId: req.user?.id }); } catch (_) {}
    }
  }
  return userSp || null;
}

function _submissionStudyProgramIdForKaprodi(submission, req) {
  if (!submission) return null;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const fromBody = body.study_program_id || body.studyProgramId || null;
  return submission.study_program_id || submission.studyProgramId || submission.prodi_id || (submission.study_program && (submission.study_program.id || submission.study_program._id)) || submission.prodi || req.query?.study_program_id || req.query?.studyProgramId || fromBody || null;
}

async function _userIsKaprodi(req) {
  if (!req.user?.id) return false;
  if (_userHasRole(req.user, 'kaprodi')) return true;
  try {
    const roleSvc = await import('../../user-management/services/roleService.js');
    return await roleSvc.userHasRole(String(req.user.id), 'kaprodi');
  } catch {
    return false;
  }
}

async function _kaprodiOwnsSubmissionStudyProgram(req, submission) {
  if (!(await _userIsKaprodi(req))) return false;
  const userSp = await _resolveKaprodiUserStudyProgramId(req);
  const subSp = _submissionStudyProgramIdForKaprodi(submission, req);
  return !!(userSp && subSp && String(userSp) === String(subSp));
}

/** Kaprodi: approved_by_kaur (normal or laboran bypass) or approved_by_kaprodi after laboran pass. */
async function _kaprodiCanSaveSignatureWhileApprovedByKaur(req, submission) {
  if (!submission) return false;
  if (!(await _kaprodiOwnsSubmissionStudyProgram(req, submission))) return false;
  const st = _normalizeProcurementStatusKey(submission.status);
  const kapSig = (submission.kaprodi_signature ?? '').toString().trim();
  if (kapSig) return false;
  if (st === 'approved_by_kaur') return true;
  if (st === 'approved_by_kaprodi' && (await laboranPassSvc.hasPassLog(submission.id, 'kaprodi'))) {
    return true;
  }
  return false;
}

// GET all submissions for TPA role
export async function getAllSubmissionsForTPA(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'tpa')) return res.status(403).json({ error: 'Forbidden' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const status = req.query.status != null && String(req.query.status).trim() !== '' ? String(req.query.status) : null;
    const studyProgramId = req.query.study_program_id || req.query.studyProgramId || null;
    const labId = req.query.lab_id || req.query.labId || null;
    const q = req.query.q || req.query.search || null;

    const { rows: submissions, total } = await svc.getAllSubmissions({
      limit,
      offset,
      status,
      studyProgramId,
      labId,
      q,
      tpaPipelineList: true,
    });

    let normalized = submissions.map(s => {
      const copy = { ...s };
      if (copy.items && typeof copy.items === 'string') {
        try { copy.items = JSON.parse(copy.items); } catch (e) { copy.items = []; }
      }
      copy.items = Array.isArray(copy.items) ? copy.items : [];
      copy.status = copy.status ?? null;
      // ensure item statuses exist
      copy.items = copy.items.map(it => ({ ...it, status: it.status ?? null }));
      return copy;
    });

    normalized = await vendorPurchaseSvc.attachVendorPurchaseFlags(normalized);

    return res.status(200).json({
      success: true,
      data: normalized,
      meta: { page, limit, count: normalized.length, total }
    });
  } catch (err) {
    next(err);
  }
}

// GET /stats - aggregated counts for TPA dashboard
export async function getTpaStats(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'tpa')) return res.status(403).json({ error: 'Forbidden' });

    const stats = await svc.getTpaStats();
    return res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

// GET /stats/kaur-lab - aggregated counts for Kaur Lab dashboard
export async function getKaurLabStats(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'kaur_lab') && !_userHasRole(req.user, 'kaur')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const stats = await svc.getKaurLabStats();
    return res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

// GET /stats/kaur-lab/submissions - list submissions approved by TPA for Kaur Lab
export async function getKaurLabApprovedSubmissions(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'kaur_lab') && !_userHasRole(req.user, 'kaur')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const rows = await svc.getKaurLabApprovedSubmissions({ limit, offset });
    return res.status(200).json({ success: true, data: rows, meta: { page, limit, count: rows.length } });
  } catch (err) {
    next(err);
  }
}

// GET /stats/kaprodi - aggregated counts for Kaprodi dashboard (by study program)
export async function getKaprodiStats(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'kaprodi')) return res.status(403).json({ error: 'Forbidden' });

  // Allow frontend to pass study program id as query parameter as a fallback
  // This helps environments where the JWT doesn't contain study_program info
  const spId = req.query?.study_program_id || req.query?.studyProgramId || req.user.study_program_id || req.user.studyProgramId || req.user.prodi_id || null;
    const stats = await svc.getKaprodiStats(spId);
    return res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

// GET /stats/kaprodi/submissions - list submissions approved by Kaur for Kaprodi's study program
export async function getKaprodiApprovedSubmissions(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'kaprodi')) return res.status(403).json({ error: 'Forbidden' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
    const offset = (page - 1) * limit;

    // Allow frontend to pass study program id as query parameter as a fallback
    // This helps when JWT doesn't contain study_program info or frontend resolved it.
    const spId = req.query?.study_program_id || req.query?.studyProgramId || req.user.study_program_id || req.user.studyProgramId || req.user.prodi_id || null;
    // debug log for tracing which study program id was used
    try { console.info('getKaprodiApprovedSubmissions: resolved spId=', spId); } catch (_) {}

    const rows = await svc.getKaprodiApprovedSubmissions({ studyProgramId: spId, limit, offset });
    return res.status(200).json({ success: true, data: rows, meta: { page, limit, count: rows.length } });
  } catch (err) {
    next(err);
  }
}

// Public stats endpoint used for development/testing. Returns same data as
// getTpaStats but only allowed when NODE_ENV !== 'production'. This lets the
// frontend fetch counts when running locally without a TPA JWT. In production
// this will return 403 to avoid exposing internal counts.
export async function getTpaStatsPublic(req, res, next) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }
    // Attempt using service first (may perform richer logic). If it fails
    // (DB/timeouts/migrations), fall back to a minimal, resilient SQL query
    // to produce the same counts in a lightweight manner.
    try {
      const stats = await svc.getTpaStats();
      return res.status(200).json({ success: true, data: stats });
    } catch (e) {
      // Log and try lightweight direct SQL as fallback
      console.warn('getTpaStatsPublic: svc.getTpaStats() failed, attempting direct query fallback', e?.message || e);
      try {
        const sk = svc.SQL_PROCUREMENT_STATUS_KEY;
        const q = `SELECT
          COUNT(*) FILTER (WHERE ${sk} = 'approved_by_kaprodi')::int AS need_process,
          COUNT(*) FILTER (
            WHERE ${sk} = 'approved_by_dosen_pembina' OR lower(trim(COALESCE(status, ''))) LIKE '%need%'
          )::int AS need_review,
          COUNT(*) FILTER (WHERE ${sk} IN ('on_review', 'on_going', 'ongoing'))::int AS on_review,
          COUNT(*) FILTER (WHERE ${sk} = 'ready_to_pickup')::int AS ready_to_pickup,
          COUNT(*) FILTER (WHERE ${sk} = 'completed')::int AS process_reimbursement
        FROM procurement_submission
        WHERE ${sk} NOT IN ('draft', 'drafted', 'closed')`;
        const { rows } = await procurementDb.query(q);
        const r0 = rows && rows[0] ? rows[0] : {};
        const stats2 = {
          need_process: Number(r0.need_process) || 0,
          need_review: Number(r0.need_review) || 0,
          on_review: Number(r0.on_review) || 0,
          ready_to_pickup: Number(r0.ready_to_pickup) || 0,
          process_reimbursement: Number(r0.process_reimbursement) || 0,
        };
        return res.status(200).json({ success: true, data: stats2 });
      } catch (e2) {
        console.error('getTpaStatsPublic: direct SQL fallback also failed:', e2?.message || e2);
        // Return safe default rather than throwing so frontend can handle gracefully
        return res.status(200).json({
          success: true,
          data: { need_process: 0, need_review: 0, on_review: 0, ready_to_pickup: 0, process_reimbursement: 0 },
        });
      }
    }
  } catch (err) {
    next(err);
  }
}

// POST /:id/set-funding - set funding choice on a submission
export async function setFundingChoice(req, res, next) {
  try {
    const { id } = req.params;
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    // Only TPA or Kaprodi or requester can set funding choice depending on policy (allow requester & tpa for now)
    const allowed = _userHasRole(req.user, 'tpa') || _userHasRole(req.user, 'kaur') || String(req.user.id) === String((await submissionSvc.getSubmissionById(id))?.requester_id);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const schema = Joi.object({ funding_choice: Joi.string().valid('program_fund','reimburse').required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    // delegate to service to persist (service will adapt to DB schema availability)
    const updated = await submissionSvc.setFundingChoice(id, value.funding_choice, req.user.id);
    if (!updated) return res.status(404).json({ error: 'Submission not found' });

    return res.status(200).json({ success: true, message: 'Funding choice saved', data: updated });
  } catch (err) {
    next(err);
  }
}

// POST /items/:itemId/verify (TPA only)
export async function verifyItem(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'tpa')) return res.status(403).json({ error: 'Forbidden' });

    const { itemId } = req.params;
    const result = await svc.verifyItem(itemId, req.user.id);
    if (!result) return res.status(404).json({ error: 'Item not found' });

    // If service returned an updated submission (promoted), notify requester (best-effort)
    if (result.submission) {
      const sub = result.submission;
      // fire-and-forget, do not block response. If notify returns a promise, attach a catch.
      try {
        const maybeP = notificationSvc.notifySubmissionStatusChange(sub.id, sub.requester_id, 'submitted', sub.status, { triggeredBy: req.user.id }, req.user.id);
        if (maybeP && typeof maybeP.then === 'function') maybeP.catch(() => {});
      } catch (e) {
        // swallow
      }
    }

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    if (err && err.status === 409) return res.status(409).json({ error: err.message });
    next(err);
  }
}

async function _enrichSubmissionLabelsForPdf(submission) {
  const copy = { ...submission };
  try {
    if (copy.study_program_id) {
      const r = await registrationDb.query('SELECT name FROM study_programs WHERE id = $1 LIMIT 1', [copy.study_program_id]);
      if (r.rows[0]?.name) copy._study_program_name = r.rows[0].name;
    }
  } catch (e) {
    try { console.warn('_enrichSubmissionLabelsForPdf: study_program', e?.message || e); } catch (_) {}
  }
  try {
    if (copy.lab_id) {
      const r = await registrationDb.query('SELECT name FROM laboratories WHERE id = $1 LIMIT 1', [copy.lab_id]);
      if (r.rows[0]?.name) copy._laboratory_name = r.rows[0].name;
    }
  } catch (e) {
    try { console.warn('_enrichSubmissionLabelsForPdf: laboratory', e?.message || e); } catch (_) {}
  }
  return copy;
}

/** PDF proposal: nama & NIP/NIM dari kolom snapshot DB (diisi saat POST tanda tangan). */
function _mergeJwtSignerSnapshot(submission, nameCol, nipCol) {
  const jn = submission[nameCol] != null ? String(submission[nameCol]).trim() : '';
  const jnip = submission[nipCol] != null ? String(submission[nipCol]).trim() : '';
  return {
    name: jn,
    nipnim: _trimNipnimSnapshot(jnip),
  };
}

/**
 * Snapshot kolom *_signer_* saat POST tanda tangan.
 * Utama: gateway GET /jwt/payload; fallback: klaim JWT request (employee.nip / student_detail.nim).
 *
 * @param {{ roleHint?: 'employee' | 'student' }} [options]
 */
async function _signerDisplayForSignatureSave(req, options = {}) {
  const token = _extractBearerTokenString(req);
  const gw = await fetchGatewayJwtPayloadClaims(token);
  let name = gw.name ? String(gw.name).trim() : '';
  let nipnim = _trimNipnimSnapshot(gw.nipnim || '');

  if (!name || !nipnim) {
    const u = _jwtUserForSignerSnapshot(req);
    if (!name) name = displayNameFromJwtPayload(u);
    if (!nipnim) {
      const hint = options.roleHint;
      if (hint === 'student') nipnim = _trimNipnimSnapshot(nimFromStudentDetailJwtPayload(u));
      else if (hint === 'employee') nipnim = _trimNipnimSnapshot(nipFromEmployeeJwtPayload(u));
      else nipnim = _trimNipnimSnapshot(nipOrNimFromJwtPayload(u));
    }
  }

  const out = { name, nipnim };
  if (process.env.PROCUREMENT_DEBUG_SIGNER_JWT === '1') {
    try {
      console.info('[procurement] signer snapshot', {
        nameLen: (out.name || '').length,
        nipnimLen: (out.nipnim || '').length,
        gatewayStatus: gw.status,
        gatewayError: gw.error || null,
        roleHint: options.roleHint || null,
      });
    } catch (_) {}
  }
  return out;
}

/** TTD fields may live on root or nested `profile` (GET /users/:id/profile response). */
function _profileTtdFields(profileData) {
  if (!profileData) {
    return { ttd: null, ttd_file_path: null, ttd_url: null };
  }
  const nested =
    profileData.profile && typeof profileData.profile === 'object'
      ? profileData.profile
      : null;
  return {
    ttd: profileData.ttd ?? nested?.ttd ?? profileData.signature ?? null,
    ttd_file_path: profileData.ttd_file_path ?? nested?.ttd_file_path ?? null,
    ttd_url: profileData.ttd_url ?? nested?.ttd_url ?? null,
  };
}

function _readLocalTtdFileAsDataUri(relativePath) {
  const raw = String(relativePath || '').trim();
  if (!raw) return '';
  const candidates = new Set();
  if (path.isAbsolute(raw)) {
    candidates.add(raw);
  } else {
    candidates.add(path.join(process.cwd(), raw));
    const stripped = raw.replace(/^\/+/, '');
    candidates.add(path.join(process.cwd(), stripped));
    if (!stripped.startsWith('uploads/')) {
      candidates.add(path.join(process.cwd(), 'uploads', stripped.replace(/^uploads\//, '')));
    }
  }
  for (const abs of candidates) {
    try {
      if (!fs.existsSync(abs)) continue;
      const buf = fs.readFileSync(abs);
      const ext = path.extname(abs).toLowerCase();
      const mime =
        ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.pdf'
            ? 'application/pdf'
            : 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (e) {
      try {
        console.warn('_readLocalTtdFileAsDataUri: failed', abs, e?.message || e);
      } catch (_) {}
    }
  }
  return '';
}

async function _fetchTtdUrlAsDataUri(ttdUrl, authHeaders = {}) {
  const rel = String(ttdUrl || '').trim();
  if (!rel) return '';
  const port = process.env.PORT || 3000;
  const bases = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    String(process.env.API_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, ''),
    String(process.env.USER_MGMT_URL || 'http://user-management:3000').replace(/\/$/, ''),
  ].filter((b) => b && b !== 'http://' && b !== 'https://');
  const urlPath = rel.startsWith('http') ? rel : rel.startsWith('/') ? rel : `/${rel}`;
  const hdrs = { ...(authHeaders || {}) };
  const tryGet = async (url, extraHdrs = {}) => {
    const res = await axios.get(url, {
      headers: { ...hdrs, ...extraHdrs },
      timeout: 15000,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });
    if (res.status < 200 || res.status >= 300 || !res.data) return '';
    const buf = Buffer.from(res.data);
    const ct = String(res.headers['content-type'] || 'image/png').split(';')[0].trim();
    return `data:${ct};base64,${buf.toString('base64')}`;
  };
  try {
    if (rel.startsWith('http')) return await tryGet(rel);
    for (const base of bases) {
      const uri = await tryGet(`${base}${urlPath}`);
      if (uri) return uri;
    }
    if (process.env.USER_MGMT_INTERNAL_TOKEN && bases[0]) {
      const uri = await tryGet(`${bases[0]}${urlPath}`, {
        Authorization: `Bearer ${process.env.USER_MGMT_INTERNAL_TOKEN}`,
      });
      if (uri) return uri;
    }
  } catch (e) {
    try {
      console.warn('_fetchTtdUrlAsDataUri:', rel, e?.message || e);
    } catch (_) {}
  }
  return '';
}

async function _dataUriFromProfileTtd(profileData, authHeaders = {}) {
  if (!profileData) return '';
  const { ttd, ttd_file_path, ttd_url } = _profileTtdFields(profileData);
  if (ttd) {
    const s = String(ttd).trim();
    if (s.startsWith('data:')) return s;
    if (s.length > 40) return `data:image/png;base64,${s.replace(/\s+/g, '')}`;
  }
  if (ttd_file_path) {
    const fromFile = _readLocalTtdFileAsDataUri(ttd_file_path);
    if (fromFile) return fromFile;
  }
  if (ttd_url) {
    const fromUrl = await _fetchTtdUrlAsDataUri(ttd_url, authHeaders);
    if (fromUrl) return fromUrl;
    const fromUrlPath = _readLocalTtdFileAsDataUri(ttd_url);
    if (fromUrlPath) return fromUrlPath;
  }
  return '';
}

/** Build API-shaped object so `_profileTtdFields` reads nested `profile.*`. */
function _wrapDbProfileRowForTtd(row) {
  if (!row) return null;
  const filePath = row.ttd_file_path ? String(row.ttd_file_path).trim() : null;
  const urlPath = filePath ? `/${filePath.replace(/\\/g, '/').replace(/^\/+/, '')}` : null;
  return {
    ttd: row.ttd ?? null,
    ttd_file_path: filePath,
    ttd_url: urlPath,
    profile: {
      ttd: row.ttd ?? null,
      ttd_file_path: filePath,
      ttd_url: urlPath,
      name: row.name ?? null,
      nipnim: row.nipnim ?? null,
    },
  };
}

async function _fetchUserProfileFromUserMgmt(userId, headers) {
  if (!userId) return null;
  const hdrs = { ...(headers || {}) };
  const port = process.env.PORT || 3000;
  const origins = [
    String(process.env.USER_MGMT_URL || '').replace(/\/$/, ''),
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ].filter((o) => o && !o.endsWith('://'));
  const tryFetch = async (base, h) => {
    const profileRes = await axios.get(
      `${base}/api/user-management/users/${userId}/profile`,
      { headers: h, timeout: 12000, validateStatus: () => true },
    );
    if (profileRes.status < 200 || profileRes.status >= 300) return null;
    return profileRes?.data?.data ?? profileRes?.data ?? null;
  };
  try {
    for (const base of origins) {
      let profileData = await tryFetch(base, hdrs);
      if (!profileData && process.env.USER_MGMT_INTERNAL_TOKEN) {
        profileData = await tryFetch(base, {
          Authorization: `Bearer ${process.env.USER_MGMT_INTERNAL_TOKEN}`,
        });
      }
      if (profileData) return profileData;
    }
    return null;
  } catch (e) {
    try {
      console.warn('_fetchUserProfileFromUserMgmt:', userId, e?.message || e);
    } catch (_) {}
    return null;
  }
}

async function _fetchSignerProfileFromUserMgmt(userId, headers) {
  const profileData = await _fetchUserProfileFromUserMgmt(userId, headers);
  let dbWrapped = null;
  try {
    const { rows } = await userManagementDb.query(
      `SELECT ttd, ttd_file_path, name, nipnim FROM user_profiles
       WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [String(userId)],
    );
    dbWrapped = _wrapDbProfileRowForTtd(rows[0]);
  } catch (_) {
    dbWrapped = null;
  }

  const nested =
    profileData?.profile && typeof profileData.profile === 'object'
      ? profileData.profile
      : dbWrapped?.profile || null;
  const name = (
    profileData?.full_name ||
    profileData?.name ||
    profileData?.display_name ||
    nested?.name ||
    ''
  ).toString().trim();
  const nipnim = _trimNipnimSnapshot(
    profileData?.nipnim ||
      profileData?.identifier ||
      nested?.nipnim ||
      nested?.identifier ||
      '',
  );

  let signatureDataUri = '';
  if (dbWrapped) {
    signatureDataUri = await _dataUriFromProfileTtd(dbWrapped, headers);
  }
  if (!signatureDataUri && profileData) {
    signatureDataUri = await _dataUriFromProfileTtd(profileData, headers);
  }

  return { name, nipnim, signatureDataUri };
}

/**
 * When laboran passed items to Kaur/Kaprodi, proposal PDF uses profile TTD (not pad on submission).
 * Bypass: recipient chosen on handover screen; normal sign: submission *_signed_by.
 */
async function _applyProfileTtdForLaboranPassOnProposal(submission, authHeaders) {
  if (!submission?.id) return submission;

  const applySlot = async (kind, signedByField, sigField, nameField, nipField, signedAtField) => {
    if (!(await laboranPassSvc.hasPassLog(submission.id, kind))) return;

    const passLog = await laboranPassSvc.getLatestPassLog(submission.id, kind);
    let userId = submission[signedByField] ? String(submission[signedByField]) : null;
    if (!userId && passLog?.recipient_user_id) {
      userId = String(passLog.recipient_user_id);
    }
    if (!userId) return;

    const prof = await _fetchSignerProfileFromUserMgmt(userId, authHeaders);
    if (prof.signatureDataUri) submission[sigField] = prof.signatureDataUri;
    if (!submission[nameField]) {
      submission[nameField] =
        prof.name || passLog?.recipient_name || submission[nameField] || null;
    }
    if (!submission[nipField]) {
      submission[nipField] =
        prof.nipnim || passLog?.recipient_nipnim || submission[nipField] || null;
    }
    if (!submission[signedAtField] && passLog?.created_at) {
      submission[signedAtField] = passLog.created_at;
    }
  };

  await applySlot(
    'kaur',
    'kaur_lab_signed_by',
    'kaur_lab_signature',
    'kaur_lab_signer_name',
    'kaur_lab_signer_nipnim',
    'kaur_lab_signed_at',
  );
  await applySlot(
    'kaprodi',
    'kaprodi_signed_by',
    'kaprodi_signature',
    'kaprodi_signer_name',
    'kaprodi_signer_nipnim',
    'kaprodi_signed_at',
  );

  return submission;
}

/**
 * Proposal PDF: snapshot DB dulu; jika kosong, lookup profil penandatangan via user-management.
 */
async function _signerProfilesForProposalPdfEnriched(submission, authHeaders) {
  const base = _signerProfilesForProposalPdf(submission);
  const slots = [
    { key: 'dosen_pembina', signedBy: 'dosen_pembina_signed_by', sig: 'dosen_pembina_signature' },
    { key: 'kordas', signedBy: 'kordas_signed_by', sig: 'kordas_signature' },
    {
      key: 'kaur_lab',
      signedBy: 'kaur_lab_signed_by',
      sig: 'kaur_lab_signature',
      laboranPassKind: 'kaur',
    },
    {
      key: 'kaprodi',
      signedBy: 'kaprodi_signed_by',
      sig: 'kaprodi_signature',
      laboranPassKind: 'kaprodi',
    },
  ];
  for (const slot of slots) {
    const p = base[slot.key];
    if (!p) continue;
    const hasSig = submission?.[slot.sig];
    if (!hasSig) continue;
    const needsName = !p.name;
    const needsNip = !p.nipnim;
    if (!needsName && !needsNip) continue;
    let userId = submission?.[slot.signedBy] ? String(submission[slot.signedBy]) : null;
    if (!userId && slot.laboranPassKind && submission?.id) {
      userId = await laboranPassSvc.getRecipientUserIdFromPassLog(
        submission.id,
        slot.laboranPassKind,
      );
    }
    if (!userId) continue;
    const fetched = await _fetchSignerProfileFromUserMgmt(userId, authHeaders);
    if (needsName && fetched.name) p.name = fetched.name;
    if (needsNip && fetched.nipnim) p.nipnim = fetched.nipnim;
  }
  return base;
}

function _signerProfilesForProposalPdf(submission) {
  return {
    dosen_pembina: _mergeJwtSignerSnapshot(submission, 'dosen_pembina_signer_name', 'dosen_pembina_signer_nipnim'),
    kordas: _mergeJwtSignerSnapshot(submission, 'kordas_signer_name', 'kordas_signer_nipnim'),
    kaur_lab: _mergeJwtSignerSnapshot(submission, 'kaur_lab_signer_name', 'kaur_lab_signer_nipnim'),
    kaprodi: _mergeJwtSignerSnapshot(submission, 'kaprodi_signer_name', 'kaprodi_signer_nipnim'),
  };
}

/**
 * GET /submission/debug/jwt-signer-claims — aktif hanya jika `PROCUREMENT_DEBUG_SIGNER_JWT=1`.
 * Membantu cek **GET gateway /jwt/payload** (nama/nipnim yang dipakai snapshot) vs merge JWT lokal.
 */
export async function debugProcurementSignerJwt(req, res) {
  try {
    if (process.env.PROCUREMENT_DEBUG_SIGNER_JWT !== '1') {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const raw = req.user;
    const u = _jwtUserForSignerSnapshot(req);
    const emp = u.employee;
    const st = u.student_detail ?? u.studentDetail;

    let dataTopLevelKeys = null;
    try {
      const dr = raw?.data;
      if (typeof dr === 'string') {
        const p = JSON.parse(dr);
        if (p && typeof p === 'object' && !Array.isArray(p)) dataTopLevelKeys = Object.keys(p);
      } else if (dr && typeof dr === 'object' && !Array.isArray(dr)) {
        dataTopLevelKeys = Object.keys(dr);
      }
    } catch (_) {
      dataTopLevelKeys = ['<parse_error>'];
    }

    let bearerKeys = [];
    try {
      const tok = _extractBearerTokenString(req);
      if (tok) {
        const d = jwt.decode(tok, { complete: false });
        if (d && typeof d === 'object') bearerKeys = Object.keys(d);
      }
    } catch (_) {}

    const gw = await fetchGatewayJwtPayloadClaims(_extractBearerTokenString(req));
    const gwNip = _trimNipnimSnapshot(gw.nipnim || '');

    return res.status(200).json({
      success: true,
      data: {
        userId: String(u.id),
        gateway_jwt_payload_name: gw.name || null,
        gateway_jwt_payload_nipnim: gw.nipnim || null,
        gateway_jwt_payload_http_status: gw.status ?? null,
        gateway_jwt_payload_error: gw.error || null,
        middlewareUserKeys: Object.keys(raw || {}),
        bearerPayloadKeys: bearerKeys,
        hasNestedUserOnToken: !!(raw && raw.user && typeof raw.user === 'object'),
        raw_data_type: raw?.data != null ? typeof raw.data : null,
        raw_data_top_level_keys: dataTopLevelKeys,
        afterMerge_hasEmployee: !!(emp && typeof emp === 'object'),
        afterMerge_employee_nip: emp?.nip != null ? String(emp.nip) : null,
        afterMerge_hasStudentDetail: !!(st && typeof st === 'object'),
        afterMerge_student_nim: st?.nim != null ? String(st.nim) : null,
        afterMerge_root_nipnim: u.nipnim != null ? String(u.nipnim) : null,
        afterMerge_claims_nipnim:
          raw?.claims && typeof raw.claims === 'object' && raw.claims.nipnim != null
            ? String(raw.claims.nipnim)
            : null,
        resolved_signer_name_used_for_snapshot: gw.name || null,
        resolved_signer_nipnim_used_for_snapshot: gwNip || null,
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e?.message || String(e) });
  }
}

function _proposalPdfAllowedStatuses() {
  return new Set(['approved_by_kaprodi', 'on_going', 'ready_to_pickup', 'completed']);
}

// GET /:id/proposal - download generated proposal PDF (TPA or requester; after Kaprodi approval)
export async function downloadSubmissionProposal(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const submission = await svc.getSubmissionById(id);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    const isTpa = _userHasRole(req.user, 'tpa');
    const isOwner = String(submission.requester_id) === String(req.user.id);
    if (!isTpa && !isOwner) return res.status(403).json({ error: 'Forbidden' });

    const stKey = _normalizeProcurementStatusKey(submission.status);
    if (!_proposalPdfAllowedStatuses().has(stKey)) {
      return res.status(400).json({ error: 'Proposal PDF is only available after Kaprodi approval.' });
    }

    if (isTpaLaboranDirectSubmissionRequester(submission.requester_role)) {
      return res.status(400).json({
        error:
          'Standard proposal PDF is not available for TPA / laboran submissions. Use the financial proposal instead.',
      });
    }

    // Enrich requester name/role if missing (older rows)
    try {
      if ((!submission.requester_name || submission.requester_name === null) || (!submission.requester_role || submission.requester_role === null)) {
        const headers = {};
        if (req.headers && req.headers.authorization) headers.Authorization = req.headers.authorization;
        try {
          const userId = submission.requester_id;
          if (userId) {
            let profileRes = null;
            let rolesRes = null;
            try {
              [profileRes, rolesRes] = await Promise.all([
                axios.get(`${USER_MGMT_URL}/api/user-management/users/${userId}/profile`, { headers }),
                axios.get(`${USER_MGMT_URL}/api/user-management/users/${userId}/roles`, { headers })
              ]);
            } catch (err) {
              if (process.env.USER_MGMT_INTERNAL_TOKEN) {
                const svcHeaders = { Authorization: `Bearer ${process.env.USER_MGMT_INTERNAL_TOKEN}` };
                try {
                  [profileRes, rolesRes] = await Promise.all([
                    axios.get(`${USER_MGMT_URL}/api/user-management/users/${userId}/profile`, { headers: svcHeaders }),
                    axios.get(`${USER_MGMT_URL}/api/user-management/users/${userId}/roles`, { headers: svcHeaders })
                  ]);
                } catch (e2) {
                  console.error('Failed enriching submission requester data (service-token retry):', e2?.message || e2);
                }
              } else {
                console.error('Failed enriching submission requester data (caller token):', err?.message || err);
              }
            }

            const profileData = profileRes?.data?.data ?? profileRes?.data;
            if (profileData && !submission.requester_name) {
              const candidateName = profileData.full_name || profileData?.name || profileData.username || profileData.displayName;
              if (isMeaningfulString(candidateName)) submission.requester_name = candidateName;
            }

            const rolesData = rolesRes?.data?.data ?? rolesRes?.data;
            if (rolesData && !submission.requester_role) {
              let fetchedRole = null;
              if (Array.isArray(rolesData) && rolesData.length > 0) {
                const first = rolesData[0];
                fetchedRole = typeof first === 'string' ? first : (first.role || first.name || first.code || null);
              } else if (typeof rolesData === 'string') {
                fetchedRole = rolesData;
              }
              const normalized = normalizeRole(fetchedRole);
              if (normalized) submission.requester_role = normalized;
            }
          }
        } catch (e) {
          console.error('Failed enriching submission requester data (unexpected):', e?.message || e);
        }
      }
    } catch (e) {
      console.error('Error while attempting to enrich submission requester info:', e?.message || e);
    }

    const submissionForPdf = await _enrichSubmissionLabelsForPdf(submission);
    const authHeaders = {};
    if (req.headers?.authorization) authHeaders.Authorization = req.headers.authorization;
    await _applyProfileTtdForLaboranPassOnProposal(submissionForPdf, authHeaders);
    const items = await svc.getItemsBySubmissionId(id);
    const signerProfiles = await _signerProfilesForProposalPdfEnriched(submissionForPdf, authHeaders);
    const pdfOptions = {
      omitSupervisedLabSigners: isTpaLaboranDirectSubmissionRequester(submissionForPdf.requester_role),
    };
    const pdfBuf = await pdfService.renderSubmissionProposalPdf(
      submissionForPdf,
      items,
      signerProfiles,
      pdfOptions,
    );

    // Validate that output is a PDF (starts with %PDF)
    const isPdf = Buffer.isBuffer(pdfBuf) && pdfBuf.length > 4 && pdfBuf.slice(0, 4).toString('utf8') === '%PDF';
    if (!isPdf) {
      console.error('downloadSubmissionProposal: generated content is not PDF; sending 502.');
      try { console.error('downloadSubmissionProposal: snippet=', pdfBuf && pdfBuf.toString('utf8', 0, 200)); } catch (e) {}
      return res.status(502).json({ error: 'PDF generator unavailable or produced invalid PDF' });
    }

    const filename = buildProposalPdfFilename(submissionForPdf, {
      labName: submissionForPdf._laboratory_name || submissionForPdf.lab,
      createdAt: submissionForPdf.created_at,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfBuf);
  } catch (err) {
    next(err);
  }
}

function _parseDrawnSignatureBody(body) {
  const { signature, mime_type: mimeType } = body || {};
  if (!signature || typeof signature !== 'string') {
    return { error: 'Missing signature payload' };
  }
  const trimmed = signature.trim();
  const isDataUri = /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(trimmed);
  const base64Part = isDataUri ? trimmed.split(',')[1] : trimmed;
  if (!base64Part || !/^[A-Za-z0-9+/=\s]+$/.test(base64Part)) {
    return { error: 'Signature is not valid base64' };
  }
  if (base64Part.length > 2 * 1024 * 1024) {
    return { error: 'Signature payload is too large' };
  }
  const finalMime = typeof mimeType === 'string' && mimeType ? mimeType : 'image/png';
  const dataUri = isDataUri
    ? trimmed
    : `data:${finalMime};base64,${base64Part.replace(/\s+/g, '')}`;
  return { dataUri };
}

// POST /:id/financial-proposal/signing-mode — TPA: wet (basah) atau digital
export async function setFinancialProposalSigningMode(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'tpa')) return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    const mode = String(req.body?.mode ?? req.body?.signing_mode ?? '').trim().toLowerCase();
    if (mode !== finPropSigningSvc.FIN_PROP_MODE_WET && mode !== finPropSigningSvc.FIN_PROP_MODE_DIGITAL) {
      return res.status(400).json({ error: 'mode must be wet or digital' });
    }
    const updated = await finPropSigningSvc.setFinancialProposalSigningMode(id, mode);
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (err?.code === 'INVALID_STATUS' || err?.code === 'ALREADY_FORWARDED') {
      return res.status(400).json({ error: err.message });
    }
    if (err?.code === 'NO_FIN_PROP_SIGNING_COLUMN') {
      return res.status(500).json({ error: err.message });
    }
    next(err);
  }
}

// POST /:id/financial-proposal/forward-digital — TPA: antrian tanda tangan Kaur lalu Kaprodi
export async function forwardFinancialProposalDigital(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'tpa')) return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    const updated = await finPropSigningSvc.forwardFinancialProposalDigital(id);
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (
      err?.code === 'INVALID_STATUS' ||
      err?.code === 'NOT_DIGITAL_MODE' ||
      err?.code === 'ALREADY_SIGNED'
    ) {
      return res.status(400).json({ error: err.message });
    }
    if (err?.code === 'NO_FIN_PROP_SIGNING_COLUMN') {
      return res.status(500).json({ error: err.message });
    }
    next(err);
  }
}

// GET /:id/financial-proposal — ?unsigned=1 (basah / draft) atau ?signed=1 (digital, setelah Kaur+Kaprodi)
export async function downloadSubmissionFinancialProposal(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const submission = await svc.getSubmissionById(id);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    const wantSigned =
      req.query.signed === '1' ||
      req.query.signed === 'true' ||
      req.query.variant === 'signed';

    const access = await finPropSigningSvc.userMayDownloadFinancialProposal(
      req,
      submission,
      wantSigned,
      {
        isTpa: _userHasRole(req.user, 'tpa'),
        isKaur: await _userIsKaurLab(req),
        isKaprodi: await _userIsKaprodi(req),
        kaprodiStudyProgramId:
          req.query?.study_program_id ||
          req.query?.studyProgramId ||
          (await _resolveKaprodiUserStudyProgramId(req)) ||
          submission.study_program_id ||
          submission.studyProgramId,
      },
    );
    if (!access.allowed) {
      const code = access.reason?.includes('not found') ? 404 : 403;
      const status = access.reason?.includes('only for completed') ||
        access.reason?.includes('Select a signing') ||
        access.reason?.includes('not been forwarded') ||
        access.reason?.includes('only available in digital') ||
        access.reason?.includes('after Kaur')
        ? 400
        : code;
      return res.status(status).json({ error: access.reason || 'Forbidden' });
    }

    const submissionForPdf = await _enrichSubmissionLabelsForPdf(submission);
    const items = await svc.getItemsBySubmissionId(id);
    const finCtx = await financialProposalPdf.loadFinancialProposalContext(
      submissionForPdf,
      items,
    );
    const pdfOpts = finPropSigningSvc.resolveFinancialProposalPdfRenderOptions(
      submissionForPdf,
      wantSigned,
    );
    if (
      !wantSigned &&
      String(submissionForPdf.financial_proposal_signing_mode ?? '').trim().toLowerCase() === 'wet'
    ) {
      await _applyWetSignaturePlaceholderNames(submissionForPdf);
    }
    const pdfBuf = await financialProposalPdf.renderSubmissionFinancialProposalPdf(
      submissionForPdf,
      items,
      { ...pdfOpts, context: finCtx },
    );

    const isPdf =
      Buffer.isBuffer(pdfBuf) && pdfBuf.length > 4 && pdfBuf.slice(0, 4).toString('utf8') === '%PDF';
    if (!isPdf) {
      console.error('downloadSubmissionFinancialProposal: invalid PDF; sending 502.');
      return res.status(502).json({ error: 'PDF generator unavailable or produced invalid PDF' });
    }

    let filename = buildFinancialProposalPdfFilename(submissionForPdf, {
      labName: submissionForPdf._laboratory_name || submissionForPdf.lab,
      createdAt: submissionForPdf.created_at,
    });
    if (wantSigned) {
      filename = filename.replace(/^ProposalKeuangan_/, 'ProposalKeuangan_TTD_');
    } else {
      filename = filename.replace(/^ProposalKeuangan_/, 'ProposalKeuangan_TanpaTTD_');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfBuf);
  } catch (err) {
    if (err?.code === 'FIN_PROP_NOT_FULLY_SIGNED') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
}

// POST /:id/financial-proposal/kaur-lab/signature
export async function submitFinancialProposalKaurSignature(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const parsed = _parseDrawnSignatureBody(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { id } = req.params;
    if (!(await _userIsKaurLab(req))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const updated = await finPropSigningSvc.setFinancialProposalKaurSignature(
      id,
      req.user.id,
      parsed.dataUri,
      await _signerDisplayForSignatureSave(req, { roleHint: 'employee' }),
    );
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (err?.code === 'WRONG_QUEUE' || err?.code === 'NOT_DIGITAL_MODE' || err?.code === 'INVALID_STATUS') {
      return res.status(403).json({ error: err.message });
    }
    if (err?.code === 'NO_FIN_PROP_SIGNING_COLUMN') {
      return res.status(500).json({ error: err.message });
    }
    next(err);
  }
}

// POST /:id/financial-proposal/kaprodi/signature
export async function submitFinancialProposalKaprodiSignature(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const parsed = _parseDrawnSignatureBody(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { id } = req.params;
    const current = await svc.getSubmissionById(id);
    if (!current) return res.status(404).json({ error: 'Submission not found' });
    if (!_userHasRole(req.user, 'kaprodi')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const spId =
      req.query?.study_program_id ||
      req.query?.studyProgramId ||
      req.body?.study_program_id ||
      req.body?.studyProgramId ||
      (await _resolveKaprodiUserStudyProgramId(req)) ||
      current.study_program_id ||
      current.studyProgramId ||
      (current.study_program && (current.study_program.id || current.study_program._id));
    const maySign = await finPropSigningSvc.kaprodiMaySignFinancialProposal(current, spId);
    if (!maySign) {
      return res.status(403).json({
        error: spId
          ? 'This submission is not in your study program or is not waiting for Kaprodi signature.'
          : 'Study program not resolved for Kaprodi',
      });
    }
    const updated = await finPropSigningSvc.setFinancialProposalKaprodiSignature(
      id,
      req.user.id,
      parsed.dataUri,
      await _signerDisplayForSignatureSave(req, { roleHint: 'employee' }),
    );
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (err?.code === 'WRONG_QUEUE' || err?.code === 'NOT_DIGITAL_MODE' || err?.code === 'INVALID_STATUS') {
      return res.status(403).json({ error: err.message });
    }
    if (err?.code === 'NO_FIN_PROP_SIGNING_COLUMN') {
      return res.status(500).json({ error: err.message });
    }
    next(err);
  }
}

export async function getFinancialProposalKaurPendingStats(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!(await _userIsKaurLab(req))) return res.status(403).json({ error: 'Forbidden' });
    const stats = await finPropSigningSvc.getFinancialProposalPendingKaurStats();
    return res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

export async function getFinancialProposalKaurPendingList(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!(await _userIsKaurLab(req))) return res.status(403).json({ error: 'Forbidden' });
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const offset = Number(req.query.offset) || 0;
    const rows = await finPropSigningSvc.listFinancialProposalPendingKaur({ limit, offset });
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

export async function getFinancialProposalKaprodiPendingStats(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'kaprodi')) return res.status(403).json({ error: 'Forbidden' });
    const spId =
      req.query?.study_program_id ||
      req.query?.studyProgramId ||
      (await _resolveKaprodiUserStudyProgramId(req));
    const stats = await finPropSigningSvc.getFinancialProposalPendingKaprodiStats(spId);
    return res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

export async function getFinancialProposalKaprodiPendingList(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'kaprodi')) return res.status(403).json({ error: 'Forbidden' });
    const spId =
      req.query?.study_program_id ||
      req.query?.studyProgramId ||
      (await _resolveKaprodiUserStudyProgramId(req));
    if (!spId) return res.status(200).json({ success: true, data: [] });
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const offset = Number(req.query.offset) || 0;
    const rows = await finPropSigningSvc.listFinancialProposalPendingKaprodi(spId, {
      limit,
      offset,
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

// POST /:id/justification/signing-mode — TPA: wet atau digital (≥ Rp 1jt)
export async function setJustificationSigningMode(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'tpa')) return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    const mode = String(req.body?.mode ?? req.body?.signing_mode ?? '').trim().toLowerCase();
    if (mode !== justifSigningSvc.JUSTIF_MODE_WET && mode !== justifSigningSvc.JUSTIF_MODE_DIGITAL) {
      return res.status(400).json({ error: 'mode must be wet or digital' });
    }
    const updated = await justifSigningSvc.setJustificationSigningMode(id, mode);
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (
      err?.code === 'INVALID_STATUS' ||
      err?.code === 'ALREADY_FORWARDED' ||
      err?.code === 'BELOW_THRESHOLD'
    ) {
      return res.status(400).json({ error: err.message });
    }
    if (err?.code === 'NO_JUSTIF_SIGNING_COLUMN') {
      return res.status(500).json({ error: err.message });
    }
    next(err);
  }
}

export async function forwardJustificationDigital(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'tpa')) return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    const updated = await justifSigningSvc.forwardJustificationDigital(id);
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (
      err?.code === 'INVALID_STATUS' ||
      err?.code === 'NOT_DIGITAL_MODE' ||
      err?.code === 'ALREADY_SIGNED' ||
      err?.code === 'BELOW_THRESHOLD'
    ) {
      return res.status(400).json({ error: err.message });
    }
    if (err?.code === 'NO_JUSTIF_SIGNING_COLUMN') {
      return res.status(500).json({ error: err.message });
    }
    next(err);
  }
}

export async function submitJustificationKaurSignature(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const parsed = _parseDrawnSignatureBody(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { id } = req.params;
    if (!(await _userIsKaurLab(req))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const updated = await justifSigningSvc.setJustificationKaurSignature(
      id,
      req.user.id,
      parsed.dataUri,
      await _signerDisplayForSignatureSave(req, { roleHint: 'employee' }),
    );
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (err?.code === 'WRONG_QUEUE' || err?.code === 'NOT_DIGITAL_MODE' || err?.code === 'INVALID_STATUS') {
      return res.status(403).json({ error: err.message });
    }
    if (err?.code === 'NO_JUSTIF_SIGNING_COLUMN') {
      return res.status(500).json({ error: err.message });
    }
    next(err);
  }
}

export async function submitJustificationKaprodiSignature(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const parsed = _parseDrawnSignatureBody(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { id } = req.params;
    const current = await svc.getSubmissionById(id);
    if (!current) return res.status(404).json({ error: 'Submission not found' });
    if (!_userHasRole(req.user, 'kaprodi')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const spId =
      req.query?.study_program_id ||
      req.query?.studyProgramId ||
      req.body?.study_program_id ||
      req.body?.studyProgramId ||
      (await _resolveKaprodiUserStudyProgramId(req)) ||
      current.study_program_id ||
      current.studyProgramId;
    const maySign = await justifSigningSvc.kaprodiMaySignJustification(current, spId);
    if (!maySign) {
      return res.status(403).json({
        error: spId
          ? 'This submission is not in your study program or is not waiting for Kaprodi justification signature.'
          : 'Study program not resolved for Kaprodi',
      });
    }
    const updated = await justifSigningSvc.setJustificationKaprodiSignature(
      id,
      req.user.id,
      parsed.dataUri,
      await _signerDisplayForSignatureSave(req, { roleHint: 'employee' }),
    );
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (err?.code === 'WRONG_QUEUE' || err?.code === 'NOT_DIGITAL_MODE' || err?.code === 'INVALID_STATUS') {
      return res.status(403).json({ error: err.message });
    }
    if (err?.code === 'NO_JUSTIF_SIGNING_COLUMN') {
      return res.status(500).json({ error: err.message });
    }
    next(err);
  }
}

export async function getJustificationKaurPendingStats(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!(await _userIsKaurLab(req))) return res.status(403).json({ error: 'Forbidden' });
    const stats = await justifSigningSvc.getJustificationPendingKaurStats();
    return res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

export async function getJustificationKaurPendingList(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!(await _userIsKaurLab(req))) return res.status(403).json({ error: 'Forbidden' });
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const offset = Number(req.query.offset) || 0;
    const rows = await justifSigningSvc.listJustificationPendingKaur({ limit, offset });
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

export async function getJustificationKaprodiPendingStats(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'kaprodi')) return res.status(403).json({ error: 'Forbidden' });
    const spId =
      req.query?.study_program_id ||
      req.query?.studyProgramId ||
      (await _resolveKaprodiUserStudyProgramId(req));
    const stats = await justifSigningSvc.getJustificationPendingKaprodiStats(spId);
    return res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

export async function getJustificationKaprodiPendingList(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'kaprodi')) return res.status(403).json({ error: 'Forbidden' });
    const spId =
      req.query?.study_program_id ||
      req.query?.studyProgramId ||
      (await _resolveKaprodiUserStudyProgramId(req));
    if (!spId) return res.status(200).json({ success: true, data: [] });
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const offset = Number(req.query.offset) || 0;
    const rows = await justifSigningSvc.listJustificationPendingKaprodi(spId, { limit, offset });
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

// GET /:id/justification — ?unsigned=1 | ?signed=1 (reimbursement ≥ Rp 1jt)
export async function downloadSubmissionJustification(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const submission = await svc.getSubmissionById(id);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    const wantSigned =
      req.query.signed === '1' ||
      req.query.signed === 'true' ||
      req.query.variant === 'signed';

    const stKey = _normalizeProcurementStatusKey(submission.status);
    const isCompletedReimb = stKey === 'completed' || stKey === 'closed';

    if (isCompletedReimb) {
      if (!justifSigningSvc.submissionMeetsJustificationThreshold(submission)) {
        return res.status(400).json({
          error:
            'Justification letter is only for submissions with a total of Rp 1,000,000 or more.',
        });
      }
      const access = await justifSigningSvc.userMayDownloadJustification(
        req,
        submission,
        wantSigned,
        {
          isTpa: _userHasRole(req.user, 'tpa'),
          isKaur: await _userIsKaurLab(req),
          isKaprodi: await _userIsKaprodi(req),
          kaprodiStudyProgramId:
            req.query?.study_program_id ||
            req.query?.studyProgramId ||
            (await _resolveKaprodiUserStudyProgramId(req)) ||
            submission.study_program_id ||
            submission.studyProgramId,
        },
      );
      if (!access.allowed) {
        const code = access.reason?.includes('not found') ? 404 : 403;
        const status =
          access.reason?.includes('only for completed') ||
          access.reason?.includes('Select a signing') ||
          access.reason?.includes('not been forwarded') ||
          access.reason?.includes('only available in digital') ||
          access.reason?.includes('after Kaur')
            ? 400
            : code;
        return res.status(status).json({ error: access.reason || 'Forbidden' });
      }
    } else {
      if (!_userHasRole(req.user, 'tpa')) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (!_proposalPdfAllowedStatuses().has(stKey)) {
        return res.status(400).json({
          error: 'Justification PDF is only available after Kaprodi approval.',
        });
      }
      const amount = Number(submission.total_price ?? 0);
      if (!Number.isFinite(amount) || amount < pdfService.JUSTIFICATION_AMOUNT_THRESHOLD_IDR) {
        return res.status(400).json({
          error:
            'Justification letter is only for submissions with a total of Rp 1,000,000 or more.',
        });
      }
    }

    try {
      if (
        (!submission.requester_name || submission.requester_name === null) ||
        (!submission.requester_role || submission.requester_role === null)
      ) {
        const headers = {};
        if (req.headers && req.headers.authorization) {
          headers.Authorization = req.headers.authorization;
        }
        try {
          const userId = submission.requester_id;
          if (userId) {
            let profileRes = null;
            let rolesRes = null;
            try {
              [profileRes, rolesRes] = await Promise.all([
                axios.get(`${USER_MGMT_URL}/api/user-management/users/${userId}/profile`, {
                  headers,
                }),
                axios.get(`${USER_MGMT_URL}/api/user-management/users/${userId}/roles`, {
                  headers,
                }),
              ]);
            } catch (err) {
              if (process.env.USER_MGMT_INTERNAL_TOKEN) {
                const svcHeaders = {
                  Authorization: `Bearer ${process.env.USER_MGMT_INTERNAL_TOKEN}`,
                };
                try {
                  [profileRes, rolesRes] = await Promise.all([
                    axios.get(
                      `${USER_MGMT_URL}/api/user-management/users/${userId}/profile`,
                      { headers: svcHeaders },
                    ),
                    axios.get(
                      `${USER_MGMT_URL}/api/user-management/users/${userId}/roles`,
                      { headers: svcHeaders },
                    ),
                  ]);
                } catch (e2) {
                  console.error(
                    'Failed enriching submission requester data (service-token retry):',
                    e2?.message || e2,
                  );
                }
              } else {
                console.error(
                  'Failed enriching submission requester data (caller token):',
                  err?.message || err,
                );
              }
            }

            const profileData = profileRes?.data?.data ?? profileRes?.data;
            if (profileData && !submission.requester_name) {
              const candidateName =
                profileData.full_name ||
                profileData?.name ||
                profileData.username ||
                profileData.displayName;
              if (isMeaningfulString(candidateName)) submission.requester_name = candidateName;
            }

            const rolesData = rolesRes?.data?.data ?? rolesRes?.data;
            if (rolesData && !submission.requester_role) {
              let fetchedRole = null;
              if (Array.isArray(rolesData) && rolesData.length > 0) {
                const first = rolesData[0];
                fetchedRole =
                  typeof first === 'string'
                    ? first
                    : first.role || first.name || first.code || null;
              } else if (typeof rolesData === 'string') {
                fetchedRole = rolesData;
              }
              const normalized = normalizeRole(fetchedRole);
              if (normalized) submission.requester_role = normalized;
            }
          }
        } catch (e) {
          console.error(
            'Failed enriching submission requester data (unexpected):',
            e?.message || e,
          );
        }
      }
    } catch (e) {
      console.error('Error while attempting to enrich submission requester info:', e?.message || e);
    }

    const submissionForPdf = await _enrichSubmissionLabelsForPdf(submission);
    const authHeaders = {};
    if (req.headers?.authorization) authHeaders.Authorization = req.headers.authorization;
    await _applyProfileTtdForLaboranPassOnProposal(submissionForPdf, authHeaders);
    const items = await svc.getItemsBySubmissionId(id);
    let signerProfiles = await _signerProfilesForProposalPdfEnriched(
      submissionForPdf,
      authHeaders,
    );
    let submissionPdfInput = submissionForPdf;
    const justifPdfOpts = isCompletedReimb
      ? justifSigningSvc.resolveJustificationPdfRenderOptions(
          submissionForPdf,
          wantSigned,
        )
      : { includeSignatures: false, previewRole: 'kaur' };
    if (isCompletedReimb) {
      submissionPdfInput = justifSigningSvc.mapSubmissionForJustificationReimbPdf(
        submissionForPdf,
        justifPdfOpts,
      );
      signerProfiles = justifSigningSvc.buildJustificationReimbSignerProfiles(
        submissionForPdf,
        signerProfiles,
      );
    }
    const justifCtx = await justifDataSvc.loadJustificationContext(
      submissionForPdf,
      items,
    );
    if (
      isCompletedReimb &&
      !wantSigned &&
      String(submissionPdfInput.justification_signing_mode ?? '').trim().toLowerCase() === 'wet'
    ) {
      await _applyWetSignaturePlaceholderNames(submissionPdfInput);
    }
    const pdfBuf = await pdfService.renderSubmissionJustificationPdf(
      submissionPdfInput,
      items,
      signerProfiles,
      { ...justifPdfOpts, context: justifCtx },
    );

    const isPdf =
      Buffer.isBuffer(pdfBuf) && pdfBuf.length > 4 && pdfBuf.slice(0, 4).toString('utf8') === '%PDF';
    if (!isPdf) {
      console.error('downloadSubmissionJustification: generated content is not PDF; sending 502.');
      return res.status(502).json({ error: 'PDF generator unavailable or produced invalid PDF' });
    }

    let filename = buildJustificationPdfFilename(submissionForPdf, {
      labName: submissionForPdf._laboratory_name || submissionForPdf.lab,
      createdAt: submissionForPdf.created_at,
    });
    if (isCompletedReimb && wantSigned) {
      filename = filename.replace(/^Justifikasi_/, 'Justifikasi_TTD_');
    } else if (isCompletedReimb) {
      filename = filename.replace(/^Justifikasi_/, 'Justifikasi_TanpaTTD_');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfBuf);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /:id/dosen-pembina/signature
 *
 * Save the supervising lecturer's drawn signature on a submission.
 * Only the dosen pembina assigned to the submission's lab may sign and
 * only while the submission is **approved_by_kordas** (after KO approval). The drawn image is sent
 * as a `data:image/png;base64,...` data URI in the `signature` field.
 *
 * The frontend calls this just before flipping status to
 * `approved_by_dosen_pembina`, so the saved signature can be embedded
 * when the proposal PDF is generated later.
 */
export async function submitDosenPembinaSignature(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const { signature, mime_type: mimeType } = req.body || {};
    if (!signature || typeof signature !== 'string') {
      return res.status(400).json({ error: 'Missing signature payload' });
    }

    // Accept either a raw base64 string or a data URI; normalize to a
    // data URI so downstream PDF rendering can embed it directly.
    const trimmed = signature.trim();
    const isDataUri = /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(trimmed);
    const base64Part = isDataUri ? trimmed.split(',')[1] : trimmed;
    if (!base64Part || !/^[A-Za-z0-9+/=\s]+$/.test(base64Part)) {
      return res.status(400).json({ error: 'Signature is not valid base64' });
    }
    // Cap signature payload size to ~2 MB of base64 to prevent abuse.
    if (base64Part.length > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'Signature payload is too large' });
    }
    const finalMime = (typeof mimeType === 'string' && mimeType) ? mimeType : 'image/png';
    const dataUri = isDataUri ? trimmed : `data:${finalMime};base64,${base64Part.replace(/\s+/g, '')}`;

    const current = await svc.getSubmissionById(id);
    if (!current) return res.status(404).json({ error: 'Submission not found' });

    if (!(await _dosenPembinaCanActOnApprovedByKordasInLab(req, current))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await svc.setDosenPembinaSignature(
      id,
      req.user.id,
      dataUri,
      await _signerDisplayForSignatureSave(req, { roleHint: 'employee' }),
    );
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (err && err.code === 'NO_SIGNATURE_COLUMN') {
      return res.status(500).json({ error: err.message });
    }
    next(err);
  }
}

/**
 * POST /:id/kordas/signature
 *
 * Save Koordinator Asisten drawn signature while status is **waiting**.
 * Same payload rules as dosen pembina signature.
 * Frontend calls this immediately before `change-status` → `approved_by_kordas`.
 */
export async function submitKordasSignature(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const { signature, mime_type: mimeType } = req.body || {};
    if (!signature || typeof signature !== 'string') {
      return res.status(400).json({ error: 'Missing signature payload' });
    }

    const trimmed = signature.trim();
    const isDataUri = /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(trimmed);
    const base64Part = isDataUri ? trimmed.split(',')[1] : trimmed;
    if (!base64Part || !/^[A-Za-z0-9+/=\s]+$/.test(base64Part)) {
      return res.status(400).json({ error: 'Signature is not valid base64' });
    }
    if (base64Part.length > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'Signature payload is too large' });
    }
    const finalMime = (typeof mimeType === 'string' && mimeType) ? mimeType : 'image/png';
    const dataUri = isDataUri ? trimmed : `data:${finalMime};base64,${base64Part.replace(/\s+/g, '')}`;

    const current = await svc.getSubmissionById(id);
    if (!current) return res.status(404).json({ error: 'Submission not found' });

    if (!(await _koordinatorAsistenCanActOnWaitingInLab(req, current))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await svc.setKordasSignature(
      id,
      req.user.id,
      dataUri,
      await _signerDisplayForSignatureSave(req, { roleHint: 'student' }),
    );
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (err && err.code === 'NO_SIGNATURE_COLUMN') {
      return res.status(500).json({ error: err.message });
    }
    next(err);
  }
}

/**
 * POST /:id/kaur-lab/signature
 *
 * Save Kaur Lab drawn signature while status is `approved_by_tpa`.
 * Same payload rules as dosen pembina / kordas signature.
 * Frontend calls this immediately before `change-status` → `approved_by_kaur`.
 */
export async function submitKaurLabSignature(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const { signature, mime_type: mimeType } = req.body || {};
    if (!signature || typeof signature !== 'string') {
      return res.status(400).json({ error: 'Missing signature payload' });
    }

    const trimmed = signature.trim();
    const isDataUri = /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(trimmed);
    const base64Part = isDataUri ? trimmed.split(',')[1] : trimmed;
    if (!base64Part || !/^[A-Za-z0-9+/=\s]+$/.test(base64Part)) {
      return res.status(400).json({ error: 'Signature is not valid base64' });
    }
    if (base64Part.length > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'Signature payload is too large' });
    }
    const finalMime = (typeof mimeType === 'string' && mimeType) ? mimeType : 'image/png';
    const dataUri = isDataUri ? trimmed : `data:${finalMime};base64,${base64Part.replace(/\s+/g, '')}`;

    const current = await svc.getSubmissionById(id);
    if (!current) return res.status(404).json({ error: 'Submission not found' });

    if (!(await _kaurLabCanActWhileApprovedByTpa(req, current))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await svc.setKaurLabSignature(
      id,
      req.user.id,
      dataUri,
      await _signerDisplayForSignatureSave(req, { roleHint: 'employee' }),
    );
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (err && err.code === 'NO_SIGNATURE_COLUMN') {
      return res.status(500).json({ error: err.message });
    }
    next(err);
  }
}

/**
 * Kaprodi saves drawn signature while status is **approved_by_kaur**,
 * immediately before `change-status` → `approved_by_kaprodi`.
 */
export async function submitKaprodiSignature(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const { signature, mime_type: mimeType } = req.body || {};
    if (!signature || typeof signature !== 'string') {
      return res.status(400).json({ error: 'Missing signature payload' });
    }

    const trimmed = signature.trim();
    const isDataUri = /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(trimmed);
    const base64Part = isDataUri ? trimmed.split(',')[1] : trimmed;
    if (!base64Part || !/^[A-Za-z0-9+/=\s]+$/.test(base64Part)) {
      return res.status(400).json({ error: 'Signature is not valid base64' });
    }
    if (base64Part.length > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'Signature payload is too large' });
    }
    const finalMime = (typeof mimeType === 'string' && mimeType) ? mimeType : 'image/png';
    const dataUri = isDataUri ? trimmed : `data:${finalMime};base64,${base64Part.replace(/\s+/g, '')}`;

    const current = await svc.getSubmissionById(id);
    if (!current) return res.status(404).json({ error: 'Submission not found' });

    if (!(await _kaprodiCanSaveSignatureWhileApprovedByKaur(req, current))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await svc.setKaprodiSignature(
      id,
      req.user.id,
      dataUri,
      await _signerDisplayForSignatureSave(req, { roleHint: 'employee' }),
    );
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (err && err.code === 'NO_SIGNATURE_COLUMN') {
      return res.status(500).json({ error: err.message });
    }
    next(err);
  }
}

/**
 * POST /:id/handover-receipt/signature
 *
 * Requester (mahasiswa/pengaju) confirms item receipt with a drawn signature for
 * berita acara / bukti penerimaan barang (non-blockchain flow).
 */
export async function submitRequesterHandoverReceiptSignature(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const { signature, mime_type: mimeType } = req.body || {};
    if (!signature || typeof signature !== 'string') {
      return res.status(400).json({ error: 'Missing signature payload' });
    }

    const trimmed = signature.trim();
    const isDataUri = /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(trimmed);
    const base64Part = isDataUri ? trimmed.split(',')[1] : trimmed;
    if (!base64Part || !/^[A-Za-z0-9+/=\s]+$/.test(base64Part)) {
      return res.status(400).json({ error: 'Signature is not valid base64' });
    }
    if (base64Part.length > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'Signature payload is too large' });
    }
    const finalMime = typeof mimeType === 'string' && mimeType ? mimeType : 'image/png';
    const dataUri = isDataUri ? trimmed : `data:${finalMime};base64,${base64Part.replace(/\s+/g, '')}`;

    const current = await svc.getSubmissionById(id);
    if (!current) return res.status(404).json({ error: 'Submission not found' });

    if (String(current.requester_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const st = _normalizeProcurementStatusKey(current.status);
    if (st !== 'ready_to_pickup') {
      return res.status(400).json({
        error: 'Hand over signature is only allowed when submission status is ready to pick up.',
      });
    }

    if (current.requester_handover_signature) {
      return res.status(409).json({ error: 'Hand over receipt signature already recorded.' });
    }

    const updated = await svc.setRequesterHandoverReceiptSignature(
      id,
      req.user.id,
      dataUri,
      await _signerDisplayForSignatureSave(req),
    );
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (err && err.code === 'NO_SIGNATURE_COLUMN') {
      return res.status(500).json({ error: err.message });
    }
    next(err);
  }
}

/**
 * POST /:id/handover-delivery/signature
 *
 * TPA / laboran confirms item delivery with a drawn signature (non-blockchain serah terima).
 */
export async function submitTpaHandoverDeliverySignature(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'tpa')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const { signature, mime_type: mimeType } = req.body || {};
    if (!signature || typeof signature !== 'string') {
      return res.status(400).json({ error: 'Missing signature payload' });
    }

    const trimmed = signature.trim();
    const isDataUri = /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(trimmed);
    const base64Part = isDataUri ? trimmed.split(',')[1] : trimmed;
    if (!base64Part || !/^[A-Za-z0-9+/=\s]+$/.test(base64Part)) {
      return res.status(400).json({ error: 'Signature is not valid base64' });
    }
    if (base64Part.length > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'Signature payload is too large' });
    }
    const finalMime = typeof mimeType === 'string' && mimeType ? mimeType : 'image/png';
    const dataUri = isDataUri ? trimmed : `data:${finalMime};base64,${base64Part.replace(/\s+/g, '')}`;

    const current = await svc.getSubmissionById(id);
    if (!current) return res.status(404).json({ error: 'Submission not found' });

    const st = _normalizeProcurementStatusKey(current.status);
    if (st !== 'ready_to_pickup') {
      return res.status(400).json({
        error: 'Serah terima verification is only allowed when submission status is ready to pick up.',
      });
    }

    if (current.tpa_handover_signature) {
      return res.status(409).json({ error: 'Serah terima signature already recorded.' });
    }

    const reqHandover = current.requester_handover_signature;
    if (!reqHandover || !String(reqHandover).trim()) {
      return res.status(400).json({
        error:
          'The requester (recipient) must sign receipt first before laboran can verify serah terima.',
      });
    }

    const updated = await svc.setTpaHandoverDeliverySignature(
      id,
      req.user.id,
      dataUri,
      await _signerDisplayForSignatureSave(req),
    );
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (err && err.code === 'NO_SIGNATURE_COLUMN') {
      return res.status(500).json({ error: err.message });
    }
    if (err && err.code === 'HANDOVER_ORDER') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
}

function _handoverBeritaAcaraReady(submission) {
  const tpa = submission?.tpa_handover_signature;
  const reqSig = submission?.requester_handover_signature;
  return !!(tpa && String(tpa).trim() && reqSig && String(reqSig).trim());
}

/**
 * GET /:id/handover-berita-acara — Berita Acara / Bukti Penerimaan Barang PDF.
 * Available after both TPA and requester handover signatures are recorded.
 */
export async function downloadHandoverBeritaAcara(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const submission = await svc.getSubmissionById(id);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    const isTpa = _userHasRole(req.user, 'tpa');
    const isOwner = String(submission.requester_id) === String(req.user.id);
    if (!isTpa && !isOwner) return res.status(403).json({ error: 'Forbidden' });

    if (!_handoverBeritaAcaraReady(submission)) {
      return res.status(400).json({
        error:
          'Berita acara PDF is only available after both laboran and requester have signed handover.',
      });
    }

    const submissionForPdf = await _enrichSubmissionLabelsForPdf(submission);
    const items = await svc.getItemsBySubmissionId(id);
    const pdfBuf = await handoverBeritaAcaraPdf.renderHandoverBeritaAcaraPdf(submissionForPdf, items);

    const isPdf =
      Buffer.isBuffer(pdfBuf) && pdfBuf.length > 4 && pdfBuf.slice(0, 4).toString('utf8') === '%PDF';
    if (!isPdf) {
      console.error('downloadHandoverBeritaAcara: generated content is not PDF');
      return res.status(502).json({ error: 'PDF generator unavailable or produced invalid PDF' });
    }

    const filename = buildHandoverBeritaAcaraPdfFilename(submissionForPdf, {
      labName: submissionForPdf._laboratory_name || submissionForPdf.lab,
      createdAt: submissionForPdf.created_at,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfBuf);
  } catch (err) {
    next(err);
  }
}

// POST /:id/reimbursement-status — TPA toggles completed ↔ closed (process reimbursement)
export async function changeReimbursementStatus(req, res, next) {
  try {
    const { id } = req.params;
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'tpa')) return res.status(403).json({ error: 'Forbidden' });

    const target = _normalizeProcurementStatusKey(req.body?.status);
    if (target !== 'completed' && target !== 'closed') {
      return res.status(400).json({ error: 'Status must be completed or closed' });
    }

    const currentSubmission = await svc.getSubmissionById(id);
    if (!currentSubmission) return res.status(404).json({ error: 'Submission not found' });

    const st = _normalizeProcurementStatusKey(currentSubmission.status);
    if (target === 'closed' && st !== 'completed') {
      return res.status(422).json({ error: 'Only completed submissions can be marked closed' });
    }
    if (target === 'completed' && st !== 'closed') {
      return res.status(422).json({
        error: 'Can only set completed when reopening a closed submission',
      });
    }
    if (target === st) {
      return res.status(200).json({ success: true, data: currentSubmission });
    }

    const signer = _jwtUserForSignerSnapshot(req);
    const updated = await svc.changeSubmissionStatus(id, req.user.id, target, {
      actorName: displayNameFromJwtPayload(signer) || null,
      actorRole: 'tpa',
    });
    if (!updated) return res.status(404).json({ error: 'Submission not found' });

    try {
      notificationSvc.notifySubmissionStatusChange(
        updated.id,
        updated.requester_id,
        updated.status,
        target,
        { triggeredBy: req.user.id },
        req.user.id,
      );
    } catch (_) {}

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// POST /:id/change-status - allow TPA to change submission status manually
export async function changeSubmissionStatus(req, res, next) {
  try {
    const { id } = req.params;
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
  const { status, reason } = req.body || {};
    if (!status || (typeof status !== 'string' && typeof status !== 'number')) return res.status(400).json({ error: 'Missing status' });

    // Normalize incoming status values: accept display labels like
    // 'Approved - by tpa', 'Approved by TPA' and map them to internal token 'approved_by_tpa'.
    let rawStatus = String(status).trim();
    const lower = rawStatus.toLowerCase();
    const normalizedExact = _normalizeProcurementStatusKey(rawStatus);
    let target;
    if (normalizedExact === 'completed' || normalizedExact === 'closed') {
      target = normalizedExact;
    } else {
    target = lower;
    if (lower === 'approved_by_koordinator_asisten') {
      target = 'approved_by_kordas';
    }
    if (lower.includes('kordas')) {
      target = 'approved_by_kordas';
    }
    if (
      lower === 'approved_by_dosen_pembina' ||
      (lower.includes('dosen') && lower.includes('pembina') && lower.includes('approved'))
    ) {
      target = 'approved_by_dosen_pembina';
    }
    if (lower.includes('approved') && lower.includes('tpa')) {
      target = 'approved_by_tpa';
    }
    // Map approved by kaur/kaprodi labels
    if (lower.includes('approved') && (lower.includes('kaur') || lower.includes('kaur_lab') || lower.includes('kaur-lab'))) {
      target = 'approved_by_kaur';
    }
    if (lower.includes('approved') && lower.includes('kaprodi')) {
      target = 'approved_by_kaprodi';
    }
    target = _normalizeProcurementStatusKey(target);
    }

    // Allow a specific TPA-approved status so frontend can mark submissions approved by TPA
    // and also accept 'approved_by_kaur'. We enforce role-based permission after normalization.
  const allowed = ['waiting','submitted','on_review','on_going','ready_to_pickup','approved','approved_by_tpa','approved_by_kaur','approved_by_kaprodi','approved_by_dosen_pembina','approved_by_kordas','rejected','completed','closed','cancelled'];
    if (!allowed.includes(target)) return res.status(400).json({ error: 'Invalid status' });

    // Enforce role permissions. We need to inspect the current submission
    // so we can allow Kaur Lab users to reject submissions that have been
    // forwarded to them (status === 'approved_by_tpa').
    const currentSubmission = await svc.getSubmissionById(id);
    if (!currentSubmission) return res.status(404).json({ error: 'Submission not found' });

    // Rules:
    // - Lab chain: waiting → KO sets `approved_by_kordas` → dosen pembina sets `approved_by_dosen_pembina` → TPA sets `approved_by_tpa` (then Kaur/Kaprodi as before).
    // - 'approved_by_kaur' / 'approved_by_kaprodi': unchanged
    // - 'rejected': TPA, Kaur stage, KO on waiting in lab, dosen pembina on approved_by_kordas in lab
    // - 'submitted': TPA only (legacy / manual)
    // - other transitions: TPA-only unless listed above
    if (target === 'approved_by_kaur') {
      if (_userHasRole(req.user, 'tpa')) {
        return res.status(422).json({
          error: 'Upload handover proof photos via laboran-pass before marking Approved by Kaur',
        });
      }
      if (!(_userHasRole(req.user, 'kaur_lab') || _userHasRole(req.user, 'kaur'))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const stKaurGate = _normalizeProcurementStatusKey(currentSubmission.status);
      const kaurOk =
        stKaurGate === 'approved_by_tpa' ||
        (stKaurGate === 'approved_by_kaur' && (await laboranPassSvc.hasPassLog(id, 'kaur')));
      if (!kaurOk) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (target === 'approved_by_kaprodi') {
      if (_userHasRole(req.user, 'tpa')) {
        return res.status(422).json({
          error: 'Upload handover proof photos via laboran-pass before marking Approved by Kaprodi',
        });
      }
      const isKaprodi = await _userIsKaprodi(req);
      if (!isKaprodi) return res.status(403).json({ error: 'Forbidden' });
      const stKap = _normalizeProcurementStatusKey(currentSubmission.status);
      const kaprodiOk =
        stKap === 'approved_by_kaur' ||
        (stKap === 'approved_by_kaprodi' && (await laboranPassSvc.hasPassLog(id, 'kaprodi')));
      if (!kaprodiOk) {
        return res.status(403).json({ error: 'Forbidden' });
      }
        if (!(await _kaprodiOwnsSubmissionStudyProgram(req, currentSubmission))) {
          return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (target === 'rejected') {
      const isTpa = _userHasRole(req.user, 'tpa');
      const isKaur = _userHasRole(req.user, 'kaur_lab') || _userHasRole(req.user, 'kaur');
      const st = _normalizeProcurementStatusKey(currentSubmission.status);
      const supervisedReject = await _supervisedLabReviewerCanReject(req, currentSubmission);
      const kaprodiReject = st === 'approved_by_kaur' && (await _kaprodiOwnsSubmissionStudyProgram(req, currentSubmission));
      if (isTpa) {
        /* ok */
      } else if (isKaur) {
        const kaurRejectOk =
          st === 'approved_by_tpa' ||
          (st === 'approved_by_kaur' && (await laboranPassSvc.hasPassLog(id, 'kaur')));
        if (!kaurRejectOk) return res.status(403).json({ error: 'Forbidden' });
      } else if (kaprodiReject) {
        /* ok */
      } else if (supervisedReject) {
        /* ok */
      } else {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (target === 'approved_by_kordas') {
      if (!(await _koordinatorAsistenCanActOnWaitingInLab(req, currentSubmission))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (target === 'approved_by_dosen_pembina') {
      if (!(await _dosenPembinaCanActOnApprovedByKordasInLab(req, currentSubmission))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (target === 'approved_by_tpa') {
      if (!_userHasRole(req.user, 'tpa')) return res.status(403).json({ error: 'Forbidden' });
      const st = String(currentSubmission.status || '').toLowerCase();
      // After dosen pembina approval, or legacy `submitted` pipeline
      if (st !== 'approved_by_dosen_pembina' && st !== 'submitted') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (target === 'submitted') {
      if (!_userHasRole(req.user, 'tpa')) return res.status(403).json({ error: 'Forbidden' });
    } else if (target === 'closed') {
      if (!_userHasRole(req.user, 'tpa')) return res.status(403).json({ error: 'Forbidden' });
      const stReimb = _normalizeProcurementStatusKey(currentSubmission.status);
      if (stReimb !== 'completed') {
        return res.status(422).json({ error: 'Only completed submissions can be marked closed' });
      }
    } else {
      if (!_userHasRole(req.user, 'tpa')) return res.status(403).json({ error: 'Forbidden' });
    }

    try {
      const signer = _jwtUserForSignerSnapshot(req);
      const actorName = displayNameFromJwtPayload(signer) || null;
      const updated = await svc.changeSubmissionStatus(id, req.user.id, target, {
        reason,
        actorName,
        actorRole: submissionStatusLogSvc.actorRoleForStatus(target),
      });
      if (!updated) return res.status(404).json({ error: 'Submission not found' });

      // Notify requester about manual status change (best-effort)
      try {
        notificationSvc.notifySubmissionStatusChange(updated.id, updated.requester_id, updated.status, target, { triggeredBy: req.user.id }, req.user.id);
      } catch (e) {
        // swallow errors from notification
      }

      return res.status(200).json({ success: true, data: updated });
    } catch (e) {
      // bubble known statuses
      if (e && e.code === 'INVALID') return res.status(400).json({ error: e.message });
      throw e;
    }
  } catch (err) {
    next(err);
  }
}
