import fs from 'fs';
import path from 'path';
import multer from 'multer';
import * as receiptSvc from '../services/receiptService.js';
import * as submissionSvc from '../services/submissionService.js';
import * as invoiceDetailSvc from '../services/invoiceDetailService.js';
import {
  parseInvoiceDate,
  parseNonNegativeNumber,
  parseLineItems,
  parseItemInvoices,
  parseItemNormalPrices,
  collectUploadedFiles,
} from '../utils/invoicePayload.js';
import * as itemInvoiceDetailSvc from '../services/itemInvoiceDetailService.js';
import { ensureSubmissionItemsInventoryColumn } from '../utils/schemaCapabilities.js';

// configure multer storage
const uploadDir = path.resolve(process.cwd(), 'uploads', 'receipts');
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${ts}_${safe}`);
  }
});
export const uploadMiddleware = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }).single('file');
export const uploadManyMiddleware = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }).array('files', 20);
export const uploadInvoicePackageMiddleware = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 80 },
}).any();

export async function uploadReceipt(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const roles = req.user.roles || [];
    if (!roles.includes('tpa') && !roles.includes('admin')) return res.status(403).json({ error: 'Forbidden' });

    const submissionId = req.params.id;
    const submission = await submissionSvc.getSubmissionById(submissionId);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    if (!req.file) return res.status(400).json({ error: 'File is required (field name: file)' });

    const fileMeta = receiptSvc.prepareLocalFile(req.file);
    const realizedPrice = req.body.realized_price !== undefined && req.body.realized_price !== '' ? Number(req.body.realized_price) : null;
    if (realizedPrice !== null && (Number.isNaN(realizedPrice) || realizedPrice < 0)) return res.status(422).json({ error: 'realized_price must be a non-negative number' });
    const notes = req.body.notes || null;
    let fileRole = (req.body.file_role || '').toString().trim();
    if (!fileRole && notes) {
      try {
        const decoded = JSON.parse(notes);
        if (decoded?.file_role === 'payment_proof') fileRole = 'payment_proof';
      } catch (_) {
        if (String(notes).includes('payment_proof')) fileRole = 'payment_proof';
      }
    }
    if (fileRole !== 'payment_proof') fileRole = 'invoice';

    const created = await receiptSvc.createReceipt({
      submissionId,
      uploadedBy: req.user.id,
      filePath: fileMeta.filePath,
      fileName: fileMeta.fileName,
      mimeType: fileMeta.mimeType,
      realizedPrice,
      notes,
      fileRole,
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err) { next(err); }
}

export async function listReceipts(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const submissionId = req.params.id;
    const submission = await submissionSvc.getSubmissionById(submissionId);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    const rows = await receiptSvc.getReceiptsBySubmission(submissionId);
    return res.status(200).json({ success: true, data: rows });
  } catch (err) { next(err); }
}

export async function getReceipt(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const { id: submissionId, rid } = req.params;
    const r = await receiptSvc.getReceiptById(rid);
    if (!r) return res.status(404).json({ error: 'Receipt not found' });
    if (String(r.submission_id) !== String(submissionId)) return res.status(400).json({ error: 'Receipt does not belong to submission' });
    return res.status(200).json({ success: true, data: r });
  } catch (err) { next(err); }
}

export async function patchReceipt(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const roles = req.user.roles || [];
    // only admin allowed to patch (we consider receipts final after upload)
    if (!roles.includes('admin')) return res.status(403).json({ error: 'Forbidden' });

    const { id: submissionId, rid } = req.params;
    const receipt = await receiptSvc.getReceiptById(rid);
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    if (String(receipt.submission_id) !== String(submissionId)) return res.status(400).json({ error: 'Receipt does not belong to submission' });

    const payload = {};
    if (req.body.realized_price !== undefined) {
      const rp = Number(req.body.realized_price);
      if (Number.isNaN(rp) || rp < 0) return res.status(422).json({ error: 'realized_price must be a non-negative number' });
      payload.realizedPrice = rp;
    }
    if (req.body.currency !== undefined) payload.currency = req.body.currency;
    if (req.body.notes !== undefined) payload.notes = req.body.notes;
    if (req.body.status !== undefined) payload.status = req.body.status;

    const updated = await receiptSvc.updateReceipt(rid, payload);
    return res.status(200).json({ success: true, data: updated });
  } catch (err) { next(err); }
}

export async function downloadReceiptFile(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const { id: submissionId, rid } = req.params;
    const receipt = await receiptSvc.getReceiptById(rid);
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    if (String(receipt.submission_id) !== String(submissionId)) return res.status(400).json({ error: 'Receipt does not belong to submission' });

    const rawPath = String(receipt.file_path || '');
    const absPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'Receipt file not found on server' });

    const fileName = receipt.file_name || `receipt_${rid}`;
    const mimeType = receipt.mime_type || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    return res.download(absPath, fileName);
  } catch (err) { next(err); }
}

function itemIsCustom(row) {
  const invId = row?.inventory_id ?? row?.inventoryId;
  if (invId == null) return true;
  if (typeof invId === 'number') return invId === 0;
  const s = String(invId).trim().toLowerCase();
  return s === '' || s === 'null' || s === '0' || s === 'false';
}


function sumPerItemNormalPrices(itemInvoices = []) {
  let sum = 0;
  let any = false;
  for (const row of itemInvoices) {
    if (row?.normal_price == null) continue;
    const n = Number(row.normal_price);
    if (Number.isNaN(n)) continue;
    sum += n;
    any = true;
  }
  return any ? sum : null;
}

function mergePerItemLineItems(itemInvoices = []) {
  const out = [];
  for (const row of itemInvoices) {
    const lines = Array.isArray(row?.line_items) ? row.line_items : [];
    for (const entry of lines) {
      if (!entry || typeof entry !== 'object') continue;
      const amount = Number(entry.amount);
      if (Number.isNaN(amount) || amount <= 0) continue;
      const title = String(entry.title ?? '').trim();
      if (!title && amount <= 0) continue;
      out.push({
        title,
        amount,
        sign: String(entry.sign ?? 'plus').toLowerCase() === 'minus' ? 'minus' : 'plus',
      });
    }
  }
  return out;
}

function mergePerItemInvoiceFiles(itemInvoices = []) {
  const out = [];
  for (const row of itemInvoices) {
    const files = Array.isArray(row?.invoice_files) ? row.invoice_files : [];
    out.push(...files);
  }
  return out;
}

export async function getInvoiceDetails(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const submissionId = req.params.id;
    const submission = await submissionSvc.findByIdWithItems(submissionId);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    const perItemData = await itemInvoiceDetailSvc.getItemInvoiceDetailsBySubmission(submissionId);
    const data = await invoiceDetailSvc.getInvoiceDetailsBySubmission(submissionId);
    const lineItems = data.adjustments.map((a) => ({
      title: a.title,
      amount: Number(a.amount),
      sign: a.sign,
    }));

    const rawInvoiceDate = data.details?.invoice_date ?? null;
    let invoiceDate = rawInvoiceDate
      ? String(rawInvoiceDate).slice(0, 10)
      : null;
    let normalPrice = data.details?.normal_price != null ? Number(data.details.normal_price) : null;
    const hasPerItemRows = (perItemData.item_invoices?.length ?? 0) > 0;
    if ((normalPrice == null || normalPrice <= 0) && hasPerItemRows) {
      normalPrice = sumPerItemNormalPrices(perItemData.item_invoices);
    }

    if (lineItems.length === 0 && hasPerItemRows) {
      lineItems.push(...mergePerItemLineItems(perItemData.item_invoices));
    }

    let invoiceFiles = [...(data.invoice_files ?? [])];
    if (hasPerItemRows) {
      const perItemFiles = mergePerItemInvoiceFiles(perItemData.item_invoices);
      if (perItemFiles.length > 0) {
        const merged = invoiceDetailSvc.splitAndDedupeReceipts([
          ...invoiceFiles,
          ...perItemFiles,
          ...(data.payment_proof_files ?? []),
        ]);
        invoiceFiles = merged.invoiceFiles;
      }
    }

    if (!invoiceDate || normalPrice == null) {
      for (const r of invoiceFiles) {
        const notes = r.notes;
        if (!notes) continue;
        try {
          const decoded = JSON.parse(notes);
          if (!decoded || typeof decoded !== 'object') continue;
          if (!invoiceDate && decoded.invoice_date) invoiceDate = decoded.invoice_date;
          if (normalPrice == null && decoded.normal_price != null) {
            normalPrice = Number(decoded.normal_price);
          }
          if (lineItems.length === 0 && Array.isArray(decoded.line_items)) {
            for (const item of decoded.line_items) {
              if (!item || typeof item !== 'object') continue;
              lineItems.push({
                title: item.title ?? '',
                amount: Number(item.amount),
                sign: item.sign === 'minus' ? 'minus' : 'plus',
              });
            }
          }
          break;
        } catch (_) { /* legacy notes */ }
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        submission_id: Number(submissionId),
        per_item_mode: false,
        invoice_date: invoiceDate,
        normal_price: normalPrice,
        total_amount: data.total_amount != null ? Number(data.total_amount) : null,
        line_items: lineItems,
        invoice_files: invoiceFiles,
        payment_proof_files: data.payment_proof_files,
        // Legacy rows — Flutter merges when top-level fields are sparse.
        item_invoices: hasPerItemRows ? perItemData.item_invoices : [],
      },
    });
  } catch (err) { next(err); }
}

export async function saveInvoices(req, res, next) {
  try {
    await ensureSubmissionItemsInventoryColumn();
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const roles = req.user.roles || [];
    if (!roles.includes('tpa') && !roles.includes('admin')) return res.status(403).json({ error: 'Forbidden' });

    const submissionId = req.params.id;
    const submission = await submissionSvc.findByIdWithItems(submissionId);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    const submissionItems = Array.isArray(submission.items) ? submission.items : [];
    const invoiceMode = String(req.body.invoice_mode || '').toLowerCase();
    const perItemMode = invoiceMode === 'per_item';
    const itemNormalsMode = invoiceMode === 'item_normals';

    const { invoiceFiles, paymentProofFiles, invoiceFilesByItemId } = collectUploadedFiles(req);
    const existing = await invoiceDetailSvc.getInvoiceDetailsBySubmission(submissionId);
    const existingPerItem = (perItemMode || itemNormalsMode)
      ? await itemInvoiceDetailSvc.getItemInvoiceDetailsBySubmission(submissionId)
      : null;

    if (paymentProofFiles.length === 0 && existing.payment_proof_files.length === 0) {
      return res.status(400).json({
        error: 'At least one payment proof file is required (field: payment_proof_files)',
      });
    }

    const dateParsed = parseInvoiceDate(req.body.invoice_date);
    if (dateParsed.error) return res.status(422).json({ error: dateParsed.error });
    if (!dateParsed.value) {
      return res.status(422).json({ error: 'invoice_date is required' });
    }

    const totalParsed = parseNonNegativeNumber(req.body.total_amount, 'total_amount', { required: true });
    if (totalParsed.error) return res.status(422).json({ error: totalParsed.error });

    if (itemNormalsMode) {
      const itemParsed = parseItemNormalPrices(req.body.item_invoices);
      if (itemParsed.error) return res.status(422).json({ error: itemParsed.error });
      const customItems = submissionItems.filter(itemIsCustom);
      if (customItems.length === 0) {
        return res.status(422).json({ error: 'This submission has no custom items requiring invoice upload' });
      }
      if (itemParsed.value.length === 0) {
        return res.status(422).json({ error: 'item_invoices is required for custom items' });
      }

      const itemById = new Map(customItems.map((it) => [String(it.id), it]));
      const filteredEntries = [];
      for (const entry of itemParsed.value) {
        const row = itemById.get(String(entry.submissionItemId));
        if (!row) {
          return res.status(422).json({
            error: `submission_item_id ${entry.submissionItemId} is not a custom item in this submission`,
          });
        }
        entry.isCustom = true;
        filteredEntries.push(entry);
      }

      const coveredIds = new Set(filteredEntries.map((e) => String(e.submissionItemId)));
      for (const it of customItems) {
        if (!coveredIds.has(String(it.id))) {
          return res.status(422).json({
            error: `Missing normal price for custom item ${it.id}`,
          });
        }
      }

      if (invoiceFiles.length === 0 && existing.invoice_files.length === 0) {
        return res.status(400).json({
          error: 'At least one invoice file is required (field: invoice_files or files)',
        });
      }

      const lineParsed = parseLineItems(req.body.line_items);
      if (lineParsed.error) return res.status(422).json({ error: lineParsed.error });

      const invoiceFileMetas = invoiceFiles.map((f) => receiptSvc.prepareLocalFile(f));
      const paymentProofMetas = paymentProofFiles.map((f) => receiptSvc.prepareLocalFile(f));

      const result = await receiptSvc.saveItemNormalsInvoicePackage({
        submissionId,
        uploadedBy: req.user.id,
        invoiceDate: dateParsed.value,
        itemNormals: filteredEntries,
        adjustments: lineParsed.value,
        totalAmount: totalParsed.value,
        invoiceFiles: invoiceFileMetas,
        paymentProofFiles: paymentProofMetas,
      });

      return res.status(201).json({
        success: true,
        message: 'Invoice data saved and submission status updated to on_going',
        data: {
          ...result,
          submission_status: result.submission?.status ?? 'on_going',
        },
      });
    }

    if (perItemMode) {
      const itemParsed = parseItemInvoices(req.body.item_invoices);
      if (itemParsed.error) return res.status(422).json({ error: itemParsed.error });
      const customItems = submissionItems.filter(itemIsCustom);
      if (customItems.length === 0) {
        return res.status(422).json({ error: 'This submission has no custom items requiring invoice upload' });
      }
      if (itemParsed.value.length === 0) {
        return res.status(422).json({ error: 'item_invoices is required for custom items' });
      }

      const itemById = new Map(customItems.map((it) => [String(it.id), it]));
      const existingFilesByItem = {};
      for (const row of existingPerItem?.item_invoices ?? []) {
        existingFilesByItem[String(row.submission_item_id)] = row.invoice_files ?? [];
      }

      const filteredEntries = [];
      for (const entry of itemParsed.value) {
        const row = itemById.get(String(entry.submissionItemId));
        if (!row) {
          return res.status(422).json({
            error: `submission_item_id ${entry.submissionItemId} is not a custom item in this submission`,
          });
        }
        if (entry.normalPrice === null || entry.normalPrice <= 0) {
          return res.status(422).json({
            error: `normal_price is required for custom item ${entry.submissionItemId}`,
          });
        }
        const newFiles = invoiceFilesByItemId[String(entry.submissionItemId)] ?? [];
        const existingItemFiles = existingFilesByItem[String(entry.submissionItemId)] ?? [];
        if (newFiles.length === 0 && existingItemFiles.length === 0) {
          return res.status(400).json({
            error: `At least one invoice file is required for custom item ${entry.submissionItemId}`,
          });
        }
        entry.isCustom = true;
        filteredEntries.push(entry);
      }

      const coveredIds = new Set(filteredEntries.map((e) => String(e.submissionItemId)));
      for (const it of customItems) {
        if (!coveredIds.has(String(it.id))) {
          const existingItemFiles = existingFilesByItem[String(it.id)] ?? [];
          if (existingItemFiles.length === 0) {
            return res.status(422).json({
              error: `Missing invoice data for custom item ${it.id}`,
            });
          }
        }
      }

      itemParsed.value = filteredEntries;

      const invoiceFileMetasByItem = {};
      for (const [itemId, files] of Object.entries(invoiceFilesByItemId)) {
        invoiceFileMetasByItem[itemId] = files.map((f) => receiptSvc.prepareLocalFile(f));
      }
      const paymentProofMetas = paymentProofFiles.map((f) => receiptSvc.prepareLocalFile(f));

      const result = await receiptSvc.savePerItemInvoicePackage({
        submissionId,
        uploadedBy: req.user.id,
        invoiceDate: dateParsed.value,
        itemInvoices: itemParsed.value,
        invoiceFilesByItemId: invoiceFileMetasByItem,
        paymentProofFiles: paymentProofMetas,
        totalAmount: totalParsed.value,
        existingItemInvoiceFiles: existingFilesByItem,
      });

      return res.status(201).json({
        success: true,
        message: 'Per-item invoice data saved and submission status updated to on_going',
        data: {
          ...result,
          submission_status: result.submission?.status ?? 'on_going',
        },
      });
    }

    if (invoiceFiles.length === 0 && existing.invoice_files.length === 0) {
      return res.status(400).json({
        error: 'At least one invoice file is required (field: invoice_files or files)',
      });
    }

    const normalParsed = parseNonNegativeNumber(req.body.normal_price, 'normal_price', { required: true });
    if (normalParsed.error) return res.status(422).json({ error: normalParsed.error });

    const lineParsed = parseLineItems(req.body.line_items);
    if (lineParsed.error) return res.status(422).json({ error: lineParsed.error });

    const invoiceFileMetas = invoiceFiles.map((f) => receiptSvc.prepareLocalFile(f));
    const paymentProofMetas = paymentProofFiles.map((f) => receiptSvc.prepareLocalFile(f));

    const result = await receiptSvc.saveInvoicePackage({
      submissionId,
      uploadedBy: req.user.id,
      invoiceDate: dateParsed.value,
      normalPrice: normalParsed.value,
      adjustments: lineParsed.value,
      totalAmount: totalParsed.value,
      invoiceFiles: invoiceFileMetas,
      paymentProofFiles: paymentProofMetas,
    });

    return res.status(201).json({
      success: true,
      message: 'Invoice data saved and submission status updated to on_going',
      data: {
        ...result,
        submission_status: result.submission?.status ?? 'on_going',
      },
    });
  } catch (err) { next(err); }
}

export default {
  uploadReceipt,
  listReceipts,
  getReceipt,
  downloadReceiptFile,
  patchReceipt,
  getInvoiceDetails,
  saveInvoices,
};
