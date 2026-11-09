/**
 * KPA Parsing Service
 * Parses Kartu Pengawasan Anggaran (KPA) Excel files
 *
 * Layout varies slightly between templates; we detect column indices from the header row.
 * Typical columns (Excel letters): Tanggal (E), Keterangan (F), Debet (G), Kredit (H), Balance (I).
 *
 * Saldo dibaca bertanda (boleh negatif sementara). Agregasi realisasi menghindari penghitungan dua kali
 * pada jurnal double-entry (lihat kolom nominal per nomor bukti di model Postgres).
 */

import xlsx from 'xlsx';
import { logger } from '../../../core/utils/logger.js';

/**
 * Parse satu sheet (array of rows) — dipakai KPA single-sheet & laboran multi-sheet.
 */
export function parseKpaSheetRows(rows) {
  const metadata = extractMetadata(rows);
  const anggaranPerTw = extractAnggaranPerTw(rows);
  const { cols: txCols, headerIdx } = detectTransactionLayout(rows);
  const transactions = extractTransactions(rows, txCols, headerIdx);
  return { metadata, anggaranPerTw, transactions };
}

/**
 * Parse semua sheet workbook — untuk upload laporan laboran multi-prodi.
 * @returns {Array<{ sheetName: string, metadata, anggaranPerTw, transactions }>}
 */
export function parseKpaWorkbook(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const sheets = [];

  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    const ws = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      raw: true,
    });
    if (!rows.length) return;

    const parsed = parseKpaSheetRows(rows);
    const hasMeta = Boolean(
      parsed.metadata?.kode_pp ||
      parsed.metadata?.nama_pp ||
      parsed.metadata?.kode_akun
    );
    if (!hasMeta && parsed.transactions.length === 0) return;

    sheets.push({
      sheetName,
      sheetIndex,
      ...parsed,
    });
  });

  return sheets;
}

export function parseKpaFile(filePath) {
  try {
    logger.info('Parsing KPA file:', { filePath });

    const workbook = xlsx.readFile(filePath, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];

    const rows = xlsx.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      raw: true,
    });

    logger.info(`KPA sheet "${sheetName}": ${rows.length} rows`);

    const { metadata, anggaranPerTw, transactions } = parseKpaSheetRows(rows);
    logger.info('KPA metadata extracted:', metadata);
    logger.info('KPA anggaran per TW:', anggaranPerTw);
    logger.info(`KPA transactions extracted: ${transactions.length} items`);

    return { metadata, anggaranPerTw, transactions };
  } catch (error) {
    logger.error('Error parsing KPA file:', error);
    throw new Error(`Failed to parse KPA file: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Amount / date helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize header / label cell text */
function normalizeCell(v) {
  if (v == null || v === '') return '';
  return String(v).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Parse monetary cell → signed integer (rupiah).
 * Dipakai untuk saldo kartu yang boleh negatif di jalan double-entry.
 */
function parseAmountCell(v) {
  if (v == null || v === '' || v === '-') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);

  let s = String(v).trim();
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1).trim();
  }
  const cleaned = s.replace(/[^0-9,.-]/g, '');
  const n = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(n)) return 0;
  return Math.round(n) * (neg ? -1 : 1);
}

/** Nominal debit/kredit per baris: simpan sebagai nilai tidak negatif seperti di Excel kartu */
function parseAmountUnsigned(v) {
  return Math.abs(parseAmountCell(v));
}

function parseDateCell(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().split('T')[0];

  if (typeof v === 'number' && Number.isFinite(v)) {
    try {
      const parsed = xlsx.SSF?.parse_date_code?.(v);
      if (parsed && parsed.y >= 1900) {
        const mm = String(parsed.m).padStart(2, '0');
        const dd = String(parsed.d).padStart(2, '0');
        return `${parsed.y}-${mm}-${dd}`;
      }
    } catch (_) {
      /* ignore */
    }
  }

  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata & anggaran
// ─────────────────────────────────────────────────────────────────────────────

function extractMetadata(rows) {
  const getVal = (row, col) => {
    if (!rows[row] || rows[row][col] == null) return null;
    const v = String(rows[row][col]).trim();
    return v.startsWith(':') ? v.slice(1).trim() : v;
  };

  const tahunRaw = rows[2]?.[0] ?? rows[2]?.[1] ?? '';
  const tahunMatch = String(tahunRaw).match(/\d{4}/);
  const tahun = tahunMatch ? parseInt(tahunMatch[0], 10) : new Date().getFullYear();

  return {
    tahun,
    kode_akun: getVal(3, 1),
    nama_akun: getVal(4, 1),
    kode_pp: getVal(5, 1),
    nama_pp: getVal(6, 1),
    no_drk: getVal(7, 1),
    kegiatan: getVal(8, 1),
  };
}

/** Detect TW label inside cell text → tw1..tw4 key */
function detectTwColumnKey(text) {
  const u = String(text ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ');
  if (/TRIWULAN\s*[- ]?\s*IV\b/.test(u)) return 'tw4';
  if (/TRIWULAN\s*[- ]?\s*III\b/.test(u)) return 'tw3';
  if (/TRIWULAN\s*[- ]?\s*II\b/.test(u)) return 'tw2';
  if (/TRIWULAN\s*[- ]?\s*I\b/.test(u)) return 'tw1';
  const m = u.match(/TRIWULAN\s*[- ]?\s*([1-4])\b/);
  if (m) return `tw${m[1]}`;
  return null;
}

function extractAnggaranPerTw(rows) {
  const result = { tw1: 0, tw2: 0, tw3: 0, tw4: 0 };

  for (let i = 0; i < Math.min(rows.length, 18); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    let twKey = null;
    let labelCol = -1;

    for (let c = 0; c < row.length; c++) {
      const key = detectTwColumnKey(row[c]);
      if (key) {
        twKey = key;
        labelCol = c;
        break;
      }
    }

    if (!twKey) continue;

    let amount = 0;
    // Prefer numeric cells to the right of the TRIWULAN label (amount column).
    if (labelCol >= 0) {
      for (let c = labelCol + 1; c < row.length; c++) {
        const n = parseAmountUnsigned(row[c]);
        if (n >= amount) amount = n;
      }
    }

    // Fallback: largest numeric on row (skip pure-label rows with zero).
    if (amount === 0) {
      for (let c = 2; c < row.length; c++) {
        const n = parseAmountUnsigned(row[c]);
        if (n >= amount) amount = n;
      }
    }

    if (amount > 0) result[twKey] = amount;
  }

  const anyBudget = result.tw1 || result.tw2 || result.tw3 || result.tw4;
  if (!anyBudget) {
    return {
      tw1: parseAmountUnsigned(rows[4]?.[3]),
      tw2: parseAmountUnsigned(rows[5]?.[3]),
      tw3: parseAmountUnsigned(rows[6]?.[3]),
      tw4: parseAmountUnsigned(rows[7]?.[3]),
    };
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction layout detection
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TX_COLS = {
  no_bukti: 0,
  no_dokumen: 2,
  tanggal: 4,
  keterangan: 5,
  debet: 6,
  kredit: 7,
  balance: 8,
};

function detectTransactionLayout(rows) {
  let best = { score: -1, cols: { ...DEFAULT_TX_COLS }, headerIdx: -1 };

  for (let ri = 0; ri < Math.min(rows.length, 30); ri++) {
    const row = rows[ri];
    if (!Array.isArray(row)) continue;

    const cols = {};
    let score = 0;

    for (let c = 0; c < row.length; c++) {
      const t = normalizeCell(row[c]);
      if (!t) continue;

      if (t.includes('tanggal')) {
        cols.tanggal = c;
        score += 4;
      } else if (t.includes('keterangan')) {
        cols.keterangan = c;
        score += 4;
      } else if (t === 'debet' || /^debet\s*$/.test(t)) {
        cols.debet = c;
        score += 4;
      } else if (t === 'kredit' || /^kredit\s*$/.test(t)) {
        cols.kredit = c;
        score += 4;
      } else if (t.includes('balance') || (t.includes('saldo') && !t.includes('awal'))) {
        cols.balance = c;
        score += 2;
      } else if (t.includes('bukti')) {
        cols.no_bukti = c;
        score += 1;
      } else if (t.includes('dokumen')) {
        cols.no_dokumen = c;
        score += 1;
      }
    }

    const hasCore =
      cols.tanggal !== undefined &&
      cols.keterangan !== undefined &&
      cols.debet !== undefined &&
      cols.kredit !== undefined;

    if (hasCore && score > best.score) {
      const merged = { ...DEFAULT_TX_COLS, ...cols };
      // Infer optional columns relative to Tanggal (E-style layout).
      if (merged.balance === undefined) merged.balance = merged.kredit + 1;
      if (merged.no_bukti === undefined) merged.no_bukti = Math.max(0, merged.tanggal - 4);
      if (merged.no_dokumen === undefined) merged.no_dokumen = Math.max(0, merged.tanggal - 2);

      // Sanity: debet < kredit < balance when all detected
      if (merged.debet < merged.kredit && merged.balance <= merged.kredit) {
        merged.balance = merged.kredit + 1;
      }

      best = { score, cols: merged, headerIdx: ri };
    }
  }

  return { cols: best.cols, headerIdx: best.headerIdx };
}

function extractTwFromSectionTitle(text) {
  const u = String(text ?? '').toUpperCase();
  if (/TRIWULAN\s*[- ]?\s*IV\b/.test(u)) return 4;
  if (/TRIWULAN\s*[- ]?\s*III\b/.test(u)) return 3;
  if (/TRIWULAN\s*[- ]?\s*II\b/.test(u)) return 2;
  if (/TRIWULAN\s*[- ]?\s*I\b/.test(u)) return 1;
  const m = u.match(/TRIWULAN\s*[- ]?\s*([1-4])\b/);
  if (m) return parseInt(m[1], 10);
  return null;
}

/** Scan row cells for ANGGARAN TRIWULAN section → quarter number */
function findSectionTriwulan(row) {
  if (!Array.isArray(row)) return null;
  for (const cell of row) {
    const s = String(cell ?? '').trim();
    if (/ANGGARAN\s+TRIWULAN/i.test(s)) {
      const tw = extractTwFromSectionTitle(s);
      if (tw != null) return tw;
    }
  }
  return null;
}

function rowLooksLikeTotalTriwulan(row) {
  const joined = row.map((c) => String(c ?? '').trim()).join(' ');
  return /TOTAL\s+TRIWULAN/i.test(joined);
}

function safeCell(row, idx) {
  if (!Array.isArray(row) || idx < 0 || idx >= row.length) return null;
  return row[idx];
}

function extractTransactions(rows, colMap, headerIdx) {
  const transactions = [];
  let currentTw = null;

  const startIdx = headerIdx >= 0 ? headerIdx + 1 : 10;

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row) || row.every((c) => c == null || c === '')) continue;

    const sectionTw = findSectionTriwulan(row);
    if (sectionTw != null) {
      currentTw = sectionTw;
      continue;
    }

    if (rowLooksLikeTotalTriwulan(row)) continue;

    if (currentTw === null) continue;

    const cm = colMap;

    const noBuktiRaw = safeCell(row, cm.no_bukti);
    const noBuktiStr = noBuktiRaw != null ? String(noBuktiRaw).trim() : '';

    const noDocRaw = safeCell(row, cm.no_dokumen);
    let noDocStr = noDocRaw != null ? String(noDocRaw).trim() : null;

    const tanggal = parseDateCell(safeCell(row, cm.tanggal));

    const ketRaw = safeCell(row, cm.keterangan);
    const keterangan = ketRaw != null ? String(ketRaw).trim() : null;

    const debet = parseAmountUnsigned(safeCell(row, cm.debet));
    const kredit = parseAmountUnsigned(safeCell(row, cm.kredit));
    const balance = parseAmountCell(safeCell(row, cm.balance));

    const joinedRow = row.map((c) => String(c ?? '').trim()).join(' ');
    if (/TOTAL\s+TRIWULAN/i.test(joinedRow)) continue;

    if (keterangan && /^ANGGARAN\s+TRIWULAN/i.test(keterangan)) continue;

    // Skip blank detail rows
    if (!keterangan && debet === 0 && kredit === 0 && balance === 0) continue;

    // Skip mistaken footer lines in first column only
    if (noBuktiStr && /^TOTAL\b|^JUMLAH\b/i.test(noBuktiStr)) continue;

    transactions.push({
      triwulan: currentTw,
      no_bukti: noBuktiStr || null,
      no_dokumen: noDocStr && noDocStr !== '-' ? noDocStr : null,
      tanggal,
      keterangan,
      debet,
      kredit,
      balance,
    });
  }

  return transactions;
}
