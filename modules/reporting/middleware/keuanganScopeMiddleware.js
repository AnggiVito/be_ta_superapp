/**
 * Menentukan scope data keuangan (KPA) per user.
 * KAPRODI tanpa role kelola (kaur/tpa/koordinator_praktikum/admin) hanya melihat baris anggaran PP miliknya,
 * berdasarkan klaim JWT (kode_pp / nama_pp atau nested lecturer_detail / employee).
 */

import { logger } from '../../../core/utils/logger.js';
import * as roleModel from '../../user-management/models/roleModel.js';

const PRIVILEGED_KEUANGAN_ROLES = new Set([
  'kaur',
  'kaur_lab',
  'tpa',
  'admin',
]);

/**
 * @param {Record<string, unknown>|null|undefined} user
 * @returns {{ kodePp: string|null, namaPp: string|null }}
 */
export function extractKpaScopeFromUser(user) {
  if (!user || typeof user !== 'object') {
    return { kodePp: null, namaPp: null };
  }
  const ld = user.lecturer_detail || user.lecturerDetail;
  const emp = user.employee;
  const rawKode =
    user.kode_pp ??
    user.kodePP ??
    user.kode_prodi ??
    user.prodi_kode ??
    user.unit_kode ??
    ld?.kode_pp ??
    ld?.kode_prodi ??
    ld?.prodi_kode ??
    emp?.kode_pp ??
    emp?.kode_prodi ??
    null;
  const rawNama =
    user.nama_pp ??
    user.nama_prodi ??
    user.prodi_nama ??
    user.unit_kerja ??
    ld?.nama_pp ??
    ld?.nama_prodi ??
    ld?.prodi ??
    emp?.nama_prodi ??
    null;

  const kodePp =
    rawKode != null && String(rawKode).trim() !== '' ? String(rawKode).trim() : null;
  const namaPp =
    rawNama != null && String(rawNama).trim() !== '' ? String(rawNama).trim() : null;

  return { kodePp, namaPp };
}

function jwtRoleSlugs(user) {
  const set = new Set();
  if (!user) return set;
  const push = (v) => {
    if (v == null || v === '') return;
    if (typeof v === 'string') {
      const s = v.toLowerCase().trim();
      if (s) set.add(s);
      return;
    }
    if (typeof v === 'object') {
      const s = String(
        v.slug ?? v.name ?? v.role ?? v.role_name ?? v.value ?? '',
      )
        .toLowerCase()
        .trim();
      if (s) set.add(s);
    }
  };
  if (user.role) {
    if (typeof user.role === 'string') push(user.role);
    else push(user.role);
  }
  if (Array.isArray(user.roles)) {
    for (const r of user.roles) push(r);
  }
  return set;
}

/**
 * Setelah validateJWT + requireViewReportAccess.
 * req.keuanganScope = { mode: 'all' } | { mode: 'kaprodi', kodePp, namaPp }
 */
export async function attachKeuanganAccessScope(req, res, next) {
  /** @type {{ mode: 'all'|'kaprodi', kodePp: string|null, namaPp: string|null }} */
  const allScope = { mode: 'all', kodePp: null, namaPp: null };
  req.keuanganScope = allScope;

  const userId = req.user?.id;
  if (!userId) return next();

  try {
    const dbRoles = await roleModel.getActiveUserRoles(String(userId));
    const roleSlugs = new Set(
      dbRoles.map((r) => String(r.role || '').toLowerCase().trim()).filter(Boolean),
    );
    for (const r of jwtRoleSlugs(req.user)) roleSlugs.add(r);

    for (const pr of PRIVILEGED_KEUANGAN_ROLES) {
      if (roleSlugs.has(pr)) return next();
    }

    if (!roleSlugs.has('kaprodi')) return next();

    const { kodePp, namaPp } = extractKpaScopeFromUser(req.user);
    req.keuanganScope = { mode: 'kaprodi', kodePp, namaPp };

    if (!kodePp && !namaPp) {
      logger.warn('Kaprodi tanpa kode_pp/nama_pp di JWT — laporan keuangan akan kosong sampai klaim diperkaya', {
        userId: String(userId),
        path: req.path,
      });
    }
  } catch (err) {
    logger.warn('attachKeuanganAccessScope gagal, fallback all:', err.message);
  }

  next();
}
