/**
 * Laporan feedback dari exit survey conduct — format sama feedback Excel (PraktikumStats).
 * Sentimen: rating utama jika ada; fallback analyzeSentiment(teks) untuk respons tanpa rating.
 */

import { conductDb } from '../../../config/databases.js';
import { resolveFeedbackSemesterScope } from './feedbackSemesterScopeService.js';
import {
  resolveCanonicalPracticumName,
  ALL_CANONICAL_PRAKTIKUM,
} from '../config/praktikumCatalog.js';
import { analyzeSentiment } from './feedbackParsingService.js';
import {
  buildWordCloud,
  buildKeyPointsFromTexts,
  stripJsonQuotes,
} from '../utils/textTokenUtils.js';

const CATEGORY_FIELDS = [
  'ruangan',
  'alat',
  'sosialisasi',
  'interaksi_asisten',
  'platform',
  'pencapaian',
  'kemampuan_asisten',
];

const MIN_TEXT_LEN = 2;

function parseModuleId(raw) {
  const trimmed = String(raw ?? '').trim();
  return trimmed || null;
}

async function parseFilters(filters = {}) {
  const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const dateTo = filters.dateTo ? new Date(filters.dateTo) : null;
  const practicumName = String(filters.practicumName ?? '').trim() || null;
  const moduleId = parseModuleId(filters.moduleId ?? filters.module_id);
  const semesterInput =
    filters.semesterCode ?? filters.semester_code ?? 'active';
  const scope = await resolveFeedbackSemesterScope(semesterInput);
  return {
    dateFrom,
    dateTo,
    practicumName,
    moduleId,
    semesterCode: scope.semesterCode,
    scheduleIds: scope.scheduleIds,
  };
}

function buildWhereClause(
  { dateFrom, dateTo, practicumName, moduleId, scheduleIds },
  alias = 'r'
) {
  const clauses = [`${alias}.deleted_at IS NULL`];
  const params = [];
  let idx = 1;

  if (Array.isArray(scheduleIds)) {
    if (scheduleIds.length === 0) {
      clauses.push('1 = 0');
    } else {
      clauses.push(`${alias}.registration_schedule_id = ANY($${idx++}::uuid[])`);
      params.push(scheduleIds);
    }
  }

  if (dateFrom && !Number.isNaN(dateFrom.getTime())) {
    clauses.push(`${alias}.submitted_at >= $${idx++}`);
    params.push(dateFrom);
  }
  if (dateTo && !Number.isNaN(dateTo.getTime())) {
    clauses.push(`${alias}.submitted_at <= $${idx++}`);
    params.push(dateTo);
  }
  if (practicumName) {
    const canonical = resolveCanonicalPracticumName(practicumName);
    clauses.push(
      `(LOWER(TRIM(${alias}.practicum_name)) = LOWER(TRIM($${idx++}))
        OR LOWER(TRIM(${alias}.practicum_name)) = LOWER(TRIM($${idx++})))`
    );
    params.push(practicumName, canonical ?? practicumName);
  }
  if (moduleId) {
    clauses.push(`${alias}.module_id = $${idx++}::uuid`);
    params.push(moduleId);
  }

  return { whereSql: clauses.join(' AND '), params };
}

function numericAnswerValue(answer) {
  if (answer == null) return null;
  if (typeof answer === 'number' && Number.isFinite(answer)) return answer;
  if (typeof answer === 'string') {
    const n = Number.parseFloat(answer);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sentimentFromRating(value, maxRating = 5) {
  if (value == null) return null;
  const ratio = value / maxRating;
  if (ratio >= 0.8) return 'positive';
  if (ratio >= 0.6) return 'neutral';
  return 'negative';
}

function applySentiment(bucket, sentiment) {
  bucket.total_items += 1;
  if (sentiment === 'positive') bucket.positive_count += 1;
  else if (sentiment === 'neutral') bucket.neutral_count += 1;
  else bucket.negative_count += 1;
}

function mapCategory(sectionTitle, questionText) {
  const blob = `${sectionTitle ?? ''} ${questionText ?? ''}`.toLowerCase();
  if (/ruang|fasilitas|laboratorium|ruangan/.test(blob)) return 'ruangan';
  if (/alat|perangkat|device|hardware|perlengkapan/.test(blob)) return 'alat';
  if (/sosialisasi|orientasi|perkenalan|briefing/.test(blob)) return 'sosialisasi';
  if (/asisten|dosen|pembimbing|instruktur|laboran/.test(blob)) {
    return 'interaksi_asisten';
  }
  if (/platform|sistem|aplikasi|software|website|tools/.test(blob)) return 'platform';
  if (/capaian|kompetensi|pembelajaran|materi|kurikulum/.test(blob)) return 'pencapaian';
  if (/kemampuan|skill|kompetensi asisten/.test(blob)) return 'kemampuan_asisten';
  return null;
}

function emptyBucket(name) {
  return {
    nama_praktikum: name,
    total_items: 0,
    rating_response_count: 0,
    text_sentiment_count: 0,
    text_response_count: 0,
    textResponseIds: new Set(),
    positive_count: 0,
    neutral_count: 0,
    negative_count: 0,
    categorySums: Object.fromEntries(CATEGORY_FIELDS.map((k) => [k, []])),
  };
}

function createStatsMap() {
  const map = new Map();
  for (const name of ALL_CANONICAL_PRAKTIKUM) {
    map.set(name, emptyBucket(name));
  }
  return map;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function avg(arr) {
  if (!arr.length) return null;
  return round2(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function bucketToRow(bucket) {
  const sums = bucket.categorySums;
  return {
    nama_praktikum: bucket.nama_praktikum,
    total_items: bucket.total_items,
    rating_response_count: bucket.rating_response_count,
    text_sentiment_count: bucket.text_sentiment_count,
    text_response_count: bucket.text_response_count,
    avg_ruangan: avg(sums.ruangan),
    avg_alat: avg(sums.alat),
    avg_sosialisasi: avg(sums.sosialisasi),
    avg_interaksi_asisten: avg(sums.interaksi_asisten),
    avg_platform: avg(sums.platform),
    avg_pencapaian: avg(sums.pencapaian),
    avg_kemampuan_asisten: avg(sums.kemampuan_asisten),
    positive_count: bucket.positive_count,
    neutral_count: bucket.neutral_count,
    negative_count: bucket.negative_count,
  };
}

function buildTextSummary(samples, keyPoints = []) {
  if (!samples.length) {
    return {
      text: 'Belum ada komentar teks untuk periode ini.',
      count: 0,
      average_score: null,
      key_points: keyPoints,
    };
  }
  const lines = samples.slice(0, 6).map((s, i) => {
    const label = typeof s === 'string' ? s : s.text;
    return `${i + 1}. ${String(label).slice(0, 280)}`;
  });
  const avgScore =
    samples.length > 0
      ? round2(
          samples.reduce((sum, s) => sum + (s.score ?? 0), 0) / samples.length
        )
      : null;
  return {
    text: lines.join('\n\n'),
    count: samples.length,
    average_score: avgScore,
    key_points: keyPoints,
  };
}

async function getActiveSurvey() {
  const res = await conductDb.query(
    `SELECT id, title, description, status, activated_at
     FROM exit_surveys
     WHERE status = 'active' AND deleted_at IS NULL
     ORDER BY activated_at DESC NULLS LAST
     LIMIT 1`
  );
  return res.rows[0] ?? null;
}

async function fetchAnswerRows(parsed) {
  const { whereSql, params } = buildWhereClause(parsed);
  const rowsRes = await conductDb.query(
    `SELECT
       r.id::text AS response_id,
       r.practicum_name,
       r.module_name,
       q.question_text,
       q.question_type,
       q.min_rating,
       q.max_rating,
       s.title AS section_title,
       a.answer
     FROM exit_survey_response_answers a
     INNER JOIN exit_survey_responses r ON r.id = a.response_id
     INNER JOIN exit_survey_questions q ON q.id = a.question_id AND q.deleted_at IS NULL
     LEFT JOIN exit_survey_sections s ON s.id = q.section_id AND s.deleted_at IS NULL
     WHERE ${whereSql}`,
    params
  );
  return rowsRes.rows;
}

function getBucket(statsMap, unknownMap, canonical) {
  if (statsMap.has(canonical)) return statsMap.get(canonical);
  if (!unknownMap.has(canonical)) {
    unknownMap.set(canonical, emptyBucket(canonical));
  }
  return unknownMap.get(canonical);
}

function aggregateResponseData(rows, statsMap, unknownMap) {
  const responseRatings = new Map();
  const responseTexts = new Map();

  for (const row of rows) {
    const canonical = resolveCanonicalPracticumName(
      row.practicum_name,
      row.module_name
    );
    if (!canonical) continue;

    const bucket = getBucket(statsMap, unknownMap, canonical);
    const qType = String(row.question_type ?? '').toLowerCase();
    const rid = row.response_id;

    if (qType === 'text' || qType === 'textarea') {
      const text = stripJsonQuotes(row.answer);
      if (text.length >= MIN_TEXT_LEN) {
        if (!bucket.textResponseIds.has(rid)) {
          bucket.textResponseIds.add(rid);
          bucket.text_response_count = bucket.textResponseIds.size;
        }
        if (!responseTexts.has(rid)) {
          responseTexts.set(rid, { canonical, texts: [] });
        }
        const entry = responseTexts.get(rid);
        if (entry.canonical === canonical) {
          entry.texts.push(text);
        }
      }
      continue;
    }

    if (qType !== 'rating' && qType !== 'linear_scale') continue;

    const value = numericAnswerValue(row.answer);
    if (value == null) continue;

    const maxR = Number(row.max_rating) || 5;
    const minR = Number(row.min_rating) || 1;
    const normalized =
      maxR > minR
        ? minR + ((value - minR) / (maxR - minR)) * (5 - minR)
        : value;

    const cat = mapCategory(row.section_title, row.question_text);
    if (cat && bucket.categorySums[cat]) {
      bucket.categorySums[cat].push(normalized);
    }

    if (!responseRatings.has(rid)) {
      responseRatings.set(rid, { canonical, ratings: [] });
    }
    const entry = responseRatings.get(rid);
    if (entry.canonical === canonical) {
      entry.ratings.push(normalized);
    }
  }

  return { responseRatings, responseTexts };
}

function applySentimentsToBuckets(statsMap, unknownMap, responseRatings, responseTexts) {
  const ratedIds = new Set();

  for (const [rid, entry] of responseRatings.entries()) {
    if (!entry.ratings.length) continue;
    ratedIds.add(rid);
    const bucket = getBucket(statsMap, unknownMap, entry.canonical);
    const avgR =
      entry.ratings.reduce((a, b) => a + b, 0) / entry.ratings.length;
    const sent = sentimentFromRating(avgR, 5);
    applySentiment(bucket, sent);
    bucket.rating_response_count += 1;
  }

  for (const [rid, entry] of responseTexts.entries()) {
    if (ratedIds.has(rid) || !entry.texts.length) continue;
    const bucket = getBucket(statsMap, unknownMap, entry.canonical);
    const combined = entry.texts.join(' ');
    const { sentiment } = analyzeSentiment(combined);
    applySentiment(bucket, sentiment);
    bucket.text_sentiment_count += 1;
  }
}

export async function getFeedbackPraktikumStats(filters = {}) {
  const parsed = await parseFilters(filters);
  const rows = await fetchAnswerRows(parsed);

  const statsMap = createStatsMap();
  const unknownMap = new Map();
  const { responseRatings, responseTexts } = aggregateResponseData(
    rows,
    statsMap,
    unknownMap
  );
  applySentimentsToBuckets(
    statsMap,
    unknownMap,
    responseRatings,
    responseTexts
  );

  const stats = [...statsMap.values(), ...unknownMap.values()]
    .map(bucketToRow)
    .filter((r) => r.total_items > 0 || r.text_response_count > 0);

  const activeSurvey = await getActiveSurvey();

  return {
    active_survey: activeSurvey,
    stats,
    period: {
      semester_code: parsed.semesterCode,
      label: parsed.semesterCode ?? 'Periode aktif belum dikonfigurasi',
    },
  };
}

export async function getFeedbackModules(filters = {}) {
  const parsed = await parseFilters(filters);
  if (!parsed.practicumName) {
    return [];
  }

  const { whereSql, params } = buildWhereClause(parsed);
  const res = await conductDb.query(
    `SELECT
       r.module_id::text AS module_id,
       MAX(r.module_name) AS module_name,
       COUNT(DISTINCT r.id)::int AS response_count
     FROM exit_survey_responses r
     WHERE ${whereSql}
       AND r.module_id IS NOT NULL
     GROUP BY r.module_id
     ORDER BY module_name NULLS LAST, module_id`,
    params
  );

  return res.rows.map((row) => ({
    module_id: row.module_id,
    module_name: row.module_name?.trim() || 'Modul',
    response_count: row.response_count ?? 0,
  }));
}

export async function getFeedbackReviewsTopWorst(filters = {}) {
  const parsed = await parseFilters(filters);
  const rows = await fetchAnswerRows(parsed);

  const namaFilter = parsed.practicumName
    ? resolveCanonicalPracticumName(parsed.practicumName)
    : null;

  const scoredTexts = [];
  for (const row of rows) {
    const qType = String(row.question_type ?? '').toLowerCase();
    if (qType !== 'text' && qType !== 'textarea') continue;

    const canonical = resolveCanonicalPracticumName(
      row.practicum_name,
      row.module_name
    );
    if (namaFilter && canonical !== namaFilter) continue;

    const text = stripJsonQuotes(row.answer);
    if (text.length < MIN_TEXT_LEN) continue;

    const { sentiment, score } = analyzeSentiment(text);
    scoredTexts.push({ text, sentiment, score });
  }

  const plainTexts = scoredTexts.map((s) => s.text);
  const wordCloud = buildWordCloud(plainTexts);
  const keyPoints = buildKeyPointsFromTexts(plainTexts);

  const sorted = [...scoredTexts].sort((a, b) => b.score - a.score);
  const topSamples = sorted
    .filter((s) => s.sentiment !== 'negative')
    .slice(0, 6);
  const worstSamples = [...sorted]
    .filter((s) => s.sentiment !== 'positive')
    .sort((a, b) => a.score - b.score)
    .slice(0, 6);

  const topScore = topSamples.length
    ? round2(topSamples.reduce((s, t) => s + t.score, 0) / topSamples.length)
    : null;
  const worstScore = worstSamples.length
    ? round2(
        worstSamples.reduce((s, t) => s + t.score, 0) / worstSamples.length
      )
    : null;

  const sentimentGap =
    topScore != null && worstScore != null
      ? round2(topScore - worstScore)
      : null;

  return {
    success: true,
    data: {
      top_review_summary: buildTextSummary(
        topSamples.length ? topSamples : sorted.slice(0, 3),
        keyPoints.slice(0, 3)
      ),
      worst_review_summary: buildTextSummary(
        worstSamples.length
          ? worstSamples
          : sorted.slice(-3).reverse()
      ),
      word_cloud: wordCloud,
      metadata: {
        periode: parsed.semesterCode
          ? `Semester ${parsed.semesterCode}`
          : 'Periode aktif belum dikonfigurasi',
        semester_code: parsed.semesterCode,
        total_reviews_analyzed: scoredTexts.length,
        sentiment_gap: sentimentGap,
      },
    },
  };
}
