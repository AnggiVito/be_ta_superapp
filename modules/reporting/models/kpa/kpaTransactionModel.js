import { reportingDb } from '../../../../config/databases.js';
import { budgetScopeSqlForAlias } from './kpaSqlHelpers.js';

export async function bulkInsertTransactions(prodiBudgetId, transactions, existingClient = null) {
  if (!transactions.length) return 0;

  const runInserts = async (client) => {
    for (const t of transactions) {
      await client.query(
        `INSERT INTO kpa_transactions
           (prodi_budget_id, triwulan, no_bukti, no_dokumen, tanggal,
            keterangan, debet, kredit, balance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [prodiBudgetId, t.triwulan, t.no_bukti, t.no_dokumen, t.tanggal,
          t.keterangan, t.debet, t.kredit, t.balance],
      );
    }
    return transactions.length;
  };

  if (existingClient) {
    return runInserts(existingClient);
  }

  const client = await reportingDb.connect();
  try {
    await client.query('BEGIN');
    const n = await runInserts(client);
    await client.query('COMMIT');
    return n;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function softDeleteAllKpaDataForPeriodClient(client, periodId) {
  await client.query(
    `UPDATE kpa_transactions t
        SET deleted_at = NOW(), updated_at = NOW()
       FROM kpa_prodi_budgets b
      WHERE t.prodi_budget_id = b.id
        AND b.period_id = $1
        AND b.deleted_at IS NULL
        AND t.deleted_at IS NULL`,
    [periodId],
  );
  await client.query(
    `UPDATE kpa_uploads
        SET deleted_at = NOW(), updated_at = NOW()
      WHERE period_id = $1 AND deleted_at IS NULL`,
    [periodId],
  );
  await client.query(
    `UPDATE kpa_prodi_budgets
        SET deleted_at = NOW(), updated_at = NOW()
      WHERE period_id = $1 AND deleted_at IS NULL`,
    [periodId],
  );
}

export async function listTransactions(periodId, { triwulan, kodePP, prodiBudgetId, search, kpaScope } = {}) {
  let query = `
    SELECT t.*, b.nama_pp, b.kode_pp
      FROM kpa_transactions t
      JOIN kpa_prodi_budgets b ON b.id = t.prodi_budget_id AND b.deleted_at IS NULL
     WHERE b.period_id = $1 AND t.deleted_at IS NULL`;
  const params = [periodId];
  let idx = 2;

  if (kpaScope?.mode === 'kaprodi') {
    const sc = budgetScopeSqlForAlias(kpaScope, 'b', idx);
    query += sc.sql;
    params.push(...sc.params);
    idx += sc.params.length;
  } else if (kodePP) {
    query += ` AND b.kode_pp = $${idx++}`;
    params.push(kodePP);
  }

  if (triwulan) {
    query += ` AND t.triwulan = $${idx++}`;
    params.push(triwulan);
  }
  if (prodiBudgetId) {
    query += ` AND b.id = $${idx++}`;
    params.push(prodiBudgetId);
  }
  if (search) {
    query += ` AND (LOWER(t.keterangan) LIKE $${idx} OR LOWER(t.no_bukti) LIKE $${idx})`;
    params.push(`%${search.toLowerCase()}%`);
    idx++;
  }
  query += ` ORDER BY t.triwulan ASC, t.tanggal ASC NULLS LAST, t.id ASC`;

  const { rows } = await reportingDb.query(query, params);
  return rows;
}

export async function softDeleteTransactionsForBudget(prodiBudgetId) {
  const { rowCount } = await reportingDb.query(
    `UPDATE kpa_transactions
        SET deleted_at = NOW(), updated_at = NOW()
      WHERE prodi_budget_id = $1 AND deleted_at IS NULL`,
    [prodiBudgetId],
  );
  return rowCount;
}

export async function insertYearReplaceEventClient(client, {
  periodId, tahun, occurredBy, fileName, transactionCount, uploadId, prodiBudgetId,
}) {
  await client.query(
    `INSERT INTO kpa_year_replace_events
       (period_id, tahun, occurred_by, file_name, transaction_count, upload_id, prodi_budget_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [periodId, tahun, occurredBy, fileName, transactionCount, uploadId, prodiBudgetId],
  );
}
