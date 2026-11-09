/**
 * Compare transaksi laporan laboran vs item procurement (KPA sistem).
 * Read-only terhadap modul procurement.
 */

import {
  getLaboranUploadById,
  listLaboranUploads,
  listLaboranTransactionsWithSheet,
  listLaboranSheets,
  insertCompareRun,
  bulkInsertCompareResults,
  getCompareRunById,
  getCompareSummaryByProdi,
  listCompareResults,
  getLatestCompareRunForUpload,
} from '../models/laboranKeuanganModel.js';
import {
  loadStudyProgramIndex,
  loadLaboratoryNameIndex,
  resolveStudyProgramForLaboranSheet,
  loadProcurementItemsForCompare,
} from './procurementCompareLoader.js';

const DATE_WINDOW_DAYS = 7;
const MIN_TEXT_SCORE = 0.12;

function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

function textSimilarity(a, b) {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  return inter / Math.max(ta.size, tb.size);
}

function daysApart(d1, d2) {
  if (!d1 || !d2) return 999;
  const a = new Date(String(d1).slice(0, 10));
  const b = new Date(String(d2).slice(0, 10));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 999;
  return Math.abs(a.getTime() - b.getTime()) / 86400000;
}

function procurementText(item, labNames) {
  const lab = item.lab_id ? labNames.get(item.lab_id) || '' : '';
  return [item.item_name, item.purpose, item.submission_reference, lab]
    .filter(Boolean)
    .join(' ');
}

function scopeMatches(laboranTx, item, sheetStudyProgramId) {
  if (!sheetStudyProgramId) return true;
  if (!item.study_program_id) return true;
  return String(item.study_program_id) === String(sheetStudyProgramId);
}

function scorePair(laboranTx, item, labNames) {
  const amountMatch = Number(laboranTx.nominal) === Number(item.total_price);
  const dayDiff = daysApart(laboranTx.tanggal, item.transaction_date);
  if (dayDiff > DATE_WINDOW_DAYS) return { score: -1, amountMatch, dayDiff };

  const text = textSimilarity(
    laboranTx.keterangan || laboranTx.no_bukti || '',
    procurementText(item, labNames)
  );
  if (text < MIN_TEXT_SCORE && dayDiff > 2) return { score: -1, amountMatch, dayDiff, text };

  let score = text;
  if (amountMatch) score += 0.5;
  if (dayDiff <= 1) score += 0.2;
  else if (dayDiff <= 3) score += 0.1;

  return { score, amountMatch, dayDiff, text };
}

function buildResult(status, laboranTx, item, meta, extra = {}) {
  return {
    status,
    kode_pp: laboranTx?.kode_pp ?? null,
    nama_pp: laboranTx?.nama_pp ?? null,
    laboran_transaction_id: laboranTx?.id ?? null,
    procurement_item_id: item?.submission_item_id ?? null,
    procurement_submission_id: item?.submission_id ?? null,
    laboran_no_bukti: laboranTx?.no_bukti ?? null,
    laboran_keterangan: laboranTx?.keterangan ?? null,
    laboran_nominal: laboranTx?.nominal ?? null,
    laboran_tanggal: laboranTx?.tanggal ?? null,
    procurement_item_name: item?.item_name ?? null,
    procurement_reference: item?.submission_reference ?? null,
    procurement_nominal: item?.total_price ?? null,
    procurement_tanggal: item?.transaction_date ?? null,
    match_score: meta?.score ?? null,
    message: extra.message ?? null,
  };
}

export function runTransactionMatching(laboranRows, procurementItems, labNames, sheetStudyProgramBySheetId) {
  const matchedLaboran = new Set();
  const matchedProcurement = new Set();
  const results = [];

  const laboranList = laboranRows.filter((r) => Number(r.nominal) > 0);
  const procurementList = [...procurementItems];

  for (const item of procurementList) {
    let best = null;
    let bestMeta = null;

    for (const lx of laboranList) {
      if (matchedLaboran.has(lx.id)) continue;
      const spId = sheetStudyProgramBySheetId.get(lx.sheet_id) ?? null;
      if (!scopeMatches(lx, item, spId)) continue;

      const meta = scorePair(lx, item, labNames);
      if (meta.score < 0 || !meta.amountMatch) continue;
      if (!best || meta.score > bestMeta.score) {
        best = lx;
        bestMeta = meta;
      }
    }

    if (best) {
      matchedLaboran.add(best.id);
      matchedProcurement.add(item.submission_item_id);
      results.push(buildResult('matched', best, item, bestMeta));
    }
  }

  for (const item of procurementList) {
    if (matchedProcurement.has(item.submission_item_id)) continue;

    let best = null;
    let bestMeta = null;

    for (const lx of laboranList) {
      if (matchedLaboran.has(lx.id)) continue;
      const spId = sheetStudyProgramBySheetId.get(lx.sheet_id) ?? null;
      if (!scopeMatches(lx, item, spId)) continue;

      const meta = scorePair(lx, item, labNames);
      if (meta.score < 0 || meta.amountMatch) continue;
      if (meta.text >= MIN_TEXT_SCORE && meta.dayDiff <= DATE_WINDOW_DAYS) {
        const adjScore = meta.text + (DATE_WINDOW_DAYS - meta.dayDiff) * 0.01;
        if (!best || adjScore > bestMeta.adjScore) {
          best = lx;
          bestMeta = { ...meta, adjScore };
        }
      }
    }

    if (best) {
      matchedLaboran.add(best.id);
      matchedProcurement.add(item.submission_item_id);
      results.push(
        buildResult('amount_mismatch', best, item, bestMeta, {
          message: `Nominal berbeda: laboran ${best.nominal} vs KPA ${item.total_price}`,
        })
      );
    }
  }

  for (const item of procurementList) {
    if (matchedProcurement.has(item.submission_item_id)) continue;
    results.push(
      buildResult('missing_in_laboran', null, item, null, {
        message: `Item "${item.item_name}" belum tercatat di laporan laboran`,
      })
    );
  }

  for (const lx of laboranList) {
    if (matchedLaboran.has(lx.id)) continue;
    results.push(
      buildResult('missing_in_kpa', lx, null, null, {
        message: `No Bukti ${lx.no_bukti || '(tanpa bukti)'} belum tercatat di KPA (procurement)`,
      })
    );
  }

  const counts = {
    matched: results.filter((r) => r.status === 'matched').length,
    missing_in_laboran: results.filter((r) => r.status === 'missing_in_laboran').length,
    missing_in_kpa: results.filter((r) => r.status === 'missing_in_kpa').length,
    amount_mismatch: results.filter((r) => r.status === 'amount_mismatch').length,
  };

  return { results, counts };
}

export async function executeCompare(uploadId, userId) {
  const upload = await getLaboranUploadById(uploadId);
  if (!upload) {
    const err = new Error('Upload laporan laboran tidak ditemukan');
    err.statusCode = 404;
    throw err;
  }

  const [laboranRows, spIndex, labNames, sheets] = await Promise.all([
    listLaboranTransactionsWithSheet(uploadId),
    loadStudyProgramIndex(),
    loadLaboratoryNameIndex(),
    listLaboranSheets(uploadId),
  ]);

  const sheetStudyProgramBySheetId = new Map();
  const studyProgramIds = new Set();
  for (const sheet of sheets) {
    const spId = resolveStudyProgramForLaboranSheet(sheet, spIndex);
    sheetStudyProgramBySheetId.set(sheet.id, spId);
    if (spId) studyProgramIds.add(spId);
  }

  const procurementItems = await loadProcurementItemsForCompare({
    tahun: upload.tahun,
    studyProgramIds: studyProgramIds.size ? [...studyProgramIds] : null,
  });

  const { results, counts } = runTransactionMatching(
    laboranRows,
    procurementItems,
    labNames,
    sheetStudyProgramBySheetId
  );

  for (const r of results) {
    if (r.status === 'missing_in_laboran' && r.procurement_item_id) {
      const item = procurementItems.find((i) => i.submission_item_id === r.procurement_item_id);
      if (item?.study_program_id) {
        const sp = spIndex.byId.get(item.study_program_id);
        if (sp) {
          r.kode_pp = r.kode_pp || sp.code;
          r.nama_pp = r.nama_pp || sp.name;
        }
      }
    }
  }

  const run = await insertCompareRun(null, {
    uploadId,
    tahun: upload.tahun,
    runBy: userId,
    matchedCount: counts.matched,
    missingLaboranCount: counts.missing_in_laboran,
    missingKpaCount: counts.missing_in_kpa,
    mismatchCount: counts.amount_mismatch,
  });

  await bulkInsertCompareResults(null, run.id, results);

  return {
    run: await getCompareRunById(run.id),
    summary: {
      matched_count: counts.matched,
      missing_laboran_count: counts.missing_in_laboran,
      missing_kpa_count: counts.missing_in_kpa,
      mismatch_count: counts.amount_mismatch,
      is_fully_matched:
        counts.missing_in_laboran === 0 &&
        counts.missing_in_kpa === 0 &&
        counts.amount_mismatch === 0,
    },
  };
}

export async function getCompareOverview(runId) {
  const run = await getCompareRunById(runId);
  if (!run) {
    const err = new Error('Hasil compare tidak ditemukan');
    err.statusCode = 404;
    throw err;
  }
  const prodiSummaries = await getCompareSummaryByProdi(runId);
  return {
    run,
    summary: {
      matched_count: run.matched_count,
      missing_laboran_count: run.missing_laboran_count,
      missing_kpa_count: run.missing_kpa_count,
      mismatch_count: run.mismatch_count,
      is_fully_matched: run.is_fully_matched,
    },
    prodi_summaries: prodiSummaries,
  };
}

export async function getCompareProdiDetail(runId, kodePP, filters = {}) {
  const run = await getCompareRunById(runId);
  if (!run) {
    const err = new Error('Hasil compare tidak ditemukan');
    err.statusCode = 404;
    throw err;
  }

  let items = await listCompareResults(runId, { status: filters.status });
  if (kodePP === '_unknown') {
    items = items.filter((i) => !i.kode_pp);
  } else {
    items = items.filter((i) => String(i.kode_pp ?? '') === String(kodePP));
  }

  return { run, kode_pp: kodePP, items };
}

/**
 * Ambil upload laboran terbaru lalu kembalikan hasil compare (cache atau fresh).
 */
export async function getOrRunLatestCompare({ tahun = null, userId = 'system', refresh = false } = {}) {
  const uploads = await listLaboranUploads({ limit: 1, tahun });
  const upload = uploads[0];
  if (!upload) {
    const err = new Error(
      tahun
        ? `Belum ada laporan laboran untuk tahun ${tahun}`
        : 'Belum ada laporan laboran yang diupload'
    );
    err.statusCode = 404;
    throw err;
  }

  if (!refresh) {
    const cached = await getLatestCompareRunForUpload(upload.id);
    if (cached) {
      return {
        upload,
        run: cached,
        summary: {
          matched_count: cached.matched_count,
          missing_laboran_count: cached.missing_laboran_count,
          missing_kpa_count: cached.missing_kpa_count,
          mismatch_count: cached.mismatch_count,
          is_fully_matched: cached.is_fully_matched,
        },
        from_cache: true,
      };
    }
  }

  const result = await executeCompare(upload.id, userId);
  return { upload, ...result, from_cache: false };
}

export { getLatestCompareRunForUpload };
