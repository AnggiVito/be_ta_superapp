import Joi from 'joi';
import * as draftSvc from '../services/draftService.js';
import * as submissionSvc from '../services/submissionService.js';
import * as submissionReferenceSvc from '../services/submissionReferenceService.js';
import * as submissionStatusLogSvc from '../services/submissionStatusLogService.js';
import { procurementDb, registrationDb } from '../../../config/databases.js';
import {
  SUBMISSION_REQUESTER_ALLOWED,
  normalizeSubmissionRequesterRole,
  preferTpaLaboranRequesterRole,
  collectUserRoleCandidates,
  resolveInitialSubmissionStatus,
  shouldAppendInitialSubmissionStatusLog,
} from '../utils/requesterRoleUtils.js';
import {
  isTpaOrLaboranRequesterRole,
  resolveLaboratoriumIntegraLab,
} from '../utils/laboratoriumIntegra.js';

// Minimal validation for drafts: items may be empty when saving draft, but on submit we require items
const draftCreateSchema = Joi.object({
  title: Joi.string().allow('', null).optional(),
  department: Joi.string().allow('', null).optional(),
  lab: Joi.string().allow('', null).optional(),
  items: Joi.array().items(
    Joi.object({
      item_name: Joi.string().min(1).required(),
      specification: Joi.string().allow('', null),
      quantity: Joi.number().integer().min(1).required(),
      unit_price: Joi.number().min(0).required(),
      unit: Joi.string().max(64).allow('', null).optional()
    })
  ).optional(),
  purpose: Joi.string().allow('', null).optional()
});

const submitValidation = Joi.object({
  study_program_id: Joi.alternatives().try(Joi.number().integer(), Joi.string()).allow(null),
  lab_id: Joi.alternatives().try(Joi.number().integer(), Joi.string()).allow(null),
  department: Joi.string().allow('', null),
  lab: Joi.string().allow('', null),
  items: Joi.array().items(
    Joi.object({
      item_name: Joi.string().min(1).required(),
      specification: Joi.string().allow('', null),
      quantity: Joi.number().integer().min(1).required(),
      unit_price: Joi.number().min(0).required(),
      unit: Joi.string().max(64).allow('', null).optional()
    })
  ).min(1).required(),
  purpose: Joi.string().allow('', null)
});

function isMeaningfulString(v) {
  return typeof v === 'string' && v.trim() !== '' && v.trim().toLowerCase() !== 'string';
}

function normalizeRole(raw) {
  return normalizeSubmissionRequesterRole(raw);
}

// POST /api/procurement/submission/drafts
export async function createDraft(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const payload = { ...req.body };
  // Accept unknown fields (metadata like title/version may exist) and persist draft payload as-is
  const { error } = draftCreateSchema.validate(payload, { allowUnknown: true, stripUnknown: false });
  if (error) return res.status(400).json({ error: error.message });

    const saved = await draftSvc.createDraft(req.user.id, payload, payload.title || null);
    return res.status(201).json({ success: true, data: saved });
  } catch (err) {
    // Final safety net: if stock changes between pre-check and item insertion,
    // convert service error into a user-facing out-of-stock warning.
    if (err?.code === 'INSUFFICIENT_STOCK' || err?.code === 'INVENTORY_NOT_FOUND') {
      return res.status(422).json({ error: 'Sorry, the item you requested is out of stock.' });
    }
    if (err?.code === 'INVENTORY_LINK_UNAVAILABLE') {
      return res.status(500).json({ error: 'Inventory linkage is not available. Please contact administrator.' });
    }
    next(err);
  }
}

// GET /api/procurement/submission/drafts
export async function listDrafts(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const rows = await draftSvc.getDraftsByUser(req.user.id, { limit, offset });
    return res.status(200).json({ success: true, data: rows, meta: { page, limit, count: rows.length } });
  } catch (err) {
    next(err);
  }
}

// GET /api/procurement/submission/drafts/:id
export async function getDraft(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const draft = await draftSvc.getDraftById(id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (String(draft.user_id) !== String(req.user.id)) return res.status(403).json({ error: 'Forbidden' });
    // return essential draft fields and the stored form data so client can prefill the form
    return res.status(200).json({ success: true, data: { id: draft.id, title: draft.title, version: draft.version, data: draft.data, created_at: draft.created_at, updated_at: draft.updated_at } });
  } catch (err) {
    next(err);
  }
}

// PUT /api/procurement/submission/drafts/:id
export async function updateDraft(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const payload = { ...req.body };
  // allow unknown keys so clients can store the same payload shape as submission create
  const { error } = draftCreateSchema.validate(payload, { allowUnknown: true, stripUnknown: false });
  if (error) return res.status(400).json({ error: error.message });

    const draft = await draftSvc.getDraftById(id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (String(draft.user_id) !== String(req.user.id)) return res.status(403).json({ error: 'Forbidden' });

  // perform merge update so client can send partial fields to update existing draft.data
  const updated = await draftSvc.updateDraftMerged(id, req.user.id, payload, payload.title || null);
  if (!updated) return res.status(404).json({ error: 'Draft not found or not owned by user' });
  return res.status(200).json({ success: true, data: { id: updated.id, title: updated.title, version: updated.version, data: updated.data, created_at: updated.created_at, updated_at: updated.updated_at } });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/procurement/submission/drafts/:id
export async function deleteDraft(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const draft = await draftSvc.getDraftById(id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (String(draft.user_id) !== String(req.user.id)) return res.status(403).json({ error: 'Forbidden' });

    const deleted = await draftSvc.deleteDraft(id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'Draft not found or not owned by user' });
    return res.status(200).json({ success: true, data: deleted });
  } catch (err) {
    next(err);
  }
}

// POST /api/procurement/submission/drafts/:id/submit
// Convert draft -> real submission
export async function submitDraft(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const draft = await draftSvc.getDraftById(id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (String(draft.user_id) !== String(req.user.id)) return res.status(403).json({ error: 'Forbidden' });

    const payload = draft.data;
  // allowUnknown true because draft may include metadata fields (title, version, etc.)
  const { error } = submitValidation.validate(payload, { allowUnknown: true });
    if (error) return res.status(400).json({ error: 'Draft invalid for submission: ' + error.message });

    // Build items and master fields similar to submissionController
    const items = payload.items.map(it => {
      const unit = Number(it.unit_price);
      const qty = Number(it.quantity);
      return {
        item_name: it.item_name,
        specification: it.specification || null,
        unit_price: unit,
        quantity: qty,
        total_price: unit * qty,
        inventory_id: it.inventoryId ?? it.inventory_id ?? null,
        unit: typeof it.unit === 'string' ? it.unit.trim() || null : null,
      };
    });
    const overall_total = items.reduce((s, it) => s + Number(it.total_price), 0);

    // Determine master item_name / specification / texts
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

    // Fill requester info from req.user
    const requester_id = req.user.id;
    const requester_name = req.user.full_name || req.user.name || req.user.username || null;
    // attempt to find a normalized role if present (scan roles array first)
    let rawRole = null;
    if (req.user.roles && Array.isArray(req.user.roles) && req.user.roles.length > 0) {
      for (const r of req.user.roles) {
        const candidate = typeof r === 'string' ? r : (r.role || r.name || null);
        if (normalizeRole(candidate)) {
          rawRole = candidate;
          break;
        }
      }
      if (!rawRole) {
        const first = req.user.roles[0];
        rawRole = typeof first === 'string' ? first : (first.role || first.name || null);
      }
    } else if (req.user.role) {
      rawRole = typeof req.user.role === 'string' ? req.user.role : (req.user.role.name || null);
    }
    const ALLOWED = SUBMISSION_REQUESTER_ALLOWED;
    let activeRolesFromLocal = [];

    // Try to find any normalized role among JWT/fetched/local that is allowed
    let normalized = null;

    // 1) Try raw/fetched role first
    if (rawRole) {
      const n = normalizeRole(rawRole);
      if (n && ALLOWED.includes(n)) normalized = n;
    }

    // 2) Scan JWT roles array for any allowed normalized role
    if (!normalized && req.user && Array.isArray(req.user.roles) && req.user.roles.length > 0) {
      for (const r of req.user.roles) {
        const candidate = typeof r === 'string' ? r : (r.role || r.name || null);
        const n = normalizeRole(candidate);
        if (n && ALLOWED.includes(n)) { normalized = n; break; }
      }
    }

    // 3) Fallback to local assigned roles
    if (!normalized) {
      try {
        const roleSvc = await import('../../user-management/services/roleService.js');
        const activeRoles = await roleSvc.getActiveUserRoles(req.user.id);
        activeRolesFromLocal = activeRoles;
        if (Array.isArray(activeRoles) && activeRoles.length > 0) {
          for (const ar of activeRoles) {
            const candidate = (ar && (ar.role || ar.name)) ? (ar.role || ar.name) : ar;
            const n = normalizeRole(candidate);
            if (n && ALLOWED.includes(n)) { normalized = n; break; }
          }
          if (normalized) {
            console.info('Draft submit: determined requester_role from local assigned roles', { userId: req.user.id, requester_role: normalized });
          } else {
            console.info('Draft submit: local assigned roles found but none normalized to allowed', { userId: req.user.id, activeRoles });
          }
        }
      } catch (e) {
        console.error('Error checking local user roles for draft submit fallback:', e?.message || e);
      }
    }

    if (!normalized) {
      return res.status(422).json({ error: 'Gagal menentukan role pemohon. Pastikan token valid dan user memiliki role yang diizinkan.' });
    }
    const roleCandidates = collectUserRoleCandidates(req.user, rawRole, null, activeRolesFromLocal);
    normalized = preferTpaLaboranRequesterRole(normalized, roleCandidates);
    const requester_role = normalized;
    if (!ALLOWED.includes(requester_role)) return res.status(403).json({ error: 'Role tidak diperbolehkan membuat submission' });

    let resolvedStudyProgramId = payload.study_program_id != null ? payload.study_program_id : null;
    let resolvedLabId = payload.lab_id != null ? payload.lab_id : null;
    let resolvedLabName = null;
    if (requester_role === 'koordinator_asisten') {
      const resolved = await submissionSvc.resolveDosenPembinaLabContext(requester_id);
      if (!resolved.labId) {
        return res.status(422).json({
          error: 'Laboratorium supervised belum diatur pada profil Anda. Hubungi laboran/TPA untuk penugasan laboratory.',
        });
      }
      resolvedLabId = resolved.labId;
      try {
        const lb = await registrationDb.query(
          'SELECT id, name, study_program_id FROM laboratories WHERE id = $1 LIMIT 1',
          [resolvedLabId],
        );
        if (!lb?.rows?.length) {
          return res.status(422).json({ error: 'Laboratorium supervised tidak ditemukan.' });
        }
        resolvedLabName = lb.rows[0].name || null;
        if (lb.rows[0].study_program_id) {
          resolvedStudyProgramId = lb.rows[0].study_program_id;
        }
      } catch (e) {
        console.error('Draft submit: KO supervised lab lookup failed', e?.message || e);
        return res.status(422).json({ error: 'Gagal memuat data laboratorium supervised.' });
      }
    }

    if (isTpaOrLaboranRequesterRole(requester_role)) {
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

    if (resolvedLabId) {
      try {
        const lb = await registrationDb.query('SELECT id, name FROM laboratories WHERE id = $1 LIMIT 1', [resolvedLabId]);
        if (!lb?.rows?.length) {
          return res.status(422).json({ error: 'Invalid lab_id' });
        }
        resolvedLabId = lb.rows[0].id;
        resolvedLabName = lb.rows[0].name || null;
      } catch (e) {
        console.error('Draft submit: lab_id validation failed', e?.message || e);
        return res.status(422).json({ error: 'Invalid lab_id' });
      }
    } else {
      return res.status(422).json({ error: 'Laboratory is required to submit' });
    }

    let submission_reference;
    try {
      submission_reference = await submissionReferenceSvc.allocateSubmissionReferenceTransactional({
        labId: resolvedLabId,
        labName: resolvedLabName || 'lab',
      });
    } catch (refErr) {
      console.error('Draft submit: reference allocation failed', refErr?.message || refErr);
      return res.status(500).json({ error: 'Failed to generate submission reference' });
    }

    const submissionPayload = {
      requester_name,
      requester_role,
      requester_id,
      study_program_id: resolvedStudyProgramId,
      lab_id: resolvedLabId,
      item_name: masterItemName,
      specification: masterSpecification,
      quantity_text: masterQuantityText,
      unit_price_text: masterUnitPriceText,
      total_price: overall_total,
      purpose: payload.purpose || null,
      submission_reference,
      status: resolveInitialSubmissionStatus('submit', requester_role),
    };

    // Before creating header, validate inventory availability for all inventory-backed items
    for (const it of items) {
      if (it.inventory_id != null) {
        // check inventory table exists and stock
        try {
          const tableRes = await procurementDb.query("SELECT to_regclass('public.procurement_inventory') as reg");
          const hasInv = tableRes.rows[0] && tableRes.rows[0].reg != null;
          if (hasInv) {
            const invRes = await procurementDb.query('SELECT stock FROM procurement_inventory WHERE id = $1', [it.inventory_id]);
            if (invRes.rowCount === 0) return res.status(422).json({ error: 'Sorry, the item you requested is out of stock.' });
            const stock = Number(invRes.rows[0].stock) || 0;
            if (Number(it.quantity) > stock) return res.status(422).json({ error: 'Sorry, the item you requested is out of stock.' });
          }
        } catch (e) {
          console.error('Draft submit: inventory availability check failed', e?.message || e);
          return res.status(500).json({ error: 'Failed to validate inventory availability' });
        }
      }
    }

    const created = await submissionSvc.create(submissionPayload);
    try {
      for (const it of items) {
        await submissionSvc.createItem(created.id, { ...it, status: 'pending' });
      }
    } catch (itemErr) {
      // Ensure failed draft-submit does not leave partial submission in waiting state.
      try {
        await submissionSvc.cancelSubmission(created.id, req.user.id);
      } catch (cleanupErr) {
        console.error('Draft submit cleanup failed after createItem error:', cleanupErr?.message || cleanupErr);
      }
      throw itemErr;
    }

    // delete draft after successful submission
    try { await draftSvc.deleteDraft(id, req.user.id); } catch (e) { /* swallow non-fatal */ }

    const result = await submissionSvc.findByIdWithItems(created.id);

    const initialStatus = submissionPayload.status;
    if (shouldAppendInitialSubmissionStatusLog(initialStatus)) {
      try {
        await submissionStatusLogSvc.appendStatusLog({
          submissionId: result.id,
          fromStatus: null,
          toStatus: initialStatus,
          actorUserId: requester_id,
          actorName: requester_name,
          actorRole: 'requester',
        });
      } catch (logErr) {
        console.error('submitDraft: initial status log failed', logErr?.message || logErr);
      }
    }

    return res.status(201).json(result);
  } catch (err) {
    // Final safety net: if stock changes between pre-check and item insertion,
    // convert service error into a user-facing out-of-stock warning.
    if (err?.code === 'INSUFFICIENT_STOCK' || err?.code === 'INVENTORY_NOT_FOUND') {
      return res.status(422).json({ error: 'Sorry, the item you requested is out of stock.' });
    }
    if (err?.code === 'INVENTORY_LINK_UNAVAILABLE') {
      return res.status(500).json({ error: 'Inventory linkage is not available. Please contact administrator.' });
    }
    next(err);
  }
}
