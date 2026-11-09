/**
 * BAST Vendor — layout mengikuti template berita acara serah terima vendor.pdf
 */
import { PDF_A4_BERITA_ACARA_PAGE_CSS, renderGenericHtmlToPdf } from './pdfService.js';
import { amountToTerbilangRupiah } from '../utils/terbilang.js';

const FRI = 'Fakultas Rekayasa Industri';
const UT = 'Universitas Telkom';

/** Teks statis — diselaraskan dengan template PDF asli. */
const STATIC = {
  spesifikasiSummary: 'Terlampir',
  signer1Name: 'Ekky Novriza Alam, S.Kom., M.T.',
  signer1Title: 'Kaur. Bengkel dan Laboratorium',
  staffTitle: 'Staf. Bengkel dan Lab FRI',
  mengetahuiName: 'Dr. Amelia Kurniawati, S.T., M.T.',
  mengetahuiRole1: 'Wakil Dekan II',
  mengetahuiRole2: FRI,
  statusLine: 'DITERIMA DENGAN HASIL BAIK DAN LENGKAP',
  listItem2:
    'Hasil pengadaan telah dilaksanakan sesuai dengan spesifikasi dan volume yang diminta secara terperinci sesuai lampiran Berita Acara ini dinyatakan :',
  penutup:
    'Demikian Berita Acara ini dibuat dengan sebenarnya dan sejujurnya sebagai dasar proses lebih lanjut.',
};

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Rp6.305.800,- (nilai ringkasan halaman 1) */
function formatIdrBast(n) {
  const v = Math.round(Number(n) || 0);
  const digits = v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp${digits},-`;
}

/** Rp950.000 (kolom tabel lampiran) */
function formatIdrTable(n) {
  const v = Math.round(Number(n) || 0);
  const digits = v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp${digits}`;
}

function formatQty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v === Math.floor(v) ? String(Math.floor(v)) : String(v);
}

function toTitleCaseWords(s) {
  return String(s || '')
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

/** Nama penandatangan — hindari ALL CAPS dari JWT, tambah gelar jika belum ada. */
function formatSignerDisplayName(rawName, defaultSuffix = 'S.T., M.T.') {
  let n = String(rawName || '').trim();
  if (!n) return '________________________';
  const letters = n.replace(/[^A-Za-z]/g, '');
  if (letters.length > 0 && n === n.toUpperCase()) {
    n = toTitleCaseWords(n);
  }
  if (!n.includes(',')) {
    return `${n}, ${defaultSuffix}`;
  }
  return n;
}

function buildSigEntryHtml(num, displayName, role, { compact = false } = {}) {
  const dots = '.......................';
  const nameHtml = underlineName(displayName);
  const sizeClass = compact ? ' sig-entry-compact' : '';
  return `
    <div class="sig-entry${sizeClass}">
      <div class="sig-main">
        <span class="sig-num">${num}.</span>
        <span class="sig-name-cell">${nameHtml}</span>
        <span class="sig-colon">:</span>
        <span class="sig-dots">${dots}</span>
      </div>
      <div class="sig-role">${escapeHtml(role)}</div>
    </div>`;
}

function formatDateId(d) {
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function underlineName(name) {
  const n = String(name || '').trim();
  if (!n) return '________________________';
  return `<span class="name-u">${escapeHtml(n)}</span>`;
}

export function buildVendorBastPdfFilename(submission) {
  const ref = (
    submission?.submission_reference ||
    submission?.reference ||
    `submission-${submission?.id ?? 'unknown'}`
  )
    .toString()
    .replace(/[^\w.-]+/g, '_');
  return `BAST_Vendor_${ref}.pdf`;
}

function buildLampiranTableRows(vendorBundle) {
  const lines = Array.isArray(vendorBundle?.lines) ? vendorBundle.lines : [];
  return lines
    .map((line, i) => {
      const spec = (line.item_name ?? '').toString().trim() || '—';
      const unit = (line.unit ?? '').toString().trim() || '—';
      return `<tr>
        <td class="c no">${i + 1}</td>
        <td class="spec">${escapeHtml(spec)}</td>
        <td class="c vol">${escapeHtml(formatQty(line.quantity))}</td>
        <td class="c sat">${escapeHtml(unit)}</td>
        <td class="c harga">${escapeHtml(formatIdrTable(line.normal_price))}</td>
        <td class="c jumlah">${escapeHtml(formatIdrTable(line.actual_price))}</td>
        <td class="c chk"></td>
        <td class="c chk"></td>
      </tr>`;
    })
    .join('');
}

/**
 * @param {object} submission
 * @param {object} vendorBundle
 * @param {{ name?: string, nipnim?: string }} signer
 */
export function buildVendorBastHtml(submission, vendorBundle, signer = {}) {
  const eventDate = vendorBundle?.updated_at
    ? new Date(vendorBundle.updated_at)
    : new Date();
  const dateStr = formatDateId(eventDate);

  const rawTitle = (vendorBundle?.title ?? '').toString().trim();
  const titleCaps = rawTitle.toUpperCase();
  const titleMixed = toTitleCaseWords(rawTitle);
  const titlePekerjaan = rawTitle ? `${titleMixed} ${FRI}` : `— ${FRI}`;
  const lampiranLabel = rawTitle ? `${titleMixed} ${FRI}` : `— ${FRI}`;
  const partner = (vendorBundle?.partner_name ?? '').toString().trim() || '—';
  const totalNum = Number(vendorBundle?.total_actual_price) || 0;
  const totalFormatted = formatIdrBast(totalNum);
  const totalTable = formatIdrTable(totalNum);
  const terbilang = amountToTerbilangRupiah(totalNum);

  const staffRaw = (signer?.name ?? '').toString().trim();
  const staffNamePage2 = formatSignerDisplayName(staffRaw, 'S.T., M.T.');
  const staffSigCompact = staffNamePage2.length > 42;
  /** Judul dalam narasi (title case + FRI + UT). */
  const titleNarrative = rawTitle
    ? `${titleMixed} ${FRI} ${UT}`
    : `${FRI} ${UT}`;

  const itemRows = buildLampiranTableRows(vendorBundle);

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>BAST Vendor</title>
  <style>
    ${PDF_A4_BERITA_ACARA_PAGE_CSS}
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      color: #000;
      line-height: 1.5;
    }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }

    /* —— Halaman 1 —— */
    .header-block {
      text-align: center;
      margin: 0 0 12px;
      line-height: 1.35;
    }
    .header-block .line {
      font-weight: bold;
      text-transform: uppercase;
      font-size: 11pt;
    }
    .header-block .line-main {
      font-size: 11.5pt;
      margin-bottom: 3px;
    }
    .header-block .line-title {
      font-size: 11pt;
      margin: 2px 0 4px;
      padding: 0 8px;
    }
    .header-rule {
      border: none;
      border-top: 2.5px solid #000;
      margin: 10px 0 12px;
      width: 100%;
    }

    table.summary {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0 14px;
      font-size: 11pt;
      table-layout: fixed;
    }
    table.summary td {
      border: 1px solid #000;
      padding: 5px 8px;
      vertical-align: top;
      text-align: left;
    }
    table.summary .lbl {
      width: 88px;
      white-space: nowrap;
    }
    table.summary .colon {
      width: 14px;
      padding-left: 6px;
      padding-right: 4px;
      white-space: nowrap;
    }
    table.summary .val {
      width: auto;
      word-wrap: break-word;
    }
    table.summary .nilai-terbilang {
      font-style: italic;
    }

    .para {
      text-align: justify;
      margin: 0 0 8px;
      text-indent: 0;
    }
    .body-intro {
      text-align: justify;
      margin: 0 0 10px;
      line-height: 1.55;
    }
    ol.bast-list {
      margin: 4px 0 10px 0;
      padding-left: 28px;
    }
    ol.bast-list li {
      text-align: justify;
      margin-bottom: 6px;
      padding-left: 4px;
    }
    .status-center {
      text-align: center;
      font-weight: bold;
      font-size: 11pt;
      margin: 14px 0 12px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .penutup {
      text-align: justify;
      margin: 0 0 10px;
    }

    table.sign-p1 {
      width: 100%;
      border-collapse: collapse;
      margin-top: 22px;
    }
    table.sign-p1 td {
      width: 50%;
      vertical-align: top;
      padding: 4px 12px 0;
    }
    table.sign-p1 td.sign-p1-fri {
      text-align: left;
      padding-left: 0;
      padding-right: 24px;
    }
    table.sign-p1 td.sign-p1-partner {
      text-align: center;
    }
    table.sign-p1 .org {
      font-weight: bold;
      line-height: 1.4;
      text-align: left;
    }
    table.sign-p1 .pad { height: 70px; }
    table.sign-p1 .name-u {
      font-weight: bold;
      text-decoration: underline;
      margin-top: 4px;
      text-align: left;
    }
    table.sign-p1 .role {
      font-size: 10.5pt;
      margin-top: 2px;
      text-align: left;
    }
    table.sign-p1 .partner-name {
      font-weight: bold;
      margin-bottom: 4px;
    }
    table.sign-p1 .dots {
      margin-top: 52px;
      font-size: 10pt;
      letter-spacing: 1.5px;
    }

    /* —— Halaman 2 —— */
    .lampiran-line {
      margin: 0 0 8px;
      font-size: 11pt;
      text-align: left;
    }
    .table-title {
      text-align: center;
      font-weight: bold;
      font-size: 11pt;
      margin: 6px 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }
    table.lampiran {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5pt;
      margin-bottom: 8px;
      table-layout: fixed;
    }
    table.lampiran th,
    table.lampiran td {
      border: 1px solid #000;
      padding: 4px 5px;
      vertical-align: middle;
    }
    table.lampiran thead th {
      text-align: center;
      font-weight: bold;
      font-size: 9pt;
      text-transform: uppercase;
      background: #fff;
      line-height: 1.25;
    }
    table.lampiran thead .subhead {
      font-size: 8.5pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    table.lampiran td.c { text-align: center; }
    table.lampiran td.spec {
      text-align: left;
      word-wrap: break-word;
    }
    table.lampiran td.no { width: 26px; }
    table.lampiran td.vol { width: 32px; }
    table.lampiran td.sat { width: 52px; }
    table.lampiran td.harga,
    table.lampiran td.jumlah { width: 78px; }
    table.lampiran td.chk { width: 34px; min-height: 20px; }
    table.lampiran tr.total td {
      font-weight: bold;
      text-align: center;
      font-size: 9.5pt;
    }
    table.lampiran tr.total td.total-val {
      text-align: center;
    }
    .terbilang-line {
      margin: 6px 0 18px;
      font-size: 11pt;
    }
    .terbilang-line em {
      font-style: italic;
      font-weight: normal;
    }
    .name-u {
      font-weight: bold;
      text-decoration: underline;
    }

    .sign-area-p2 {
      margin-top: 12px;
      padding-top: 6px;
      font-size: 10.5pt;
    }
    table.sign-p2 {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    table.sign-p2 > tbody > tr > td {
      vertical-align: top;
      padding: 0;
    }
    table.sign-p2 .left {
      width: 52%;
      max-width: 420px;
      padding-right: 12px;
      vertical-align: top;
    }
    table.sign-p2 .right {
      width: 48%;
      padding-left: 0;
      padding-right: 0;
      vertical-align: bottom;
      text-align: right;
    }
    .partner-wrap {
      display: inline-block;
      width: 240px;
      max-width: 100%;
      margin-left: auto;
      margin-right: 0;
      text-align: center;
    }
    table.sign-p2 .fri-head {
      font-weight: bold;
      margin-bottom: 16px;
      font-size: 11pt;
      line-height: 1.3;
    }
    .sig-entry {
      margin-bottom: 20px;
      padding-top: 4px;
    }
    .sig-entry:last-child {
      margin-bottom: 8px;
      padding-top: 4px;
    }
    /* Kolom nama lebar tetap → titik dua & garis ttd sejajar vertikal */
    .sig-main {
      display: grid;
      grid-template-columns: 16px 292px 10px 96px;
      align-items: baseline;
      column-gap: 4px;
      width: 100%;
      max-width: 418px;
      line-height: 1.45;
    }
    .sig-num {
      padding-right: 2px;
    }
    .sig-name-cell {
      padding-right: 2px;
      line-height: 1.35;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .sig-name-cell .name-u {
      white-space: normal;
    }
    .sig-colon {
      text-align: center;
      padding: 0;
    }
    .sig-dots {
      letter-spacing: 1.2px;
      font-size: 10pt;
      white-space: nowrap;
    }
    .sig-entry-compact .sig-main {
      font-size: 9.5pt;
      grid-template-columns: 16px 292px 10px 96px;
    }
    .sig-entry-compact .sig-dots {
      font-size: 9pt;
      letter-spacing: 0.8px;
    }
    .sig-role {
      margin: 8px 0 0 20px;
      font-size: 10pt;
      line-height: 1.45;
    }
    table.partner-inner {
      width: 100%;
      border-collapse: collapse;
      height: 168px;
      min-height: 168px;
      margin: 0 auto;
    }
    table.partner-inner td {
      padding: 0;
      vertical-align: top;
      text-align: center;
    }
    table.partner-inner tr.spacer td {
      height: 100%;
      min-height: 118px;
      vertical-align: bottom;
      padding-top: 12px;
    }
    .partner-head {
      font-weight: bold;
      font-size: 11pt;
      line-height: 1.3;
      padding-top: 0;
      text-align: center;
    }
    .partner-dots-line {
      font-size: 10pt;
      letter-spacing: 1.5px;
      line-height: 1.2;
      padding-bottom: 2px;
      text-align: center;
    }
    .partner-dots-line u {
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .mengetahui {
      text-align: center;
      margin-top: 32px;
      font-size: 11pt;
      line-height: 1.5;
    }
    .mengetahui .mengetahui-pad {
      height: 80px;
      margin: 2px 0 8px;
    }
    .mengetahui .name-u {
      display: inline-block;
      margin: 0 0 4px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="page page-1">
    <div class="header-block">
      <div class="line line-main">BERITA ACARA SERAH TERIMA</div>
      <div class="line line-title">${escapeHtml(titleCaps)}</div>
      <div class="line">${escapeHtml(FRI.toUpperCase())}</div>
      <div class="line">${escapeHtml(UT.toUpperCase())}</div>
    </div>
    <hr class="header-rule" />

    <table class="summary">
      <tr>
        <td class="lbl">Pekerjaan</td>
        <td class="colon">:</td>
        <td class="val">${escapeHtml(titlePekerjaan)}</td>
      </tr>
      <tr>
        <td class="lbl">Spesifikasi</td>
        <td class="colon">:</td>
        <td class="val">${escapeHtml(STATIC.spesifikasiSummary)}</td>
      </tr>
      <tr>
        <td class="lbl">Mitra</td>
        <td class="colon">:</td>
        <td class="val">${escapeHtml(partner)}</td>
      </tr>
      <tr>
        <td class="lbl">Nilai</td>
        <td class="colon">:</td>
        <td class="val">${escapeHtml(totalFormatted)} <span class="nilai-terbilang">(${escapeHtml(terbilang)})</span></td>
      </tr>
    </table>

    <p class="body-intro">
      Kami yang bertandatangan dibawah ini mewakili ${escapeHtml(FRI)} ${escapeHtml(UT)} dan
      <strong>${escapeHtml(partner)}</strong> telah melaksanakan Serah Terima terhadap
      <strong>${escapeHtml(titleNarrative)}</strong> dengan hasil sebagai berikut :
    </p>

    <ol class="bast-list" type="1">
      <li>Serah terima dan dilaksanakan pada tanggal ${escapeHtml(dateStr)}.</li>
      <li>${escapeHtml(STATIC.listItem2)}</li>
    </ol>

    <div class="status-center">${escapeHtml(STATIC.statusLine)}</div>

    <p class="penutup">${escapeHtml(STATIC.penutup)}</p>

    <table class="sign-p1">
      <tr>
        <td class="sign-p1-fri">
          <div class="org">${escapeHtml(UT)}</div>
          <div class="org">${escapeHtml(FRI)}</div>
          <div class="pad"></div>
          <div class="name-u">${escapeHtml(STATIC.signer1Name)}</div>
          <div class="role">${escapeHtml(STATIC.signer1Title)}</div>
        </td>
        <td class="sign-p1-partner">
          <div class="partner-name">${escapeHtml(partner)}</div>
          <div class="pad"></div>
          <div class="dots">................................................</div>
        </td>
      </tr>
    </table>
  </div>

  <div class="page page-2">
    <p class="lampiran-line"><strong>Lampiran</strong> : ${escapeHtml(lampiranLabel)}</p>
    <div class="table-title">Daftar Rincian Spesifikasi Barang</div>

    <table class="lampiran">
      <thead>
        <tr>
          <th rowspan="2" class="no">No</th>
          <th rowspan="2">Spesifikasi<br/>Barang</th>
          <th rowspan="2" class="vol">Vol</th>
          <th rowspan="2" class="sat">Sat</th>
          <th rowspan="2" class="harga">Harga</th>
          <th rowspan="2" class="jumlah">Jumlah</th>
          <th colspan="2">Hasil Serah Terima</th>
        </tr>
        <tr>
          <th class="subhead chk">Sesuai</th>
          <th class="subhead chk">Tidak</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || '<tr><td class="c no">1</td><td class="spec" colspan="7">—</td></tr>'}
        <tr class="total">
          <td colspan="5">TOTAL</td>
          <td class="total-val">${escapeHtml(totalTable)}</td>
          <td class="chk"></td>
          <td class="chk"></td>
        </tr>
      </tbody>
    </table>

    <p class="terbilang-line">Terbilang : <em>${escapeHtml(terbilang)}</em></p>

    <div class="sign-area-p2">
      <table class="sign-p2">
        <tbody>
          <tr>
            <td class="left">
              <div class="fri-head">${escapeHtml(FRI)}</div>
              ${buildSigEntryHtml(1, STATIC.signer1Name, STATIC.signer1Title)}
              ${buildSigEntryHtml(2, staffNamePage2, STATIC.staffTitle, { compact: staffSigCompact })}
            </td>
            <td class="right">
              <div class="partner-wrap">
                <table class="partner-inner">
                  <tr>
                    <td class="partner-head">${escapeHtml(partner)}</td>
                  </tr>
                  <tr class="spacer">
                    <td class="partner-dots-line"><u>............................................</u></td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="mengetahui">
        <div>Mengetahui,</div>
        <div class="mengetahui-pad"></div>
        <div class="name-u">${escapeHtml(STATIC.mengetahuiName)}</div>
        <div>${escapeHtml(STATIC.mengetahuiRole1)}</div>
        <div>${escapeHtml(STATIC.mengetahuiRole2)}</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  return html;
}

export async function renderVendorBastPdf(submission, vendorBundle, signer = {}) {
  const html = buildVendorBastHtml(submission, vendorBundle, signer);
  return renderGenericHtmlToPdf(html, { pageCss: PDF_A4_BERITA_ACARA_PAGE_CSS });
}
