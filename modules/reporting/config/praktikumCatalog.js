/**
 * Katalog nama praktikum resmi per prodi (teks setelah " - " = kode lab).
 */

export const PRAKTIKUM_BY_PRODI = {
  TI: [
    'Praktikum Peracangan Tata Letak Fasilitas - FASTECH',
    'Praktikum Sistem Produksi dan Otomasi - SISPROMASI',
    'Praktikum Gambar Teknik - GTX',
    'Hands on Penelitian Operasional 2 - SIPO',
    'Praktikum Tekno Ekonomi - TEKMI',
    'Hands on Akutansi Bisnis - TEKMI',
    'Praktikum Statistika Industri dan Penelitian Operasional - SIPO',
    'Hands on Pengendalian dan Penjaminan Mutu - SIPO',
    'Hands on Enterprise Resource Planning - ENSYSE',
    'Praktikum Analisis Peracangan Sistem Informasi - ENSYSE',
  ],
  SI: [
    'Pengembangan Aplikasi Website - EAD',
    'Analisis dan Perancangan Sistem Informasi - EAD',
    'Sistem Operasi - SISJAR',
    'Keamanan Sistem Informasi - SISJAR',
    'Rekayasa Proses Bisnis - SAG',
    'Sistem Basis Data - DASPRO',
    'Data Warehouse dan Business Intelligence - DASPRO',
    'Penambangan Data - DASPRO',
    'Jaringan Komputer - SISJAR',
    'Algoritma Pemrograman - DASPRO',
    'Proyek Perangkat Lunak - EAD',
    'Pemrograman Berorientasi Objek - EAD',
    'Manajemen Rantai Pasok - ERP',
  ],
  TL: [
    'Analitik Data Logistik Lanjut - OPSIM',
    'Hands on Analisis Peracangan Sistem Informasi - ENSYSE',
    'Perencanaan & Pengendalian Sistem Logistik - OPSIM',
    'PRAKTIKUM ANALITIK DATA LOGISTIK - OPSIM',
  ],
};

export const ALL_CANONICAL_PRAKTIKUM = Object.values(PRAKTIKUM_BY_PRODI).flat();

export function extractLabCode(name) {
  const raw = String(name ?? '').trim();
  if (!raw) return '';
  const idx = raw.lastIndexOf(' - ');
  if (idx < 0) return raw.toUpperCase();
  return raw.slice(idx + 3).trim().toUpperCase();
}

export function prodiOfPracticum(canonicalName) {
  for (const [prodi, list] of Object.entries(PRAKTIKUM_BY_PRODI)) {
    if (list.includes(canonicalName)) return prodi;
  }
  return null;
}

/**
 * Map respons conduct ke nama praktikum resmi (lab code / fuzzy).
 */
export function resolveCanonicalPracticumName(rawName, moduleName = '') {
  const raw = String(rawName ?? '').trim();
  const mod = String(moduleName ?? '').trim();
  if (!raw && !mod) return null;

  if (ALL_CANONICAL_PRAKTIKUM.includes(raw)) return raw;

  const lab = extractLabCode(raw) || extractLabCode(mod);
  if (lab) {
    const byLab = ALL_CANONICAL_PRAKTIKUM.find(
      (c) => extractLabCode(c) === lab
    );
    if (byLab) return byLab;
  }

  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const squish = (s) => norm(s).replace(/\bdan\b/g, ' ').replace(/\s+/g, ' ').trim();
  const nRaw = norm(raw);
  const nRawSquish = squish(raw);
  for (const canonical of ALL_CANONICAL_PRAKTIKUM) {
    const nCan = norm(canonical);
    const nCanSquish = squish(canonical);
    if (nRaw === nCan) return canonical;
    if (nRaw && (nCan.includes(nRaw) || nRaw.includes(nCan))) return canonical;
    if (
      nRawSquish &&
      (nCanSquish.includes(nRawSquish) || nRawSquish.includes(nCanSquish))
    ) {
      return canonical;
    }
  }

  return raw || mod || null;
}
