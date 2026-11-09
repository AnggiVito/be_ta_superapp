/**
 * Read-only loader: item procurement untuk compare keuangan (tanpa mengubah modul procurement).
 */

import { procurementDb, registrationDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * @returns {Promise<{ byId: Map, byCode: Map, byName: Map, rows: object[] }>}
 */
export async function loadStudyProgramIndex() {
  const { rows } = await registrationDb.query(
    `SELECT id::text AS id, code, name FROM study_programs ORDER BY name`
  );
  const byId = new Map();
  const byCode = new Map();

  for (const row of rows) {
    const entry = {
      id: row.id,
      code: row.code ? String(row.code).trim() : null,
      name: row.name ? String(row.name).trim() : '',
    };
    byId.set(entry.id, entry);
    if (entry.code) byCode.set(entry.code.toLowerCase(), entry);
  }

  return { byId, byCode, rows };
}

/**
 * @returns {Promise<Map<string, string>>}
 */
export async function loadLaboratoryNameIndex() {
  const { rows } = await registrationDb.query(
    `SELECT id::text AS id, name FROM laboratories`
  );
  return new Map(rows.map((r) => [String(r.id), String(r.name ?? '').trim()]));
}

export function resolveStudyProgramForLaboranSheet(sheetMeta, spIndex) {
  const kode = String(sheetMeta?.kode_pp ?? '').trim();
  const nama = String(sheetMeta?.nama_pp ?? '').trim().toLowerCase();

  if (kode && spIndex.byCode.has(kode.toLowerCase())) {
    return spIndex.byCode.get(kode.toLowerCase()).id;
  }
  if (kode && spIndex.byId.has(kode)) {
    return kode;
  }
  if (nama) {
    for (const sp of spIndex.rows) {
      const spName = String(sp.name ?? '').toLowerCase();
      if (spName === nama || spName.includes(nama) || nama.includes(spName)) {
        return sp.id;
      }
    }
  }
  return null;
}

/**
 * @param {{ tahun: number, studyProgramIds?: string[]|null }} opts
 */
export async function loadProcurementItemsForCompare({ tahun, studyProgramIds = null }) {
  const year = Number(tahun);
  if (!Number.isFinite(year)) return [];

  const params = [year];
  let spFilter = '';
  if (Array.isArray(studyProgramIds) && studyProgramIds.length > 0) {
    params.push(studyProgramIds);
    spFilter = ` AND s.study_program_id = ANY($${params.length}::uuid[])`;
  }

  const query = `
    SELECT
      i.id::text AS submission_item_id,
      i.submission_id::text AS submission_id,
      i.item_name,
      i.quantity,
      i.unit_price,
      ROUND(COALESCE(i.total_price, 0))::bigint AS total_price,
      s.submission_reference,
      s.purpose,
      s.status,
      s.funding_choice,
      s.lab_id::text AS lab_id,
      s.study_program_id::text AS study_program_id,
      s.created_at,
      inv.invoice_date,
      COALESCE(inv.invoice_date, s.created_at::date) AS transaction_date
    FROM procurement_submission_items i
    INNER JOIN procurement_submission s ON s.id = i.submission_id
    LEFT JOIN procurement_submission_invoice_details inv ON inv.submission_id = s.id
    WHERE lower(trim(COALESCE(s.status, ''))) IN ('completed', 'closed')
      AND (
        lower(trim(COALESCE(s.funding_choice, ''))) = 'program_fund'
        OR trim(COALESCE(s.funding_choice, '')) = ''
      )
      AND EXTRACT(YEAR FROM COALESCE(inv.invoice_date, s.created_at)) = $1
      ${spFilter}
    ORDER BY COALESCE(inv.invoice_date, s.created_at) ASC, i.id ASC`;

  try {
    const { rows } = await procurementDb.query(query, params);
    return rows.map((row) => ({
      submission_item_id: row.submission_item_id,
      submission_id: row.submission_id,
      item_name: row.item_name,
      quantity: row.quantity,
      unit_price: row.unit_price,
      total_price: Number(row.total_price) || 0,
      submission_reference: row.submission_reference,
      purpose: row.purpose,
      status: row.status,
      funding_choice: row.funding_choice,
      lab_id: row.lab_id,
      study_program_id: row.study_program_id,
      transaction_date: row.transaction_date
        ? String(row.transaction_date).slice(0, 10)
        : null,
      created_at: row.created_at,
    }));
  } catch (err) {
    logger.error('loadProcurementItemsForCompare failed:', err);
    throw new Error(`Gagal memuat data procurement untuk compare: ${err.message}`);
  }
}
