import { reportingDb } from '../../../../config/databases.js';
import {
  KPA_T_COUNTABLE_REALISASI,
  budgetScopeSqlForAlias,
  sqlKpaTotalRealisasiByBudgetSubquery,
} from './kpaSqlHelpers.js';

export async function listProdiBudgets(periodId, scope = null) {
  const rq = sqlKpaTotalRealisasiByBudgetSubquery();
  const sc = budgetScopeSqlForAlias(scope, 'b', 2);
  const { rows } = await reportingDb.query(
    `SELECT b.*,
            (b.anggaran_tw1 + b.anggaran_tw2 + b.anggaran_tw3 + b.anggaran_tw4)::bigint AS total_anggaran,
            COALESCE(r.total_realisasi, 0)::bigint AS total_realisasi,
            (b.anggaran_tw1 + b.anggaran_tw2 + b.anggaran_tw3 + b.anggaran_tw4 -
             COALESCE(r.total_realisasi, 0))::bigint AS sisa_anggaran,
            CASE
              WHEN (b.anggaran_tw1 + b.anggaran_tw2 + b.anggaran_tw3 + b.anggaran_tw4) > 0
              THEN ROUND(COALESCE(r.total_realisasi, 0)::numeric /
                         (b.anggaran_tw1 + b.anggaran_tw2 + b.anggaran_tw3 + b.anggaran_tw4) * 100, 2)
              ELSE 0
            END AS persen_terpakai
       FROM kpa_prodi_budgets b
       LEFT JOIN ${rq} r ON r.prodi_budget_id = b.id
      WHERE b.period_id = $1 AND b.deleted_at IS NULL${sc.sql}
      ORDER BY b.nama_pp ASC`,
    [periodId, ...sc.params],
  );
  return rows;
}

export async function getProdiBudgetById(id) {
  const rq = sqlKpaTotalRealisasiByBudgetSubquery();
  const { rows } = await reportingDb.query(
    `SELECT b.*,
            (b.anggaran_tw1 + b.anggaran_tw2 + b.anggaran_tw3 + b.anggaran_tw4)::bigint AS total_anggaran,
            COALESCE(r.total_realisasi, 0)::bigint AS total_realisasi,
            (b.anggaran_tw1 + b.anggaran_tw2 + b.anggaran_tw3 + b.anggaran_tw4 -
             COALESCE(r.total_realisasi, 0))::bigint AS sisa_anggaran,
            CASE
              WHEN (b.anggaran_tw1 + b.anggaran_tw2 + b.anggaran_tw3 + b.anggaran_tw4) > 0
              THEN ROUND(COALESCE(r.total_realisasi, 0)::numeric /
                         (b.anggaran_tw1 + b.anggaran_tw2 + b.anggaran_tw3 + b.anggaran_tw4) * 100, 2)
              ELSE 0
            END AS persen_terpakai
       FROM kpa_prodi_budgets b
       LEFT JOIN ${rq} r ON r.prodi_budget_id = b.id
      WHERE b.id = $1 AND b.deleted_at IS NULL`,
    [id],
  );
  return rows[0] || null;
}

export async function upsertProdiBudget({
  periodId, kodePP, namaPP, kodeAkun, namaAkun, noDrk, kegiatan,
  anggaranTw1, anggaranTw2, anggaranTw3, anggaranTw4, createdBy,
}) {
  const { rows } = await reportingDb.query(
    `INSERT INTO kpa_prodi_budgets
       (period_id, kode_pp, nama_pp, kode_akun, nama_akun, no_drk, kegiatan,
        anggaran_tw1, anggaran_tw2, anggaran_tw3, anggaran_tw4, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [periodId, kodePP, namaPP, kodeAkun, namaAkun, noDrk, kegiatan,
      anggaranTw1, anggaranTw2, anggaranTw3, anggaranTw4, createdBy],
  );
  return rows[0];
}

export async function updateProdiBudget(id, {
  kodePP, namaPP, kodeAkun, namaAkun, noDrk, kegiatan,
  anggaranTw1, anggaranTw2, anggaranTw3, anggaranTw4,
}) {
  const { rows } = await reportingDb.query(
    `UPDATE kpa_prodi_budgets
        SET kode_pp = $2,
            nama_pp = $3, kode_akun = $4, nama_akun = $5, no_drk = $6, kegiatan = $7,
            anggaran_tw1 = $8, anggaran_tw2 = $9, anggaran_tw3 = $10, anggaran_tw4 = $11,
            updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *`,
    [id, kodePP ?? null, namaPP, kodeAkun, namaAkun, noDrk, kegiatan,
      anggaranTw1, anggaranTw2, anggaranTw3, anggaranTw4],
  );
  return rows[0] || null;
}

export async function insertProdiBudgetClient(client, {
  periodId, kodePP, namaPP, kodeAkun, namaAkun, noDrk, kegiatan,
  anggaranTw1, anggaranTw2, anggaranTw3, anggaranTw4, createdBy,
}) {
  const { rows } = await client.query(
    `INSERT INTO kpa_prodi_budgets
       (period_id, kode_pp, nama_pp, kode_akun, nama_akun, no_drk, kegiatan,
        anggaran_tw1, anggaran_tw2, anggaran_tw3, anggaran_tw4, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [periodId, kodePP, namaPP, kodeAkun, namaAkun, noDrk, kegiatan,
      anggaranTw1, anggaranTw2, anggaranTw3, anggaranTw4, createdBy],
  );
  return rows[0];
}

export async function getPeriodSummary(periodId, scope = null) {
  const sc1 = budgetScopeSqlForAlias(scope, 'b', 2);
  const { rows: overall } = await reportingDb.query(
    `SELECT
       COALESCE(SUM(b.anggaran_tw1), 0)::bigint AS anggaran_tw1,
       COALESCE(SUM(b.anggaran_tw2), 0)::bigint AS anggaran_tw2,
       COALESCE(SUM(b.anggaran_tw3), 0)::bigint AS anggaran_tw3,
       COALESCE(SUM(b.anggaran_tw4), 0)::bigint AS anggaran_tw4,
       COALESCE(SUM(b.anggaran_tw1+b.anggaran_tw2+b.anggaran_tw3+b.anggaran_tw4),0)::bigint AS total_anggaran
     FROM kpa_prodi_budgets b
    WHERE b.period_id = $1 AND b.deleted_at IS NULL${sc1.sql}`,
    [periodId, ...sc1.params],
  );

  const sc2 = budgetScopeSqlForAlias(scope, 'b', 2);
  const { rows: realisasi } = await reportingDb.query(
    `WITH grp AS (
        SELECT t.prodi_budget_id,
               t.triwulan,
               COALESCE(NULLIF(TRIM(t.no_bukti), ''), '#' || t.id::text) AS bukti_grp,
               SUM(t.debet)::bigint AS sd,
               SUM(t.kredit)::bigint AS sk
          FROM kpa_transactions t
          JOIN kpa_prodi_budgets b ON b.id = t.prodi_budget_id AND b.deleted_at IS NULL
         WHERE b.period_id = $1 AND t.deleted_at IS NULL${sc2.sql}
           AND ${KPA_T_COUNTABLE_REALISASI}
       GROUP BY t.prodi_budget_id, t.triwulan,
                COALESCE(NULLIF(TRIM(t.no_bukti), ''), '#' || t.id::text)
      ),
      parts AS (
        SELECT triwulan,
               CASE
                 WHEN sd > 0 AND sk > 0 THEN LEAST(sd, sk)
                 WHEN sd > 0 THEN sd
                 WHEN sk > 0 THEN sk
                 ELSE 0::bigint
               END AS real_part
          FROM grp
      )
     SELECT triwulan, SUM(real_part)::bigint AS realisasi
       FROM parts
      GROUP BY triwulan
      ORDER BY triwulan`,
    [periodId, ...sc2.params],
  );

  const realisasiMap = { 1: 0, 2: 0, 3: 0, 4: 0 };
  realisasi.forEach((r) => { realisasiMap[r.triwulan] = parseInt(r.realisasi); });

  const totalRealisasi = Object.values(realisasiMap).reduce((a, b) => a + b, 0);
  const o = overall[0];

  return {
    anggaran_tw1: parseInt(o.anggaran_tw1),
    anggaran_tw2: parseInt(o.anggaran_tw2),
    anggaran_tw3: parseInt(o.anggaran_tw3),
    anggaran_tw4: parseInt(o.anggaran_tw4),
    total_anggaran: parseInt(o.total_anggaran),
    realisasi_tw1: realisasiMap[1],
    realisasi_tw2: realisasiMap[2],
    realisasi_tw3: realisasiMap[3],
    realisasi_tw4: realisasiMap[4],
    total_realisasi: totalRealisasi,
    sisa_anggaran: parseInt(o.total_anggaran) - totalRealisasi,
    persen_terpakai: parseInt(o.total_anggaran) > 0
      ? parseFloat(((totalRealisasi / parseInt(o.total_anggaran)) * 100).toFixed(2))
      : 0,
  };
}

export async function getBudgetSummaryOnly(prodiBudgetId) {
  const b = await getProdiBudgetById(prodiBudgetId);
  if (!b) return null;

  const { rows } = await reportingDb.query(
    `WITH grp AS (
        SELECT t.triwulan,
               COALESCE(NULLIF(TRIM(t.no_bukti), ''), '#' || t.id::text) AS bukti_grp,
               SUM(t.debet)::bigint AS sd,
               SUM(t.kredit)::bigint AS sk
          FROM kpa_transactions t
         WHERE t.prodi_budget_id = $1 AND t.deleted_at IS NULL
           AND ${KPA_T_COUNTABLE_REALISASI}
       GROUP BY t.triwulan,
                COALESCE(NULLIF(TRIM(t.no_bukti), ''), '#' || t.id::text)
      ),
      parts AS (
        SELECT triwulan,
               CASE
                 WHEN sd > 0 AND sk > 0 THEN LEAST(sd, sk)
                 WHEN sd > 0 THEN sd
                 WHEN sk > 0 THEN sk
                 ELSE 0::bigint
               END AS real_part
          FROM grp
      )
     SELECT triwulan, SUM(real_part)::bigint AS realisasi
       FROM parts
      GROUP BY triwulan
      ORDER BY triwulan`,
    [prodiBudgetId],
  );

  const realisasiMap = { 1: 0, 2: 0, 3: 0, 4: 0 };
  rows.forEach((r) => {
    realisasiMap[r.triwulan] = parseInt(r.realisasi, 10);
  });

  const a1 = parseInt(b.anggaran_tw1, 10);
  const a2 = parseInt(b.anggaran_tw2, 10);
  const a3 = parseInt(b.anggaran_tw3, 10);
  const a4 = parseInt(b.anggaran_tw4, 10);
  const totalAnggaran = a1 + a2 + a3 + a4;

  const r1 = realisasiMap[1];
  const r2 = realisasiMap[2];
  const r3 = realisasiMap[3];
  const r4 = realisasiMap[4];
  const totalRealisasi = r1 + r2 + r3 + r4;

  return {
    anggaran_tw1: a1,
    anggaran_tw2: a2,
    anggaran_tw3: a3,
    anggaran_tw4: a4,
    total_anggaran: totalAnggaran,
    realisasi_tw1: r1,
    realisasi_tw2: r2,
    realisasi_tw3: r3,
    realisasi_tw4: r4,
    total_realisasi: totalRealisasi,
    sisa_anggaran: totalAnggaran - totalRealisasi,
    persen_terpakai: totalAnggaran > 0
      ? parseFloat(((totalRealisasi / totalAnggaran) * 100).toFixed(2))
      : 0,
  };
}
