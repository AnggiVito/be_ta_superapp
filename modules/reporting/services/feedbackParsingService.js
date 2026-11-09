/**
 * Feedback Parsing Service — analisis sentimen teks & rating.
 */

/**
 * Analisis sentimen bahasa Indonesia berbasis kata kunci berbobot.
 * Returns: { sentiment: 'positive'|'negative'|'neutral', score: -1.0 to 1.0 }
 */
export function analyzeSentiment(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { sentiment: 'neutral', score: 0 };
  }

  const lower = text.toLowerCase().trim();

  const strongPositive = [
    'sangat baik', 'sangat bagus', 'sangat memuaskan', 'sangat puas', 'sangat senang',
    'sangat jelas', 'sangat membantu', 'sangat terbantu', 'sangat responsif',
    'sangat ramah', 'sangat kompeten', 'sangat profesional', 'sangat informatif',
    'luar biasa', 'sempurna', 'terbaik', 'hebat', 'keren sekali', 'mantap sekali',
    'memuaskan sekali', 'excellent', 'amazing', 'outstanding', 'perfect',
    'puas sekali', 'sangat puas', 'sangat terkesan', 'terima kasih banyak',
    'apresiasi', 'salut', 'benar-benar membantu', 'sungguh membantu',
  ];

  const moderatePositive = [
    'baik', 'bagus', 'memuaskan', 'puas', 'senang', 'suka', 'mantap',
    'keren', 'jelas', 'membantu', 'terbantu', 'ramah', 'sabar', 'pintar',
    'profesional', 'responsif', 'teliti', 'detail', 'kompeten', 'informatif',
    'teratur', 'terstruktur', 'efektif', 'efisien', 'tepat', 'tepat waktu',
    'sesuai', 'sesuai harapan', 'sesuai ekspektasi', 'berjalan lancar',
    'berjalan baik', 'berjalan dengan baik', 'sudah baik', 'sudah bagus',
    'sudah jelas', 'sudah membantu', 'sudah oke', 'sudah cukup baik',
    'cukup baik', 'cukup jelas', 'cukup membantu', 'cukup memuaskan',
    'cukup puas', 'terima kasih', 'menarik', 'nyaman', 'kondusif',
    'bersih', 'terawat', 'lengkap', 'memadai', 'cukup memadai',
    'mudah dipahami', 'mudah dimengerti', 'mudah', 'lancar',
    'bermanfaat', 'bermakna', 'berkualitas', 'interaktif', 'menyenangkan',
    'good', 'great', 'nice', 'helpful', 'clear', 'friendly', 'patient',
    'recommended', 'worth it', 'sigap', 'siap', 'andal',
    'oke', 'ok', 'iya sudah', 'sudah oke', 'oke saja', 'ok saja',
    'lumayan baik', 'lumayan bagus', 'lumayan membantu', 'lumayan jelas',
  ];

  const mildPositive = [
    'lumayan', 'cukup', 'sudah cukup', 'sudah sesuai', 'sudah berjalan',
    'bisa', 'boleh', 'boleh lah', 'oke lah', 'ok lah', 'baiklah',
    'tidak masalah', 'tidak ada masalah', 'tidak ada keluhan',
    'tidak ada saran', 'tidak ada kritik', 'tidak ada catatan',
  ];

  const strongNegative = [
    'sangat buruk', 'sangat jelek', 'sangat kecewa', 'sangat tidak puas',
    'sangat tidak jelas', 'sangat tidak membantu', 'sangat lambat',
    'sangat tidak profesional', 'sangat tidak baik', 'sangat tidak responsif',
    'terrible', 'awful', 'horrible', 'worst', 'disgusting',
    'tidak bisa dimaafkan', 'benar-benar buruk', 'benar-benar kecewa',
    'sangat mengecewakan', 'mengecewakan sekali',
  ];

  const moderateNegative = [
    'buruk', 'jelek', 'kecewa', 'tidak puas', 'tidak baik', 'tidak jelas',
    'tidak membantu', 'tidak responsif', 'tidak profesional', 'tidak teliti',
    'tidak efektif', 'tidak efisien', 'tidak teratur', 'tidak tepat waktu',
    'tidak sesuai', 'tidak memadai', 'tidak lengkap', 'tidak nyaman',
    'tidak kondusif', 'tidak bersih', 'tidak terawat', 'tidak bermanfaat',
    'tidak bermakna', 'tidak menarik', 'tidak interaktif', 'tidak mudah',
    'sulit dipahami', 'membingungkan', 'bingung', 'susah dipahami',
    'lambat', 'terlambat', 'lama', 'kasar', 'galak', 'tidak sabar',
    'asal-asalan', 'asal', 'ribet', 'rumit', 'complicated',
    'nggak jelas', 'nggak membantu', 'nggak baik', 'nggak bagus',
    'ga jelas', 'ga membantu', 'ga baik', 'ga bagus', 'ga puas',
    'gak jelas', 'gak membantu', 'gak baik', 'gak bagus',
    'bad', 'poor', 'unclear', 'unhelpful', 'slow', 'rude', 'unprofessional',
    'boring', 'membosankan', 'monoton',
    'error', 'eror', 'bug', 'gangguan', 'terganggu',
    'rusak', 'tidak berfungsi', 'tidak berjalan', 'tidak bekerja',
  ];

  const mildNegative = [
    'kurang baik', 'kurang bagus', 'kurang jelas', 'kurang membantu',
    'kurang memuaskan', 'kurang responsif', 'kurang efektif', 'kurang efisien',
    'kurang informatif', 'kurang menarik', 'kurang lengkap', 'kurang memadai',
    'kurang teratur', 'kurang nyaman', 'kurang tepat waktu', 'kurang siap',
    'kurang interaktif', 'kurang kondusif', 'kurang bersih', 'kurang terawat',
    'masih kurang', 'masih perlu', 'masih perlu perbaikan', 'masih perlu peningkatan',
    'perlu diperbaiki', 'perlu ditingkatkan', 'perlu perbaikan', 'perlu peningkatan',
    'butuh perbaikan', 'butuh peningkatan', 'belum optimal', 'belum memadai',
    'belum cukup', 'belum sesuai', 'belum baik', 'belum jelas',
    'bisa lebih baik', 'bisa ditingkatkan', 'bisa diperbaiki', 'bisa lebih jelas',
    'agak lambat', 'agak membingungkan', 'agak kurang', 'sedikit membingungkan',
    'terlalu cepat', 'terlalu lambat', 'terlalu padat', 'terlalu singkat',
    'susah', 'sulit', 'tidak mudah',
  ];

  let posScore = 0;
  let negScore = 0;

  for (const kw of strongPositive) {
    if (lower.includes(kw)) posScore += 1.0;
  }
  for (const kw of moderatePositive) {
    if (lower.includes(kw)) posScore += 0.7;
  }
  for (const kw of mildPositive) {
    if (lower.includes(kw)) posScore += 0.4;
  }
  for (const kw of strongNegative) {
    if (lower.includes(kw)) negScore += 1.0;
  }
  for (const kw of moderateNegative) {
    if (lower.includes(kw)) negScore += 0.7;
  }
  for (const kw of mildNegative) {
    if (lower.includes(kw)) negScore += 0.4;
  }

  const totalScore = posScore + negScore;

  if (totalScore === 0) {
    return { sentiment: 'neutral', score: 0 };
  }

  const normalizedScore = (posScore - negScore) / totalScore;

  let sentiment;
  if (normalizedScore > 0.1) {
    sentiment = 'positive';
  } else if (normalizedScore < -0.1) {
    sentiment = 'negative';
  } else {
    sentiment = 'neutral';
  }

  return { sentiment, score: parseFloat(normalizedScore.toFixed(4)) };
}

/**
 * Derive sentiment from numeric ratings (1-5 scale) when no text is available.
 */
export function deriveRatingSentiment(ratings) {
  const values = ratings.filter((r) => r !== null && r !== undefined && !isNaN(r));
  if (values.length === 0) return { sentiment: 'neutral', score: 0 };

  const avg = values.reduce((sum, r) => sum + Number(r), 0) / values.length;
  const score = parseFloat(((avg - 3) / 2).toFixed(4));

  let sentiment;
  if (score > 0.25) {
    sentiment = 'positive';
  } else if (score < -0.25) {
    sentiment = 'negative';
  } else {
    sentiment = 'neutral';
  }

  return { sentiment, score };
}
