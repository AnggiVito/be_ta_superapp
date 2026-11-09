import { reportingDb } from '../../../../config/databases.js';

export async function listPeriods() {
  const { rows } = await reportingDb.query(
    `SELECT p.*,
            COALESCE(SUM(b.anggaran_tw1 + b.anggaran_tw2 + b.anggaran_tw3 + b.anggaran_tw4), 0)::bigint AS total_anggaran,
            COUNT(b.id)::int AS prodi_count
       FROM kpa_periods p
       LEFT JOIN kpa_prodi_budgets b ON b.period_id = p.id AND b.deleted_at IS NULL
      WHERE p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY p.tahun DESC`,
  );
  return rows;
}

export async function getPeriodById(id) {
  const { rows } = await reportingDb.query(
    `SELECT * FROM kpa_periods WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] || null;
}

export async function getPeriodByTahun(tahun) {
  const { rows } = await reportingDb.query(
    `SELECT * FROM kpa_periods WHERE tahun = $1 AND deleted_at IS NULL`,
    [tahun],
  );
  return rows[0] || null;
}

export async function createPeriod({ tahun, status = 'active', createdBy }) {
  const { rows } = await reportingDb.query(
    `INSERT INTO kpa_periods (tahun, status, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT ON CONSTRAINT kpa_periods_tahun_unique
     DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
     RETURNING *`,
    [tahun, status, createdBy],
  );
  return rows[0];
}
