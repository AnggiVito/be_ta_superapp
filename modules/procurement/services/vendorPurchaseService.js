import { procurementDb } from '../../../config/databases.js';
import * as submissionSvc from './submissionService.js';
import * as invoiceDetailSvc from './invoiceDetailService.js';
import * as itemInvoiceDetailSvc from './itemInvoiceDetailService.js';

function itemIsCustom(row) {
  const invId = row?.inventory_id ?? row?.inventoryId;
  if (invId == null) return true;
  if (typeof invId === 'number') return invId === 0;
  const s = String(invId).trim().toLowerCase();
  return s === '' || s === 'null' || s === '0' || s === 'false';
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function loadNormalPriceByItemId(submissionId) {
  const map = new Map();
  try {
    const perItem = await itemInvoiceDetailSvc.getItemInvoiceDetailsBySubmission(submissionId);
    for (const row of perItem.item_invoices ?? []) {
      const id = String(row.submission_item_id ?? '');
      if (!id) continue;
      if (row.normal_price != null) map.set(id, toNum(row.normal_price));
    }
  } catch (_) {
    /* table may be empty */
  }
  try {
    const global = await invoiceDetailSvc.getInvoiceDetailsBySubmission(submissionId);
    const globalNormal = global.details?.normal_price != null
      ? toNum(global.details.normal_price)
      : null;
    if (globalNormal != null && map.size === 0) {
      return { map, globalNormal };
    }
  } catch (_) {
    /* ignore */
  }
  return { map, globalNormal: null };
}

export async function getVendorPurchaseContext(submissionId) {
  const submission = await submissionSvc.findByIdWithItems(submissionId);
  if (!submission) return null;

  const items = Array.isArray(submission.items) ? submission.items : [];
  const customItems = items.filter(itemIsCustom);
  const { map: normalByItem, globalNormal } = await loadNormalPriceByItemId(submissionId);

  const availableItems = customItems.map((it) => {
    const id = String(it.id);
    const qty = toNum(it.quantity, 1);
    let normal = normalByItem.get(id);
    if (normal == null || normal <= 0) {
      normal = toNum(it.unit_price, 0);
    }
    if ((normal == null || normal <= 0) && globalNormal != null) {
      normal = globalNormal;
    }
    const actual = qty * normal;
    const unitRaw = it.unit != null ? String(it.unit).trim() : '';
    return {
      submission_item_id: it.id,
      item_name: it.item_name ?? '',
      specification: it.specification ?? null,
      quantity: qty,
      unit: unitRaw || null,
      normal_price: normal,
      actual_price: actual,
      has_invoice_normal_price: normalByItem.has(id),
    };
  });

  const headerRes = await procurementDb.query(
    `SELECT partner_name, title, updated_at FROM procurement_submission_vendor_purchase
     WHERE submission_id = $1`,
    [submissionId],
  );
  const header = headerRes.rows[0] ?? null;

  const linesRes = await procurementDb.query(
    `SELECT submission_item_id, item_name, quantity, normal_price, actual_price, unit, sort_order
     FROM procurement_submission_vendor_purchase_lines
     WHERE submission_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [submissionId],
  );

  const itemById = new Map(items.map((it) => [String(it.id), it]));
  const savedLines = linesRes.rows.map((r) => {
    const itemId =
      r.submission_item_id != null ? String(r.submission_item_id) : null;
    const it = itemId ? itemById.get(itemId) : null;
    const unitFromLine = r.unit != null ? String(r.unit).trim() : '';
    const unitFromItem = it?.unit != null ? String(it.unit).trim() : '';
    const lineItemName = r.item_name != null ? String(r.item_name).trim() : '';
    return {
      submission_item_id: r.submission_item_id,
      is_manual: itemId == null,
      quantity: toNum(r.quantity),
      normal_price: toNum(r.normal_price),
      actual_price: toNum(r.actual_price),
      sort_order: r.sort_order,
      item_name: lineItemName || (it?.item_name || ''),
      specification: it?.specification ?? null,
      unit: unitFromLine || unitFromItem || null,
    };
  });

  const totalActualPrice = savedLines.reduce((sum, line) => sum + line.actual_price, 0);
  const partnerName = header?.partner_name ?? '';
  const title = header?.title ?? '';

  return {
    submission_id: Number(submissionId),
    partner_name: partnerName,
    title,
    lines: savedLines,
    available_items: availableItems,
    total_actual_price: totalActualPrice,
    has_saved_purchase: Boolean(
      partnerName.trim() && title.trim() && savedLines.length > 0,
    ),
    updated_at: header?.updated_at ?? null,
  };
}

/** Set `has_vendor_purchase` on each submission row (batch, for TPA listings). */
export async function attachVendorPurchaseFlags(submissions = []) {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return submissions;
  }
  const ids = submissions
    .map((s) => s?.id)
    .filter((id) => id != null && String(id).trim() !== '');
  if (ids.length === 0) return submissions;

  const { rows } = await procurementDb.query(
    `SELECT vp.submission_id,
            trim(COALESCE(vp.partner_name, '')) <> '' AS has_partner,
            trim(COALESCE(vp.title, '')) <> '' AS has_title,
            (SELECT COUNT(*)::int FROM procurement_submission_vendor_purchase_lines l
             WHERE l.submission_id = vp.submission_id) AS line_count
     FROM procurement_submission_vendor_purchase vp
     WHERE vp.submission_id = ANY($1::int[])`,
    [ids],
  );

  const saved = new Set(
    rows
      .filter(
        (r) => r.has_partner && r.has_title && Number(r.line_count) > 0,
      )
      .map((r) => String(r.submission_id)),
  );

  return submissions.map((s) => ({
    ...s,
    has_vendor_purchase: saved.has(String(s.id)),
  }));
}

/** Vendor purchase saved on submission (for BAST PDF). */
export async function getVendorPurchaseForBast(submissionId) {
  const ctx = await getVendorPurchaseContext(submissionId);
  if (!ctx?.has_saved_purchase) return null;
  return ctx;
}

export async function saveVendorPurchase(submissionId, uploadedBy, { title, partnerName, lines = [] }) {
  const submission = await submissionSvc.findByIdWithItems(submissionId);
  if (!submission) return null;

  const items = Array.isArray(submission.items) ? submission.items : [];
  const itemById = new Map(items.map((it) => [String(it.id), it]));
  const { map: normalByItem } = await loadNormalPriceByItemId(submissionId);

  const docTitle = String(title ?? '').trim();
  if (!docTitle) {
    const err = new Error('title is required');
    err.code = 'VALIDATION';
    throw err;
  }
  const partner = String(partnerName ?? '').trim();
  if (!partner) {
    const err = new Error('partner_name is required');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    const err = new Error('At least one vendor line item is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const seenLinkedIds = new Set();
  const normalizedLines = [];
  for (let i = 0; i < lines.length; i += 1) {
    const entry = lines[i];
    const itemId = String(entry.submission_item_id ?? entry.submissionItemId ?? '').trim();
    const itemName = String(entry.item_name ?? entry.itemName ?? '').trim();
    const isManual = !itemId;

    if (isManual) {
      if (!itemName) {
        const err = new Error(`lines[${i}]: item_name is required for manual lines`);
        err.code = 'VALIDATION';
        throw err;
      }
    } else if (!itemById.has(itemId)) {
      const err = new Error(`lines[${i}]: invalid submission_item_id`);
      err.code = 'VALIDATION';
      throw err;
    } else if (seenLinkedIds.has(itemId)) {
      const err = new Error(`lines[${i}]: duplicate submission item`);
      err.code = 'VALIDATION';
      throw err;
    }

    const it = isManual ? null : itemById.get(itemId);
    if (!isManual) {
      seenLinkedIds.add(itemId);
      if (!itemIsCustom(it)) {
        const err = new Error(`lines[${i}]: only custom (non-inventory) items allowed`);
        err.code = 'VALIDATION';
        throw err;
      }
    }

    const qtyRaw = entry.quantity ?? entry.qty;
    const qty = qtyRaw != null && String(qtyRaw).trim() !== ''
      ? toNum(qtyRaw)
      : toNum(it?.quantity, 1);
    if (qty <= 0) {
      const err = new Error(`lines[${i}]: quantity must be greater than zero`);
      err.code = 'VALIDATION';
      throw err;
    }

    let normal = entry.normal_price != null && String(entry.normal_price).trim() !== ''
      ? toNum(entry.normal_price)
      : null;
    if ((normal == null || normal <= 0) && !isManual) {
      normal = normalByItem.get(itemId);
      if (normal == null || normal <= 0) normal = toNum(it.unit_price, 0);
    }
    if (normal == null || normal <= 0) {
      const err = new Error(`lines[${i}]: normal_price is required`);
      err.code = 'VALIDATION';
      throw err;
    }

    let actual = entry.actual_price != null && String(entry.actual_price).trim() !== ''
      ? toNum(entry.actual_price)
      : null;
    if (actual == null || actual <= 0) {
      actual = qty * normal;
    }

    const unitRaw = entry.unit != null ? String(entry.unit).trim() : '';
    const unitFromItem = it?.unit != null ? String(it.unit).trim() : '';
    const unit = unitRaw || unitFromItem || null;
    if (!unit) {
      const err = new Error(`lines[${i}]: unit is required`);
      err.code = 'VALIDATION';
      throw err;
    }

    const resolvedName = isManual
      ? itemName
      : (itemName || String(it?.item_name ?? '').trim());

    normalizedLines.push({
      submission_item_id: isManual ? null : itemId,
      item_name: resolvedName || null,
      quantity: qty,
      normal_price: normal,
      actual_price: actual,
      unit,
      sort_order: i,
    });
  }

  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO procurement_submission_vendor_purchase
        (submission_id, title, partner_name, uploaded_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (submission_id) DO UPDATE SET
         title = EXCLUDED.title,
         partner_name = EXCLUDED.partner_name,
         uploaded_by = EXCLUDED.uploaded_by,
         updated_at = now()`,
      [submissionId, docTitle, partner, uploadedBy],
    );
    await client.query(
      `DELETE FROM procurement_submission_vendor_purchase_lines WHERE submission_id = $1`,
      [submissionId],
    );
    for (const line of normalizedLines) {
      await client.query(
        `INSERT INTO procurement_submission_vendor_purchase_lines
          (submission_id, submission_item_id, item_name, quantity, normal_price, actual_price, unit, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          submissionId,
          line.submission_item_id,
          line.item_name,
          line.quantity,
          line.normal_price,
          line.actual_price,
          line.unit,
          line.sort_order,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return getVendorPurchaseContext(submissionId);
}
