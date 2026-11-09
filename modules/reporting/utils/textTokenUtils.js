/**
 * Tokenisasi teks feedback untuk word cloud & key points.
 */

const STOPWORDS = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'pada', 'untuk', 'dengan', 'ini', 'itu',
  'ada', 'tidak', 'saya', 'kami', 'kita', 'nya', 'juga', 'sudah', 'belum',
  'akan', 'atau', 'tapi', 'tetapi', 'karena', 'agar', 'sangat', 'lebih',
  'kurang', 'bisa', 'dapat', 'harus', 'perlu', 'saat', 'ketika', 'oleh',
  'the', 'and', 'for', 'are', 'was', 'were', 'been', 'have', 'has', 'had',
]);

export function tokenizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

export function buildWordCloud(texts, limit = 40) {
  const freq = new Map();
  for (const raw of texts) {
    for (const word of tokenizeText(raw)) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

export function buildKeyPointsFromTexts(texts, limit = 6) {
  return buildWordCloud(texts, limit).map(({ word, count }) => ({
    theme: word,
    frequency: count,
    examples: [],
  }));
}

export function stripJsonQuotes(value) {
  const text = String(value ?? '').trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1).trim();
  }
  return text;
}
