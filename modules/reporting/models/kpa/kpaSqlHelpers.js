/**
 * Shared SQL helpers for KPA models.
 */

export const KPA_T_COUNTABLE_REALISASI = `(
          t.keterangan IS NULL OR NOT (
            LOWER(BTRIM(t.keterangan)) LIKE 'awal anggaran%'
            OR LOWER(BTRIM(t.keterangan)) LIKE 'saldo awal%'
          )
        )`;

export function budgetScopeSqlForAlias(scope, alias, startParamIndex) {
  if (!scope || scope.mode !== 'kaprodi') return { sql: '', params: [] };
  const a = alias;
  const i = startParamIndex;
  if (scope.kodePp && scope.namaPp) {
    return {
      sql: ` AND (${a}.kode_pp = $${i} OR ${a}.nama_pp ILIKE $${i + 1})`,
      params: [scope.kodePp, `%${scope.namaPp}%`],
    };
  }
  if (scope.kodePp) {
    return { sql: ` AND ${a}.kode_pp = $${i}`, params: [scope.kodePp] };
  }
  if (scope.namaPp) {
    return { sql: ` AND ${a}.nama_pp ILIKE $${i}`, params: [`%${scope.namaPp}%`] };
  }
  return { sql: ' AND FALSE', params: [] };
}

export function sqlKpaTotalRealisasiByBudgetSubquery() {
  return `(
    SELECT grp.prodi_budget_id,
           SUM(
             CASE
               WHEN grp.sd > 0 AND grp.sk > 0 THEN LEAST(grp.sd, grp.sk)
               WHEN grp.sd > 0 THEN grp.sd
               WHEN grp.sk > 0 THEN grp.sk
               ELSE 0::bigint
             END
           )::bigint AS total_realisasi
      FROM (
             SELECT t.prodi_budget_id,
                    t.triwulan,
                    COALESCE(NULLIF(TRIM(t.no_bukti), ''), '#' || t.id::text) AS bukti_grp,
                    SUM(t.debet)::bigint AS sd,
                    SUM(t.kredit)::bigint AS sk
               FROM kpa_transactions t
              WHERE t.deleted_at IS NULL
                AND ${KPA_T_COUNTABLE_REALISASI}
           GROUP BY t.prodi_budget_id, t.triwulan,
                    COALESCE(NULLIF(TRIM(t.no_bukti), ''), '#' || t.id::text)
           ) grp
  GROUP BY grp.prodi_budget_id
  )`;
}
