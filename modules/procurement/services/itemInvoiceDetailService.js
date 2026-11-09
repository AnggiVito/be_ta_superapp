import { procurementDb } from '../../../config/databases.js';
import { canJoinSubmissionItemInventory } from '../utils/schemaCapabilities.js';
import { splitAndDedupeReceipts } from './invoiceDetailService.js';

function normalizeLineItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, i) => {
    if (!entry || typeof entry !== 'object') return null;
    const title = String(entry.title ?? '').trim();
    const amount = Number(entry.amount);
    if (Number.isNaN(amount) || amount < 0) return null;
    if (title === '' && amount <= 0) return null;
    const sign = String(entry.sign ?? 'plus').toLowerCase() === 'minus' ? 'minus' : 'plus';
    return { title, amount, sign, sortOrder: i };
  }).filter(Boolean);
}

export async function upsertItemInvoiceDetails(client, {
  submissionId,
  submissionItemId,
  uploadedBy,
  normalPrice = null,
  actualPrice = null,
  lineItems = [],
}) {
  const normalized = normalizeLineItems(lineItems);
  const upsertQ = `
    INSERT INTO procurement_submission_item_invoice_details
      (submission_item_id, submission_id, normal_price, actual_price, line_items, uploaded_by, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, now(), now())
    ON CONFLICT (submission_item_id) DO UPDATE SET
      normal_price = EXCLUDED.normal_price,
      actual_price = EXCLUDED.actual_price,
      line_items = EXCLUDED.line_items,
      uploaded_by = EXCLUDED.uploaded_by,
      updated_at = now()
    RETURNING *`;
  const { rows } = await client.query(upsertQ, [
    submissionItemId,
    submissionId,
    normalPrice,
    actualPrice,
    JSON.stringify(normalized),
    uploadedBy,
  ]);
  const row = rows[0];
  let parsedLineItems = [];
  if (row?.line_items) {
    try {
      parsedLineItems = typeof row.line_items === 'string'
        ? JSON.parse(row.line_items)
        : row.line_items;
    } catch (_) {
      parsedLineItems = [];
    }
  }
  return { ...row, line_items: parsedLineItems };
}

export async function getItemInvoiceDetailsBySubmission(submissionId) {
  const joinInventory = await canJoinSubmissionItemInventory();
  const detailsRes = await procurementDb.query(
    joinInventory
      ? `SELECT d.*,
                i.inventory_id,
                i.item_name,
                i.unit_price,
                i.total_price AS item_total_price,
                pic.name AS category_name
         FROM procurement_submission_item_invoice_details d
         JOIN procurement_submission_items i ON i.id = d.submission_item_id
         LEFT JOIN procurement_inventory pi ON i.inventory_id = pi.id
         LEFT JOIN procurement_inventory_categories pic ON pi.category_id = pic.id
         WHERE d.submission_id = $1
         ORDER BY i.created_at ASC, i.id ASC`
      : `SELECT d.*,
                NULL::bigint AS inventory_id,
                i.item_name,
                i.unit_price,
                i.total_price AS item_total_price,
                NULL::text AS category_name
         FROM procurement_submission_item_invoice_details d
         JOIN procurement_submission_items i ON i.id = d.submission_item_id
         WHERE d.submission_id = $1
         ORDER BY i.created_at ASC, i.id ASC`,
    [submissionId],
  );

  const receiptsRes = await procurementDb.query(
    `SELECT * FROM procurement_submission_receipts
     WHERE submission_id = $1
     ORDER BY created_at DESC`,
    [submissionId],
  );
  const { invoiceFiles, paymentProofFiles } = splitAndDedupeReceipts(receiptsRes.rows);

  const globalReceipts = invoiceFiles.filter((r) => r.submission_item_id == null);
  const globalPaymentProof = paymentProofFiles;

  const itemInvoices = detailsRes.rows.map((row) => {
    let lineItems = [];
    try {
      lineItems = typeof row.line_items === 'string'
        ? JSON.parse(row.line_items)
        : (row.line_items || []);
    } catch (_) {
      lineItems = [];
    }
    const itemId = row.submission_item_id;
    const itemInvoiceFiles = invoiceFiles.filter(
      (r) => r.submission_item_id != null && String(r.submission_item_id) === String(itemId),
    );
    return {
      submission_item_id: itemId,
      inventory_id: row.inventory_id,
      item_name: row.item_name,
      category: row.category_name ?? null,
      unit_price: row.unit_price != null ? Number(row.unit_price) : null,
      normal_price: row.normal_price != null ? Number(row.normal_price) : null,
      actual_price: row.actual_price != null ? Number(row.actual_price) : null,
      line_items: lineItems,
      invoice_files: itemInvoiceFiles,
    };
  });

  return {
    item_invoices: itemInvoices,
    global_invoice_files: globalReceipts,
    payment_proof_files: globalPaymentProof,
  };
}

export default {
  upsertItemInvoiceDetails,
  getItemInvoiceDetailsBySubmission,
  normalizeLineItems,
};
