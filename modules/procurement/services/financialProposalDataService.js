import fs from 'fs';
import path from 'path';
import * as invoiceDetailSvc from './invoiceDetailService.js';
import * as itemInvoiceDetailSvc from './itemInvoiceDetailService.js';
import * as itemPhotoSvc from './itemPhotoService.js';
import { resolveSubmissionDisplayLabel } from './submissionReferenceService.js';
import { resolveProcurementItemDisplayName } from '../utils/itemDisplayName.js';

function itemIsFromInventory(row) {
  const invId = row?.inventory_id ?? row?.inventoryId;
  if (invId == null) return false;
  if (typeof invId === 'number') return invId !== 0;
  const s = String(invId).trim().toLowerCase();
  return s !== '' && s !== 'null' && s !== '0' && s !== 'false';
}

/** Judul proposal keuangan / justifikasi: "BHP DASPRO 3". */
export function resolveFinancialProposalJudul(submission, enrich = {}) {
  return resolveSubmissionDisplayLabel(submission, enrich);
}

function fileToDataUri(filePath, mimeType) {
  if (!filePath) return '';
  const raw = String(filePath).trim();
  let abs = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  if (!fs.existsSync(abs) && raw.includes('uploads')) {
    abs = path.resolve(process.cwd(), raw.replace(/^\/+/, ''));
  }
  if (!fs.existsSync(abs)) return '';
  try {
    const buf = fs.readFileSync(abs);
    const mime = mimeType || 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (_) {
    return '';
  }
}

function normalizeLineItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => ({
    title: String(entry?.title ?? '').trim(),
    amount: Number(entry?.amount) || 0,
    sign: String(entry?.sign ?? 'plus').toLowerCase() === 'minus' ? 'minus' : 'plus',
  })).filter((e) => e.title || e.amount > 0);
}

/**
 * Build budget table rows for page 2.
 * @returns {{ rows: object[], totalAnggaran: number }}
 */
export function buildFinancialProposalBudgetRows(items = [], invoiceCtx = {}) {
  const customItems = (items || []).filter((it) => !itemIsFromInventory(it));
  const { global = {}, perItemById = new Map() } = invoiceCtx;
  const rows = [];
  let totalAnggaran = 0;
  let itemNo = 0;

  for (const item of customItems) {
    const per = perItemById.get(String(item.id));
    const qty = Math.max(1, Number(item.quantity) || 1);
    const normal = Number(per?.normal_price ?? item.unit_price ?? 0);
    const unit = String(item.unit ?? '').trim();
    const name = resolveProcurementItemDisplayName(item);

    itemNo += 1;
    const mainSub = normal * qty;
    rows.push({
      no: itemNo,
      kebutuhan: name,
      harga: normal,
      jumlah: qty,
      satuan: unit,
      subtotal: mainSub,
    });
    totalAnggaran += mainSub;

    for (const line of normalizeLineItems(per?.line_items)) {
      const signed = line.sign === 'minus' ? -line.amount : line.amount;
      rows.push({
        no: null,
        kebutuhan: line.title || '—',
        harga: line.amount,
        jumlah: 1,
        satuan: '',
        subtotal: signed,
      });
      totalAnggaran += signed;
    }
  }

  if (customItems.length > 0 && perItemById.size === 0) {
    for (const line of normalizeLineItems(global.line_items)) {
      const signed = line.sign === 'minus' ? -line.amount : line.amount;
      rows.push({
        no: null,
        kebutuhan: line.title || '—',
        harga: line.amount,
        jumlah: 1,
        satuan: '',
        subtotal: signed,
      });
      totalAnggaran += signed;
    }
  }

  if (
    customItems.length === 1 &&
    perItemById.size === 0 &&
    rows[0] &&
    global.normal_price != null
  ) {
    const normal = Number(global.normal_price) || 0;
    rows[0].harga = normal;
    rows[0].subtotal = normal * rows[0].jumlah;
  }

  if (customItems.length === 0 && global.normal_price != null) {
    const normal = Number(global.normal_price) || 0;
    if (normal > 0) {
      itemNo += 1;
      rows.push({
        no: itemNo,
        kebutuhan: 'Pengajuan',
        harga: normal,
        jumlah: 1,
        satuan: '',
        subtotal: normal,
      });
      totalAnggaran += normal;
    }
    for (const line of normalizeLineItems(global.line_items)) {
      const signed = line.sign === 'minus' ? -line.amount : line.amount;
      rows.push({
        no: null,
        kebutuhan: line.title || '—',
        harga: line.amount,
        jumlah: 1,
        satuan: '',
        subtotal: signed,
      });
      totalAnggaran += signed;
    }
  }

  if (rows.length) {
    totalAnggaran = rows.reduce((s, r) => s + Number(r.subtotal || 0), 0);
  }
  if (totalAnggaran <= 0 && global.actual_price != null) {
    totalAnggaran = Number(global.actual_price) || 0;
  }
  if (totalAnggaran <= 0 && global.submission_total != null) {
    totalAnggaran = Number(global.submission_total) || 0;
  }

  return { rows, totalAnggaran };
}

export async function loadFinancialProposalContext(submission, items = []) {
  const submissionId = submission?.id;
  const judul = resolveFinancialProposalJudul(submission, {
    labName: submission?._laboratory_name || submission?.lab,
  });
  const picKegiatan = 'Ekky Novriza Alam S.Kom., M.T.';

  const globalInvoice = await invoiceDetailSvc.getInvoiceDetailsBySubmission(submissionId);
  const perItemData = await itemInvoiceDetailSvc.getItemInvoiceDetailsBySubmission(submissionId);

  const perItemById = new Map();
  for (const row of perItemData.item_invoices || []) {
    perItemById.set(String(row.submission_item_id), {
      normal_price: row.normal_price,
      actual_price: row.actual_price,
      line_items: row.line_items || [],
    });
  }

  const globalAdjustments = (globalInvoice.adjustments || []).map((a) => ({
    title: a.title,
    amount: Number(a.amount),
    sign: a.sign,
  }));

  const invoiceCtx = {
    global: {
      normal_price: globalInvoice.details?.normal_price != null
        ? Number(globalInvoice.details.normal_price)
        : null,
      actual_price: globalInvoice.submission?.total_price != null
        ? Number(globalInvoice.submission.total_price)
        : null,
      line_items: globalAdjustments.length
        ? globalAdjustments
        : [],
      invoice_date: globalInvoice.details?.invoice_date ?? null,
      submission_total: globalInvoice.total_amount,
    },
    perItemById,
  };

  let invoiceDate = globalInvoice.details?.invoice_date ?? null;
  if (!invoiceDate && perItemData.item_invoices?.length) {
    invoiceDate = globalInvoice.details?.invoice_date ?? null;
  }

  const { rows: budgetRows, totalAnggaran } = buildFinancialProposalBudgetRows(items, invoiceCtx);

  const readyFlags = await itemPhotoSvc.getReadyFlagsBySubmission(submissionId);
  const readyIds = new Set(readyFlags.map((r) => String(r.submission_item_id)));
  const allPhotos = await itemPhotoSvc.getBySubmission(submissionId);
  const productPhotos = [];
  for (const photo of allPhotos) {
    const itemRow = (items || []).find(
      (it) => String(it.id) === String(photo.submission_item_id),
    );
    if (!itemRow) continue;
    const isCustom = !itemIsFromInventory(itemRow);
    const isInventoryReady =
      itemIsFromInventory(itemRow) &&
      readyIds.has(String(photo.submission_item_id));
    if (!isCustom && !isInventoryReady) continue;

    const dataUri = fileToDataUri(photo.file_path, photo.mime_type);
    if (!dataUri) continue;
    productPhotos.push({
      itemName:
        photo.item_name ||
        resolveProcurementItemDisplayName(itemRow),
      dataUri,
    });
  }

  return {
    judul,
    picKegiatan,
    invoiceDate,
    invoiceCtx,
    budgetRows,
    totalAnggaran: totalAnggaran > 0
      ? totalAnggaran
      : Number(submission?.total_price ?? globalInvoice.total_amount ?? 0),
    productPhotos,
  };
}

export default {
  loadFinancialProposalContext,
  buildFinancialProposalBudgetRows,
  resolveFinancialProposalJudul,
};
