import { procurementDb } from '../../../config/databases.js';
import * as notificationSvc from './notificationService.js';
import * as invoiceDetailSvc from './invoiceDetailService.js';
import * as itemInvoiceDetailSvc from './itemInvoiceDetailService.js';

async function findExistingReceipt(client, submissionId, fileName, fileRole, submissionItemId = null) {
  const { rows } = await client.query(
    `SELECT * FROM procurement_submission_receipts
     WHERE submission_id = $1 AND file_name = $2 AND COALESCE(file_role, 'invoice') = $3
       AND (
         ($4::bigint IS NULL AND submission_item_id IS NULL)
         OR submission_item_id = $4
       )
     ORDER BY id DESC LIMIT 1`,
    [submissionId, fileName, fileRole, submissionItemId],
  );
  return rows[0] || null;
}

async function insertReceipt(client, {
  submissionId,
  submissionItemId = null,
  uploadedBy,
  filePath,
  fileName,
  mimeType,
  realizedPrice = null,
  currency = null,
  notes = null,
  fileRole = 'invoice',
}) {
  const insertQ = `INSERT INTO procurement_submission_receipts
    (submission_id, submission_item_id, uploaded_by, file_path, file_name, mime_type, realized_price, currency, notes, file_role, status, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'uploaded', now(), now()) RETURNING *`;
  const vals = [
    submissionId,
    submissionItemId,
    uploadedBy,
    filePath,
    fileName,
    mimeType,
    realizedPrice,
    currency,
    notes,
    fileRole,
  ];
  const { rows } = await client.query(insertQ, vals);
  return rows[0];
}

export async function createReceipt({
  submissionId,
  uploadedBy,
  filePath,
  fileName,
  mimeType,
  realizedPrice = null,
  currency = null,
  notes = null,
  fileRole = 'invoice',
}) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const receipt = await insertReceipt(client, {
      submissionId,
      uploadedBy,
      filePath,
      fileName,
      mimeType,
      realizedPrice,
      currency,
      notes,
      fileRole,
    });

    // update submission status to 'on_going' and set total_price if realizedPrice provided
    const updParts = [];
    const updVals = [];
    let idx = 1;
    if (realizedPrice !== null && typeof realizedPrice !== 'undefined') {
      updParts.push(`total_price = $${idx++}`);
      updVals.push(realizedPrice);
    }
    updParts.push(`status = $${idx++}`);
    updVals.push('on_going');
    // submission id param
    updVals.push(submissionId);
    const updQ = `UPDATE procurement_submission SET ${updParts.join(',')}, updated_at = now() WHERE id = $${idx} RETURNING *`;
    const updRes = await client.query(updQ, updVals);
    const updatedSubmission = updRes.rows[0];

    await client.query('COMMIT');

    // notify requester (best-effort, outside transaction)
    try {
      if (updatedSubmission) {
        notificationSvc.notifySubmissionStatusChange(updatedSubmission.id, updatedSubmission.requester_id, null, 'on_going', { triggeredBy: uploadedBy }, uploadedBy).catch(() => {});
      }
    } catch (e) { /* swallow */ }

    return receipt;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function createManyReceiptsAndMarkOnGoing({
  submissionId,
  uploadedBy,
  files = [],
  totalAmount = null,
  notes = null,
  fileRole = 'invoice',
}) {
  return saveInvoicePackage({
    submissionId,
    uploadedBy,
    invoiceDate: null,
    normalPrice: null,
    adjustments: [],
    totalAmount,
    invoiceFiles: files,
    paymentProofFiles: [],
    notes,
    fileRole,
    skipInvoiceDetails: true,
  });
}

export async function saveInvoicePackage({
  submissionId,
  uploadedBy,
  invoiceDate,
  normalPrice,
  adjustments = [],
  totalAmount,
  invoiceFiles = [],
  paymentProofFiles = [],
  skipInvoiceDetails = false,
}) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    let invoiceDetails = null;
    let savedAdjustments = [];
    if (!skipInvoiceDetails && invoiceDate && normalPrice !== null) {
      const saved = await invoiceDetailSvc.upsertInvoiceDetails(client, {
        submissionId,
        uploadedBy,
        invoiceDate,
        normalPrice,
        adjustments,
      });
      invoiceDetails = saved.details;
      savedAdjustments = saved.adjustments;
    }

    const createdInvoiceReceipts = [];
    for (const f of invoiceFiles) {
      const existing = await findExistingReceipt(client, submissionId, f.fileName, 'invoice', null);
      if (existing) {
        createdInvoiceReceipts.push(existing);
        continue;
      }
      const row = await insertReceipt(client, {
        submissionId,
        uploadedBy,
        filePath: f.filePath,
        fileName: f.fileName,
        mimeType: f.mimeType,
        fileRole: 'invoice',
      });
      createdInvoiceReceipts.push(row);
    }

    const createdPaymentProofReceipts = [];
    for (const f of paymentProofFiles) {
      const existing = await findExistingReceipt(client, submissionId, f.fileName, 'payment_proof', null);
      if (existing) {
        createdPaymentProofReceipts.push(existing);
        continue;
      }
      const row = await insertReceipt(client, {
        submissionId,
        uploadedBy,
        filePath: f.filePath,
        fileName: f.fileName,
        mimeType: f.mimeType,
        fileRole: 'payment_proof',
      });
      createdPaymentProofReceipts.push(row);
    }

    const updParts = ['status = $1'];
    const updVals = ['on_going'];
    let idx = 2;
    if (totalAmount !== null && typeof totalAmount !== 'undefined') {
      updParts.push(`total_price = $${idx++}`);
      updVals.push(totalAmount);
    }
    updVals.push(submissionId);
    const updQ = `UPDATE procurement_submission SET ${updParts.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`;
    const updRes = await client.query(updQ, updVals);
    const updatedSubmission = updRes.rows[0] || null;

    await client.query('COMMIT');

    try {
      if (updatedSubmission) {
        notificationSvc.notifySubmissionStatusChange(
          updatedSubmission.id,
          updatedSubmission.requester_id,
          null,
          'on_going',
          { triggeredBy: uploadedBy },
          uploadedBy,
        ).catch(() => {});
      }
    } catch (_) {}

    return {
      invoice_details: invoiceDetails,
      adjustments: savedAdjustments,
      invoice_receipts: createdInvoiceReceipts,
      payment_proof_receipts: createdPaymentProofReceipts,
      submission: updatedSubmission,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function saveItemNormalsInvoicePackage({
  submissionId,
  uploadedBy,
  invoiceDate,
  itemNormals = [],
  adjustments = [],
  totalAmount,
  invoiceFiles = [],
  paymentProofFiles = [],
}) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const normalSum = itemNormals.reduce(
      (sum, row) => sum + Number(row.normalPrice || 0),
      0,
    );

    const saved = await invoiceDetailSvc.upsertInvoiceDetails(client, {
      submissionId,
      uploadedBy,
      invoiceDate,
      normalPrice: normalSum,
      adjustments,
    });

    const savedItemDetails = [];
    for (const item of itemNormals) {
      const detail = await itemInvoiceDetailSvc.upsertItemInvoiceDetails(client, {
        submissionId,
        submissionItemId: item.submissionItemId,
        uploadedBy,
        normalPrice: item.normalPrice,
        actualPrice: item.actualPrice ?? item.normalPrice,
        lineItems: [],
      });
      savedItemDetails.push(detail);
    }

    const createdInvoiceReceipts = [];
    for (const f of invoiceFiles) {
      const existing = await findExistingReceipt(client, submissionId, f.fileName, 'invoice', null);
      if (existing) {
        createdInvoiceReceipts.push(existing);
        continue;
      }
      const row = await insertReceipt(client, {
        submissionId,
        uploadedBy,
        filePath: f.filePath,
        fileName: f.fileName,
        mimeType: f.mimeType,
        fileRole: 'invoice',
      });
      createdInvoiceReceipts.push(row);
    }

    const createdPaymentProofReceipts = [];
    for (const f of paymentProofFiles) {
      const existing = await findExistingReceipt(client, submissionId, f.fileName, 'payment_proof', null);
      if (existing) {
        createdPaymentProofReceipts.push(existing);
        continue;
      }
      const row = await insertReceipt(client, {
        submissionId,
        uploadedBy,
        filePath: f.filePath,
        fileName: f.fileName,
        mimeType: f.mimeType,
        fileRole: 'payment_proof',
      });
      createdPaymentProofReceipts.push(row);
    }

    const updParts = ['status = $1'];
    const updVals = ['on_going'];
    let idx = 2;
    if (totalAmount !== null && typeof totalAmount !== 'undefined') {
      updParts.push(`total_price = $${idx++}`);
      updVals.push(totalAmount);
    }
    updVals.push(submissionId);
    const updQ = `UPDATE procurement_submission SET ${updParts.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`;
    const updRes = await client.query(updQ, updVals);
    const updatedSubmission = updRes.rows[0] || null;

    await client.query('COMMIT');

    try {
      if (updatedSubmission) {
        notificationSvc.notifySubmissionStatusChange(
          updatedSubmission.id,
          updatedSubmission.requester_id,
          null,
          'on_going',
          { triggeredBy: uploadedBy },
          uploadedBy,
        ).catch(() => {});
      }
    } catch (_) {}

    return {
      mode: 'item_normals',
      invoice_details: saved.details,
      adjustments: saved.adjustments,
      item_invoice_details: savedItemDetails,
      invoice_receipts: createdInvoiceReceipts,
      payment_proof_receipts: createdPaymentProofReceipts,
      submission: updatedSubmission,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function savePerItemInvoicePackage({
  submissionId,
  uploadedBy,
  invoiceDate,
  itemInvoices = [],
  invoiceFilesByItemId = {},
  paymentProofFiles = [],
  totalAmount,
  existingItemInvoiceFiles = {},
}) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    if (invoiceDate) {
      await invoiceDetailSvc.upsertInvoiceDetails(client, {
        submissionId,
        uploadedBy,
        invoiceDate,
        normalPrice: 0,
        adjustments: [],
      });
    }

    const savedItemDetails = [];
    for (const item of itemInvoices) {
      const detail = await itemInvoiceDetailSvc.upsertItemInvoiceDetails(client, {
        submissionId,
        submissionItemId: item.submissionItemId,
        uploadedBy,
        normalPrice: item.normalPrice,
        actualPrice: item.actualPrice,
        lineItems: item.lineItems,
      });
      savedItemDetails.push(detail);
    }

    const createdInvoiceReceipts = [];
    for (const [itemIdKey, files] of Object.entries(invoiceFilesByItemId)) {
      const itemId = Number(itemIdKey);
      for (const f of files) {
        const existing = await findExistingReceipt(client, submissionId, f.fileName, 'invoice', itemId);
        if (existing) {
          createdInvoiceReceipts.push(existing);
          continue;
        }
        const row = await insertReceipt(client, {
          submissionId,
          submissionItemId: itemId,
          uploadedBy,
          filePath: f.filePath,
          fileName: f.fileName,
          mimeType: f.mimeType,
          fileRole: 'invoice',
        });
        createdInvoiceReceipts.push(row);
      }
    }

    const createdPaymentProofReceipts = [];
    for (const f of paymentProofFiles) {
      const existing = await findExistingReceipt(client, submissionId, f.fileName, 'payment_proof', null);
      if (existing) {
        createdPaymentProofReceipts.push(existing);
        continue;
      }
      const row = await insertReceipt(client, {
        submissionId,
        uploadedBy,
        filePath: f.filePath,
        fileName: f.fileName,
        mimeType: f.mimeType,
        fileRole: 'payment_proof',
      });
      createdPaymentProofReceipts.push(row);
    }

    const updParts = ['status = $1'];
    const updVals = ['on_going'];
    let idx = 2;
    if (totalAmount !== null && typeof totalAmount !== 'undefined') {
      updParts.push(`total_price = $${idx++}`);
      updVals.push(totalAmount);
    }
    updVals.push(submissionId);
    const updQ = `UPDATE procurement_submission SET ${updParts.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`;
    const updRes = await client.query(updQ, updVals);
    const updatedSubmission = updRes.rows[0] || null;

    await client.query('COMMIT');

    try {
      if (updatedSubmission) {
        notificationSvc.notifySubmissionStatusChange(
          updatedSubmission.id,
          updatedSubmission.requester_id,
          null,
          'on_going',
          { triggeredBy: uploadedBy },
          uploadedBy,
        ).catch(() => {});
      }
    } catch (_) {}

    return {
      mode: 'per_item',
      item_invoice_details: savedItemDetails,
      invoice_receipts: createdInvoiceReceipts,
      payment_proof_receipts: createdPaymentProofReceipts,
      submission: updatedSubmission,
      existing_item_invoice_files: existingItemInvoiceFiles,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function countReceiptsByRole(submissionId, fileRole) {
  const { rows } = await procurementDb.query(
    `SELECT COUNT(*)::int AS cnt FROM procurement_submission_receipts
     WHERE submission_id = $1 AND COALESCE(file_role, 'invoice') = $2`,
    [submissionId, fileRole],
  );
  return rows[0]?.cnt ?? 0;
}

export async function getReceiptsBySubmission(submissionId) {
  const { rows } = await procurementDb.query('SELECT * FROM procurement_submission_receipts WHERE submission_id = $1 ORDER BY created_at DESC', [submissionId]);
  return rows;
}

export async function getReceiptById(id) {
  const { rows } = await procurementDb.query('SELECT * FROM procurement_submission_receipts WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function updateReceipt(id, { realizedPrice = null, currency = null, notes = null, status = null }) {
  const parts = [];
  const vals = [];
  let idx = 1;
  if (realizedPrice !== null) { parts.push(`realized_price = $${idx++}`); vals.push(realizedPrice); }
  if (currency !== null) { parts.push(`currency = $${idx++}`); vals.push(currency); }
  if (notes !== null) { parts.push(`notes = $${idx++}`); vals.push(notes); }
  if (status !== null) { parts.push(`status = $${idx++}`); vals.push(status); }
  if (parts.length === 0) return getReceiptById(id);
  const q = `UPDATE procurement_submission_receipts SET ${parts.join(',')}, updated_at = now() WHERE id = $${idx} RETURNING *`;
  vals.push(id);
  const { rows } = await procurementDb.query(q, vals);
  return rows[0] || null;
}

export function prepareLocalFile(file) {
  // multer.diskStorage already stored file.path
  return { filePath: file.path, fileName: file.originalname, mimeType: file.mimetype };
}

export default {
  createReceipt,
  createManyReceiptsAndMarkOnGoing,
  saveInvoicePackage,
  countReceiptsByRole,
  getReceiptsBySubmission,
  getReceiptById,
  updateReceipt,
  prepareLocalFile,
};
