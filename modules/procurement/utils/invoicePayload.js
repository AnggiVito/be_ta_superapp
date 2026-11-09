export function parseInvoiceDate(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: 'invoice_date must be YYYY-MM-DD' };
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { error: 'invoice_date is invalid' };
  return { value: s };
}

export function parseNonNegativeNumber(raw, fieldName, { required = false } = {}) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    if (required) return { error: `${fieldName} is required` };
    return { value: null };
  }
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0) return { error: `${fieldName} must be a non-negative number` };
  return { value: n };
}

export function parseLineItems(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return { value: [] };
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return { error: 'line_items must be a valid JSON array' };
    }
  }
  if (!Array.isArray(parsed)) return { error: 'line_items must be an array' };

  const items = [];
  for (let i = 0; i < parsed.length; i += 1) {
    const entry = parsed[i];
    if (!entry || typeof entry !== 'object') continue;
    const title = String(entry.title ?? '').trim();
    const amount = Number(entry.amount);
    if (Number.isNaN(amount) || amount < 0) {
      return { error: `line_items[${i}].amount must be a non-negative number` };
    }
    if (title === '' && amount <= 0) continue;
    const sign = String(entry.sign ?? 'plus').toLowerCase() === 'minus' ? 'minus' : 'plus';
    items.push({ title, amount, sign, sortOrder: i });
  }
  return { value: items };
}

export function parseItemInvoices(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { value: [] };
  }
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return { error: 'item_invoices must be a valid JSON array' };
    }
  }
  if (!Array.isArray(parsed)) return { error: 'item_invoices must be an array' };

  const items = [];
  for (let i = 0; i < parsed.length; i += 1) {
    const entry = parsed[i];
    if (!entry || typeof entry !== 'object') {
      return { error: `item_invoices[${i}] must be an object` };
    }
    const submissionItemId = entry.submission_item_id ?? entry.submissionItemId;
    if (submissionItemId === undefined || submissionItemId === null || String(submissionItemId).trim() === '') {
      return { error: `item_invoices[${i}].submission_item_id is required` };
    }
    const normalParsed = parseNonNegativeNumber(entry.normal_price, `item_invoices[${i}].normal_price`);
    if (normalParsed.error) return { error: normalParsed.error };
    const actualParsed = parseNonNegativeNumber(
      entry.actual_price,
      `item_invoices[${i}].actual_price`,
      { required: true },
    );
    if (actualParsed.error) return { error: actualParsed.error };
    const lineParsed = parseLineItems(entry.line_items);
    if (lineParsed.error) return { error: lineParsed.error };
    items.push({
      submissionItemId: Number(submissionItemId),
      normalPrice: normalParsed.value,
      actualPrice: actualParsed.value,
      lineItems: lineParsed.value,
      isCustom: entry.is_custom === true || entry.isCustom === true,
    });
  }
  return { value: items };
}

/** Per custom item: normal_price only (shared adjustments + invoice files at submission level). */
export function parseItemNormalPrices(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { value: [] };
  }
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return { error: 'item_invoices must be a valid JSON array' };
    }
  }
  if (!Array.isArray(parsed)) return { error: 'item_invoices must be an array' };

  const items = [];
  for (let i = 0; i < parsed.length; i += 1) {
    const entry = parsed[i];
    if (!entry || typeof entry !== 'object') {
      return { error: `item_invoices[${i}] must be an object` };
    }
    const submissionItemId = entry.submission_item_id ?? entry.submissionItemId;
    if (submissionItemId === undefined || submissionItemId === null || String(submissionItemId).trim() === '') {
      return { error: `item_invoices[${i}].submission_item_id is required` };
    }
    const normalParsed = parseNonNegativeNumber(
      entry.normal_price,
      `item_invoices[${i}].normal_price`,
      { required: true },
    );
    if (normalParsed.error) return { error: normalParsed.error };
    if (normalParsed.value === null || normalParsed.value <= 0) {
      return { error: `item_invoices[${i}].normal_price must be greater than zero` };
    }
    const actualParsed = parseNonNegativeNumber(
      entry.actual_price,
      `item_invoices[${i}].actual_price`,
    );
    const actualPrice = actualParsed.value != null ? actualParsed.value : normalParsed.value;
    items.push({
      submissionItemId: Number(submissionItemId),
      normalPrice: normalParsed.value,
      actualPrice,
      lineItems: [],
      isCustom: entry.is_custom === true || entry.isCustom === true,
    });
  }
  return { value: items };
}

export function collectUploadedFiles(req) {
  const invoiceFiles = [];
  const paymentProofFiles = [];
  const invoiceFilesByItemId = {};

  const ingest = (field, file) => {
    if (!file) return;
    const match = /^invoice_files_item_(\d+)$/.exec(field);
    if (match) {
      const itemId = match[1];
      if (!invoiceFilesByItemId[itemId]) invoiceFilesByItemId[itemId] = [];
      invoiceFilesByItemId[itemId].push(file);
      return;
    }
    if (field === 'payment_proof_files') paymentProofFiles.push(file);
    else if (field === 'invoice_files' || field === 'files') invoiceFiles.push(file);
  };

  if (Array.isArray(req.files)) {
    for (const f of req.files) {
      ingest(f.fieldname || 'files', f);
    }
    return { invoiceFiles, paymentProofFiles, invoiceFilesByItemId };
  }

  const byField = req.files || {};
  for (const [field, arr] of Object.entries(byField)) {
    if (!Array.isArray(arr)) continue;
    for (const f of arr) ingest(field, f);
  }

  return { invoiceFiles, paymentProofFiles, invoiceFilesByItemId };
}

export default {
  parseInvoiceDate,
  parseNonNegativeNumber,
  parseLineItems,
  parseItemInvoices,
  parseItemNormalPrices,
  collectUploadedFiles,
};
