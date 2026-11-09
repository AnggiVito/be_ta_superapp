/**
 * Surat Justifikasi Pembelian BHP — layout mengikuti templates/justifikasi-reference.pdf
 * (2 halaman A4 portrait: header + meta 1–7 + isi 1–9; halaman 2 tabel paraf).
 */
import { PDF_A4_PAGE_CSS, renderGenericHtmlToPdf } from './pdfService.js';
import { amountToTerbilangRupiah } from '../utils/terbilang.js';
import { loadJustificationContext } from './justificationDataService.js';
import { justificationDigitallyFullySigned } from './justificationSigningService.js';

const FRI_UT = 'FAKULTAS REKAYASA INDUSTRI UNIVERSITAS TELKOM';

/** Teks statis dari template (bukan field dinamis user). */
const STATIC = {
  unitKerja: FRI_UT,
  noDurk: '5121107-001 - Kegiatan Praktikum Prodi',
  noAkun: '5121107 - Beban Pddk Praktikum',
  aspekStrategi:
    'Memenuhi kebutuhan fasilitas/sarana Fakultas Rekayasa Industri Universitas Telkom.',
  aspekBisnis:
    'Meningkatkan kepuasan mahasiswa atas fasilitas yang disediakan oleh fakultas',
  spesifikasiTeknis: 'Terlampir',
  posisiPersediaan: 'Tersedia',
  penutup:
    'Bahwa uraian alasan tersebut diatas dibuat dengan sebenar-benarnya.',
  kaurJabatan: 'Ka. Ur. Laboratorium dan Bengkel',
  wakilDekanName: 'Dr. Amelia Kurniawati, S.T., M.T.',
  wakilDekanNip: '10810036',
  wakilDekanJabatan: 'Wakil Dekan II FRI',
};

const MONTH_SHORT_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Rp. 6.305.800,- */
function formatIdrJustif(n) {
  const v = Math.round(Number(n) || 0);
  const digits = v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp. ${digits},-`;
}

function parseInvoiceDate(raw) {
  if (!raw) return null;
  const s = String(raw).slice(0, 10);
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateLongId(d) {
  if (!d) return '—';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateShortId(d) {
  if (!d) return '—';
  return `${d.getDate()} ${MONTH_SHORT_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function formatMonthYearId(d) {
  if (!d) return '—';
  const month = d.toLocaleDateString('id-ID', { month: 'long' });
  return `${month} ${d.getFullYear()}`;
}

function dataUriForSignature(raw) {
  const s = raw ? String(raw).trim() : '';
  if (!s) return '';
  return s.startsWith('data:') ? s : `data:image/png;base64,${s}`;
}

function signerNikLine(name, nipnim) {
  const n = String(name || '').trim();
  const id = String(nipnim || '').trim();
  if (n && id) return `${n} / ${id}`;
  return n || id || '';
}

function metaRow(num, label, valueHtml) {
  return `
    <tr>
      <td class="meta-num">${num}.</td>
      <td class="meta-label">${escapeHtml(label)}</td>
      <td class="meta-colon">:</td>
      <td class="meta-value">${valueHtml}</td>
    </tr>`;
}

function sectionBlock(num, title, bodyHtml) {
  return `
    <div class="section">
      <div class="section-head"><span class="section-num">${num}.</span> <strong>${escapeHtml(title)}</strong></div>
      <div class="section-body">${bodyHtml}</div>
    </div>`;
}

function purposeParagraphsHtml(text) {
  const raw = String(text || '').trim();
  if (!raw) return '<p class="para para-justify">—</p>';
  const parts = raw.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return '<p class="para para-justify">—</p>';
  return parts
    .map((p) => `<p class="para para-justify">${escapeHtml(p)}</p>`)
    .join('');
}

function signatureCellHtml(signatureDataUri) {
  const img = signatureDataUri
    ? `<img class="sig-img" src="${signatureDataUri}" alt="" />`
    : '';
  return `
    <td class="sig-col">
      <div class="sig-cell-inner">
        ${img}
        <div class="sig-dots">........................................................</div>
      </div>
    </td>`;
}

/**
 * @param {object} submission
 * @param {object[]} items
 * @param {object} signerProfiles
 * @param {object} ctx
 * @param {{ includeSignatures?: boolean, previewRole?: 'kaur'|'kaprodi'|null }} options
 */
export function buildJustificationHtml(
  submission,
  items = [],
  signerProfiles = {},
  ctx = {},
  options = {},
) {
  const includeSignatures = options.includeSignatures === true;
  const previewRole = options.previewRole || null;
  const subject = ctx.purchaseSubject || ctx.bhpLabel || 'LABORATORIUM';
  const headerLine1 = `JUSTIFIKASI PEMBELIAN ${subject}`;
  const namaKegiatan = `JUSTIFIKASI ${subject} ${FRI_UT}`;

  const justMode = String(submission?.justification_signing_mode ?? '')
    .trim()
    .toLowerCase();
  const isWetPrint = justMode === 'wet' && !includeSignatures;

  const total = ctx.totalAmount ?? 0;
  const totalFormatted = formatIdrJustif(total);
  const terbilang = amountToTerbilangRupiah(total);
  const invDate = parseInvoiceDate(ctx.invoiceDate);
  const dateLong = formatDateLongId(invDate);
  const dateShort = formatDateShortId(invDate);
  const monthYear = formatMonthYearId(invDate);
  const budgetYear = invDate ? String(invDate.getFullYear()) : '—';
  const purpose = ctx.purpose || '—';
  const distribusi = invDate
    ? `Digunakan mulai bulan ${monthYear}`
    : 'Digunakan mulai bulan —';

  const studyProgram = ctx.studyProgram || '—';
  const kaurP = signerProfiles.kaur_lab || {};
  const kapP = signerProfiles.kaprodi || {};

  const showKaurSig = includeSignatures || previewRole === 'kaprodi';
  const showKapSig = includeSignatures;

  const kaurSig = showKaurSig
    ? dataUriForSignature(
        submission?.justification_kaur_signature ?? submission?.kaur_lab_signature,
      )
    : '';
  const kapSig = showKapSig
    ? dataUriForSignature(
        submission?.justification_kaprodi_signature ?? submission?.kaprodi_signature,
      )
    : '';

  let kaurName =
    submission?.justification_kaur_signer_name ||
    kaurP.name ||
    submission?.kaur_lab_signer_name ||
    '';
  let kaurNip =
    submission?.justification_kaur_signer_nipnim ||
    kaurP.nipnim ||
    submission?.kaur_lab_signer_nipnim ||
    '';
  let kapName =
    submission?.justification_kaprodi_signer_name ||
    kapP.name ||
    submission?.kaprodi_signer_name ||
    '';
  let kapNip =
    submission?.justification_kaprodi_signer_nipnim ||
    kapP.nipnim ||
    submission?.kaprodi_signer_nipnim ||
    '';
  if (isWetPrint) {
    kaurName =
      submission?._wet_kaur_signer_name ||
      options.wetKaurName ||
      kaurName ||
      '';
    kapName =
      submission?._wet_kaprodi_signer_name ||
      options.wetKaprodiName ||
      kapName ||
      '';
    kaurNip = '';
    kapNip = '';
  }

  const amountBlock = `
    <div class="amount-stack">
      <div>${escapeHtml(totalFormatted)}</div>
      <div class="terbilang-line">${escapeHtml(terbilang)}</div>
    </div>`;

  const anggaranSectionBody = `
    ${escapeHtml(totalFormatted)}
    <span class="terbilang-inline"> (*${escapeHtml(terbilang)}*)</span>`;

  const metaTable = `
    <table class="meta-table">
      ${metaRow(1, 'UNIT KERJA', escapeHtml(STATIC.unitKerja))}
      ${metaRow(2, 'NAMA KEGIATAN', escapeHtml(namaKegiatan))}
      ${metaRow(3, 'JENIS ANGGARAN / TAHUN', escapeHtml(budgetYear))}
      ${metaRow(4, 'NO DURK', escapeHtml(STATIC.noDurk))}
      ${metaRow(5, 'NO AKUN', escapeHtml(STATIC.noAkun))}
      ${metaRow(6, 'TOTAL ANGGARAN', amountBlock)}
      ${metaRow(7, 'SAAT PENGGUNAAN', escapeHtml(dateLong))}
    </table>`;

  const detailSections = `
    ${sectionBlock(1, 'LATAR BELAKANG', purposeParagraphsHtml(purpose))}
    ${sectionBlock(2, 'ASPEK STRATEGI', `<p class="para">${escapeHtml(STATIC.aspekStrategi)}</p>`)}
    ${sectionBlock(3, 'ASPEK BISNIS', `<p class="para">${escapeHtml(STATIC.aspekBisnis)}</p>`)}
    ${sectionBlock(4, 'SPESIFIKASI TEKNIS', `<p class="para">${escapeHtml(STATIC.spesifikasiTeknis)}</p>`)}
    ${sectionBlock(5, 'RENCANA PELAKSANA', `<p class="para">${escapeHtml(dateLong)}</p>`)}
    ${sectionBlock(6, 'DISTRIBUSI PENGGUNAAN', `<p class="para">${escapeHtml(distribusi)}</p>`)}
    ${sectionBlock(7, 'POSISI PERSEDIAAN', `<p class="para">${escapeHtml(STATIC.posisiPersediaan)}</p>`)}
    ${sectionBlock(8, 'ANGGARAN', `<p class="para">${anggaranSectionBody}</p>`)}
    ${sectionBlock(9, 'PENUTUP / PERNYATAAN', `<p class="para">${escapeHtml(STATIC.penutup)}</p>`)}
  `;

  const page1 = `
  <div class="page page-1">
    <header class="doc-header">
      <div class="hdr-line hdr-main">${escapeHtml(headerLine1)}</div>
      <div class="hdr-line">FAKULTAS REKAYASA INDUSTRI</div>
      <div class="hdr-line">UNIVERSITAS TELKOM</div>
    </header>
    <hr class="rule" />
    ${metaTable}
    <hr class="rule" />
    <div class="detail-block">${detailSections}</div>
  </div>`;

  const kaprodiJabatan = studyProgram
    ? `Ka. Prodi ${studyProgram}`
    : 'Ka. Prodi';

  const page2 = `
  <div class="page page-2">
    <table class="sign-table">
      <thead>
        <tr>
          <th class="col-urai">URAIAN</th>
          <th class="col-nama">NAMA / NIK</th>
          <th class="col-jab">JABATAN</th>
          <th class="col-tgl">TANGGAL</th>
          <th class="col-ttd">TANDA TANGAN</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="col-urai">Dibuat oleh :</td>
          <td class="col-nama">${escapeHtml(signerNikLine(kaurName, kaurNip))}</td>
          <td class="col-jab">${escapeHtml(STATIC.kaurJabatan)}</td>
          <td class="col-tgl">${escapeHtml(dateShort)}</td>
          ${signatureCellHtml(kaurSig)}
        </tr>
        <tr>
          <td class="col-urai">Diperiksa oleh :</td>
          <td class="col-nama">${escapeHtml(signerNikLine(kapName, kapNip))}</td>
          <td class="col-jab">${escapeHtml(kaprodiJabatan)}</td>
          <td class="col-tgl">${escapeHtml(dateShort)}</td>
          ${signatureCellHtml(kapSig)}
        </tr>
        <tr>
          <td class="catatan-row" colspan="5">Catatan Anggaran :</td>
        </tr>
        <tr>
          <td class="col-urai">Disetujui oleh :</td>
          <td class="col-nama">${escapeHtml(`${STATIC.wakilDekanName} / ${STATIC.wakilDekanNip}`)}</td>
          <td class="col-jab">${escapeHtml(STATIC.wakilDekanJabatan)}</td>
          <td class="col-tgl">${escapeHtml(dateShort)}</td>
          ${signatureCellHtml('')}
        </tr>
      </tbody>
    </table>
  </div>`;

  const pdfFontFamily = "Calibri, 'Carlito', Arial, Helvetica, sans-serif";
  const pdfFontSize = '11pt';

  const css = `
    ${PDF_A4_PAGE_CSS}
    * { box-sizing: border-box; }
    body {
      font-family: ${pdfFontFamily};
      font-size: ${pdfFontSize};
      color: #000;
      margin: 0;
      padding: 0;
      line-height: 1.35;
    }
    .page {
      page-break-after: always;
      width: 100%;
    }
    .page:last-child { page-break-after: auto; }

    /* —— Halaman 1 —— */
    .doc-header {
      text-align: center;
      font-weight: bold;
      font-size: ${pdfFontSize};
      line-height: 1.3;
      margin: 0 0 10px;
      padding: 0 4px;
    }
    .hdr-line { margin: 1px 0; }
    .hdr-main { font-size: ${pdfFontSize}; }
    hr.rule {
      border: none;
      border-top: 1.5px solid #000;
      margin: 10px 0;
    }
    table.meta-table {
      width: 100%;
      border-collapse: collapse;
      font-size: ${pdfFontSize};
    }
    table.meta-table td {
      vertical-align: top;
      padding: 3px 0;
      line-height: 1.4;
    }
    .meta-num {
      width: 22px;
      font-weight: bold;
      padding-right: 4px;
    }
    .meta-label {
      width: 168px;
      font-weight: bold;
      white-space: nowrap;
    }
    .meta-colon {
      width: 10px;
      padding: 0 4px;
    }
    .meta-value {
      text-align: left;
    }
    .amount-stack .terbilang-line {
      font-style: italic;
      margin-top: 2px;
      font-size: ${pdfFontSize};
    }
    .detail-block {
      margin-top: 4px;
      font-size: ${pdfFontSize};
    }
    .section {
      margin-bottom: 8px;
    }
    .section-head {
      margin-bottom: 2px;
    }
    .section-num { font-weight: bold; }
    .section-body .para {
      margin: 0 0 6px;
      text-align: justify;
      text-justify: inter-word;
      -webkit-text-justify: inter-word;
      padding-left: 14px;
      padding-right: 2px;
      line-height: 1.45;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .section-body .para:last-child { margin-bottom: 0; }
    .section-body .para-justify {
      text-align: justify;
      text-justify: inter-word;
      -webkit-text-justify: inter-word;
    }
    .terbilang-inline { font-style: italic; }

    /* —— Halaman 2: tabel paraf —— */
    .page-2 { padding-top: 0; }
    table.sign-table {
      width: 100%;
      border-collapse: collapse;
      font-size: ${pdfFontSize};
      table-layout: fixed;
    }
    table.sign-table th,
    table.sign-table td {
      border: 1px solid #000;
      padding: 5px 6px;
      vertical-align: top;
    }
    table.sign-table th {
      font-weight: bold;
      text-align: center;
      font-size: ${pdfFontSize};
      padding: 6px 4px;
    }
    .col-urai { width: 14%; }
    .col-nama { width: 28%; }
    .col-jab { width: 26%; text-align: center; }
    .col-tgl { width: 12%; text-align: center; }
    .col-ttd, .sig-col { width: 20%; }
    .catatan-row {
      font-weight: normal;
      padding: 8px 6px;
      min-height: 36px;
    }
    .sig-cell-inner {
      min-height: 72px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: center;
      padding-bottom: 2px;
    }
    .sig-img {
      max-width: 100%;
      max-height: 52px;
      object-fit: contain;
      margin-bottom: 4px;
      flex-shrink: 0;
    }
    .sig-dots {
      width: 100%;
      text-align: center;
      font-size: ${pdfFontSize};
      letter-spacing: 1px;
      line-height: 1;
      overflow: hidden;
      white-space: nowrap;
    }
  `;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <style>${css}</style>
</head>
<body>
  ${page1}
  ${page2}
</body>
</html>`;
}

export async function renderSubmissionJustificationPdf(
  submission,
  items = [],
  signerProfiles = {},
  options = {},
) {
  const wantSigned = options.includeSignatures === true;
  if (wantSigned && !justificationDigitallyFullySigned(submission)) {
    const err = new Error(
      'Signed justification PDF is only available after Kaur Lab and Kaprodi have signed.',
    );
    err.code = 'JUSTIF_NOT_FULLY_SIGNED';
    throw err;
  }

  const ctx = options.context || (await loadJustificationContext(submission, items));
  const html = buildJustificationHtml(submission, items, signerProfiles, ctx, options);
  return renderGenericHtmlToPdf(html);
}

export { loadJustificationContext } from './justificationDataService.js';

export default {
  buildJustificationHtml,
  renderSubmissionJustificationPdf,
  loadJustificationContext,
};
