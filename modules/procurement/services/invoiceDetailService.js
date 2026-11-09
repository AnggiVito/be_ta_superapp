import { procurementDb } from '../../../config/databases.js';

function normalizeReceiptRole(receipt) {
  if (receipt.file_role) return receipt.file_role;
  const notes = String(receipt.notes || '').trim();
  if (!notes) return 'invoice';
  try {
    const decoded = JSON.parse(notes);
    if (decoded && typeof decoded === 'object' && decoded.file_role === 'payment_proof') {
      return 'payment_proof';
    }
  } catch (_) {
    if (notes.includes('payment_proof')) return 'payment_proof';
  }
  return 'invoice';
}

/** Keep newest row per (file_role + file_name); fixes double-save / legacy duplicate uploads. */
export function splitAndDedupeReceipts(receipts = []) {
  const seen = new Set();
  const invoiceFiles = [];
  const paymentProofFiles = [];
  for (const r of receipts) {
    const role = normalizeReceiptRole(r);
    const key = `${role}|${String(r.file_name || '').trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = { ...r, file_role: role };
    if (role === 'payment_proof') paymentProofFiles.push(row);
    else invoiceFiles.push(row);
  }
  return { invoiceFiles, paymentProofFiles };
}

export async function upsertInvoiceDetails(client, {
  submissionId,
  uploadedBy,
  invoiceDate,
  normalPrice,
  adjustments = [],
}) {
  const upsertQ = `
    INSERT INTO procurement_submission_invoice_details
      (submission_id, invoice_date, normal_price, uploaded_by, created_at, updated_at)
    VALUES ($1, $2, $3, $4, now(), now())
    ON CONFLICT (submission_id) DO UPDATE SET
      invoice_date = EXCLUDED.invoice_date,
      normal_price = EXCLUDED.normal_price,
      uploaded_by = EXCLUDED.uploaded_by,
      updated_at = now()
    RETURNING *`;
  const { rows } = await client.query(upsertQ, [
    submissionId,
    invoiceDate,
    normalPrice,
    uploadedBy,
  ]);
  const details = rows[0];

  await client.query(
    'DELETE FROM procurement_submission_invoice_adjustments WHERE submission_id = $1',
    [submissionId],
  );

  const savedAdjustments = [];
  for (let i = 0; i < adjustments.length; i += 1) {
    const adj = adjustments[i];
    const amount = Number(adj.amount);
    if (Number.isNaN(amount) || amount <= 0) continue;
    const title = String(adj.title || '').trim();
    const sign = adj.sign === 'minus' ? 'minus' : 'plus';
    const ins = await client.query(
      `INSERT INTO procurement_submission_invoice_adjustments
        (submission_id, title, amount, sign, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, now()) RETURNING *`,
      [submissionId, title, amount, sign, adj.sortOrder ?? i],
    );
    savedAdjustments.push(ins.rows[0]);
  }

  return { details, adjustments: savedAdjustments };
}

export async function getInvoiceDetailsBySubmission(submissionId) {
  const detailsRes = await procurementDb.query(
    'SELECT * FROM procurement_submission_invoice_details WHERE submission_id = $1',
    [submissionId],
  );
  const details = detailsRes.rows[0] || null;

  const adjRes = await procurementDb.query(
    `SELECT id, submission_id, title, amount, sign, sort_order, created_at
     FROM procurement_submission_invoice_adjustments
     WHERE submission_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [submissionId],
  );

  const receiptsRes = await procurementDb.query(
    `SELECT * FROM procurement_submission_receipts
     WHERE submission_id = $1
     ORDER BY created_at DESC`,
    [submissionId],
  );

  const { invoiceFiles, paymentProofFiles } = splitAndDedupeReceipts(receiptsRes.rows);

  const submissionRes = await procurementDb.query(
    'SELECT id, total_price, status FROM procurement_submission WHERE id = $1',
    [submissionId],
  );
  const submission = submissionRes.rows[0] || null;

  return {
    submission,
    details,
    adjustments: adjRes.rows,
    total_amount: submission?.total_price ?? null,
    invoice_files: invoiceFiles,
    payment_proof_files: paymentProofFiles,
  };
}

export default { upsertInvoiceDetails, getInvoiceDetailsBySubmission, splitAndDedupeReceipts };
