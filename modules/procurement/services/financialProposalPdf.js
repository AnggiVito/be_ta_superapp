/**
 * Proposal Keuangan — 3 halaman landscape (template proposal ke keuangan).
 */
import {
  PDF_A4_LANDSCAPE_PAGE_CSS,
  renderGenericHtmlToPdf,
} from './pdfService.js';
import { loadFinancialProposalContext } from './financialProposalDataService.js';
import {
  financialProposalDigitallyFullySigned,
  financialProposalKaurSigned,
  financialProposalKaprodiSigned,
} from './financialProposalSigningService.js';

const STATIC = {
  picKegiatan: 'Ekky Novriza Alam S.Kom., M.T.',
  kategoriKegiatan: 'Pembayaran',
  sasaranPage1:
    'Tercapainya kebutuhan sarana di ruang laboratorium FRI untuk mendukung kegiatan akademik praktikum di laboratorium FRI',
  deskripsiTail:
    'untuk mendukung jalannya kegiatan akademik praktikum di Fakultas Rekayasa Industri Universitas Telkom',
  dokumenAdminIsi: 'Rencana Anggaran',
  /** Baris isi dokumen administrasi (1 terisi + sisanya kosong). */
  minDokumenAdminRows: 5,
};

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatIdr(n) {
  const v = Math.round(Number(n) || 0);
  return `Rp ${v.toLocaleString('id-ID')},00`;
}

function formatIdDate(raw) {
  if (!raw) return '';
  const d = new Date(`${String(raw).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return escapeHtml(String(raw));
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function dataUriForSignature(raw) {
  const s = raw ? String(raw).trim() : '';
  if (!s) return '';
  return s.startsWith('data:') ? s : `data:image/png;base64,${s}`;
}

function namaKegiatan(judul) {
  return `Pengajuan pembelian ${judul} untuk sarana laboratorium FRI`;
}

function deskripsiKegiatan(judul) {
  return `Pengajuan ${judul} ${STATIC.deskripsiTail}`;
}

/** Sel tanda tangan (judul kolom di baris <th> terpisah). */
function signBodyHtml({ name, signatureDataUri, showWetPlaceholder }) {
  const sig = signatureDataUri
    ? `<img class="sig-img" src="${signatureDataUri}" alt="" />`
    : (showWetPlaceholder ? '<div class="sig-line"></div>' : '<div class="sig-spacer"></div>');
  return `
    <td class="sign-td">
      <div class="sign-td-stack">
        <div class="sig-box">${sig}</div>
        <div class="sig-name">${escapeHtml(name || '')}</div>
      </div>
    </td>`;
}

/** Baris DOKUMEN ADMINISTRASI — satu grid dengan tpl-sasaran (border menyambung). */
function buildDokumenAdministrasiRowsHtml({ pengusulBody, menyetujuiBody }) {
  const n = STATIC.minDokumenAdminRows;
  const pengusulTd = pengusulBody.replace(
    'class="sign-td"',
    `class="sign-td" colspan="2" rowspan="${n}"`,
  );
  const menyetujuiTd = menyetujuiBody.replace(
    'class="sign-td"',
    `class="sign-td" colspan="2" rowspan="${n}"`,
  );
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const label = i === 0 ? escapeHtml(STATIC.dokumenAdminIsi) : '&nbsp;';
    rows.push(
      `<tr class="dok-row">
        <td class="dok-no"></td>
        <td class="dok-item">${label}</td>
        ${i === 0 ? `${pengusulTd}${menyetujuiTd}` : ''}
      </tr>`,
    );
  }
  return rows.join('');
}

/** Footer halaman 2: TOTAL ANGGARAN + CATATAN (kiri) | PENGUSUL | MENYETUJUI. */
function buildBudgetFooterRowsHtml({ total, pengusulBody, menyetujuiBody }) {
  const signRowSpan = 3;
  const pengusulTd = pengusulBody.replace(
    'class="sign-td"',
    `class="sign-td" colspan="2" rowspan="${signRowSpan}"`,
  );
  const menyetujuiTd = menyetujuiBody.replace(
    'class="sign-td"',
    `class="sign-td" colspan="2" rowspan="${signRowSpan}"`,
  );
  return `
    <tr class="budget-footer-h">
      <th colspan="2">TOTAL ANGGARAN</th>
      <th colspan="2">PENGUSUL</th>
      <th colspan="2">MENYETUJUI</th>
    </tr>
    <tr class="budget-footer-total">
      <td colspan="2" class="tc budget-total-amt">${escapeHtml(total)}</td>
      ${pengusulTd}
      ${menyetujuiTd}
    </tr>
    <tr class="budget-footer-catatan-h">
      <th colspan="2">CATATAN</th>
    </tr>
    <tr class="budget-footer-catatan">
      <td colspan="2" class="catatan-body">&nbsp;</td>
    </tr>`;
}

function activityHeaderHtml({ nama, pic, col4Label, col4Value }) {
  return `
    <colgroup>
      <col class="c-no" />
      <col class="c-nama" />
      <col class="c-pic" />
      <col class="c-kat" />
    </colgroup>
    <tr class="activity-meta-h">
      <th>NO.</th>
      <th>NAMA KEGIATAN</th>
      <th>PIC KEGIATAN</th>
      <th>${escapeHtml(col4Label)}</th>
    </tr>
    <tr class="activity-meta-d">
      <td class="activity-cell">1</td>
      <td class="activity-cell activity-cell-nama">${escapeHtml(nama)}</td>
      <td class="activity-cell">${escapeHtml(pic)}</td>
      <td class="activity-cell">${escapeHtml(col4Value)}</td>
    </tr>`;
}

function budgetRowsHtml(rows) {
  return (rows || [])
    .map((r) => {
      const no = r.no != null ? escapeHtml(String(r.no)) : '';
      const satuan = r.satuan ? escapeHtml(r.satuan) : '-';
      return `<tr>
        <td class="tc">${no}</td>
        <td>${escapeHtml(r.kebutuhan)}</td>
        <td class="tr">${formatIdr(r.harga)}</td>
        <td class="tc">${escapeHtml(String(r.jumlah ?? ''))}</td>
        <td class="tc">${satuan}</td>
        <td class="tr">${formatIdr(r.subtotal)}</td>
      </tr>`;
    })
    .join('');
}

function lampiranRowsHtml(photos) {
  if (!photos?.length) {
    return '<tr><td class="tc">—</td><td colspan="3" class="photo-td muted">—</td></tr>';
  }
  return photos
    .map(
      (p, i) => `
      <tr>
        <td class="tc">${i + 1}</td>
        <td colspan="3" class="photo-td">
          <div class="photo-item-name">${escapeHtml(p.itemName)}</div>
          <img class="photo-img" src="${p.dataUri}" alt="${escapeHtml(p.itemName)}" />
        </td>
      </tr>`,
    )
    .join('');
}

/** Shared typography for financial proposal PDF (HTML → Puppeteer). */
const PDF_FONT_FAMILY = "Calibri, 'Carlito', Arial, Helvetica, sans-serif";
const PDF_FONT_SIZE = '11pt';

const BASE_CSS = `
  * { box-sizing: border-box; }
  body {
    font-family: ${PDF_FONT_FAMILY};
    font-size: ${PDF_FONT_SIZE};
    color: #000;
    margin: 0;
    padding: 0;
  }
  .page { page-break-after: always; width: 100%; }
  .page:last-child { page-break-after: auto; }
  table.tpl {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  table.tpl th,
  table.tpl td {
    border: 1px solid #000;
    padding: 4px 6px;
    vertical-align: middle;
    word-wrap: break-word;
    line-height: 1.2;
  }
  table.tpl th {
    font-weight: bold;
    text-align: center;
    background: #fff;
    font-size: ${PDF_FONT_SIZE};
  }
  table.tpl-4 .c-no { width: 5%; }
  table.tpl-4 .c-nama { width: 44%; }
  table.tpl-4 .c-pic { width: 28%; }
  table.tpl-4 .c-kat { width: 23%; }
  table.tpl-4 tr.activity-meta-h th {
    padding: 4px 6px;
    line-height: 1.2;
    vertical-align: middle;
  }
  table.tpl-4 tr.activity-meta-d td.activity-cell,
  table.tpl-4 tr.deskripsi-d td,
  table.tpl-budget .budget-h,
  table.tpl-budget tr.budget-cols-h th {
    padding: 22px 18px;
    line-height: 1.55;
    vertical-align: middle;
    text-align: center;
    min-height: 62px;
  }
  table.tpl-4 tr.activity-meta-d td.activity-cell-nama {
    text-align: justify;
    text-justify: inter-word;
  }
  table.tpl-4 tr.deskripsi-h th {
    padding: 4px 6px;
    line-height: 1.2;
  }
  table.tpl-sasaran th,
  table.tpl-sasaran td {
    font-size: 10pt;
    line-height: 1.3;
  }
  table.tpl-sasaran .c-dok-no { width: 4%; }
  table.tpl-sasaran .c-dok-item { width: 33%; }
  table.tpl-sasaran .c-ket { width: 14%; }
  table.tpl-sasaran .c-tr { width: 16%; }
  table.tpl-sasaran .c-treal { width: 16%; }
  table.tpl-sasaran .c-cpic { width: 17%; }
  table.tpl-sasaran tr.luaran-row th,
  table.tpl-sasaran tr.luaran-row td {
    font-size: 10pt;
    line-height: 1.35;
    vertical-align: top;
    padding: 7px 8px;
  }
  table.tpl-sasaran tr.luaran-row-h th {
    font-size: 9.5pt;
    line-height: 1.2;
    padding: 6px 5px;
    text-align: center;
    vertical-align: middle;
    word-wrap: break-word;
  }
  table.tpl-sasaran tr.luaran-row-d td {
    min-height: 68px;
  }
  table.tpl-sasaran tr.luaran-row-d td.target-waktu-cell {
    vertical-align: middle;
    text-align: center;
  }
  table.tpl-sasaran td.luaran-body {
    text-align: justify;
    text-justify: inter-word;
    padding: 8px 10px;
    line-height: 1.4;
  }
  table.tpl-sasaran td.keterangan-cell {
    padding: 8px 6px;
  }
  table.tpl-sasaran tr.dokumen-header-row th {
    text-align: center;
    font-weight: bold;
    vertical-align: middle;
    padding: 4px 6px;
  }
  table.tpl-sasaran .sign-td {
    height: 128px;
    padding: 0;
    vertical-align: top;
  }
  table.tpl-sasaran .sign-td .sign-td-stack {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    height: 100%;
    min-height: 124px;
    padding: 6px 10px 8px;
    box-sizing: border-box;
  }
  table.tpl-sasaran .sign-td .sig-box {
    flex: 1 1 auto;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    min-height: 68px;
    margin-bottom: 4px;
  }
  table.tpl-sasaran .sign-td .sig-line {
    width: 120px;
    margin: 0 auto 4px;
    height: 36px;
  }
  table.tpl-sasaran .sign-td .sig-spacer {
    height: 68px;
  }
  table.tpl-sasaran .sign-td .sig-name {
    flex-shrink: 0;
    text-align: center;
    line-height: 1.25;
  }
  table.tpl-budget .c-bno { width: 4%; }
  table.tpl-budget .c-bkeb { width: 36%; }
  table.tpl-budget .c-bharga { width: 14%; }
  table.tpl-budget .c-bjml { width: 8%; }
  table.tpl-budget .c-bsat { width: 10%; }
  table.tpl-budget .c-bsub { width: 18%; }
  table.tpl-budget th {
    font-size: ${PDF_FONT_SIZE};
    padding: 3px 4px;
  }
  table.tpl-budget td {
    font-size: ${PDF_FONT_SIZE};
    padding: 3px 5px;
  }
  table.tpl-budget .budget-h {
    font-size: ${PDF_FONT_SIZE};
    font-weight: bold;
  }
  table.tpl-budget tr.budget-cols-h th {
    font-weight: bold;
  }
  .section-h { font-weight: bold; text-align: left; font-size: ${PDF_FONT_SIZE}; }
  .va-top { vertical-align: top; }
  .tc { text-align: center; }
  .tr { text-align: right; white-space: nowrap; }
  .sign-td {
    text-align: center;
    vertical-align: top;
    padding: 4px 6px 6px;
    height: 95px;
  }
  table.tpl-budget .sign-td {
    padding: 0;
    vertical-align: top;
    height: auto;
  }
  table.tpl-budget .sign-td .sign-td-stack {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    height: 100%;
    min-height: 118px;
    padding: 6px 10px 8px;
    box-sizing: border-box;
  }
  table.tpl-budget .sign-td .sig-box {
    flex: 1 1 auto;
    min-height: 64px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    margin-bottom: 4px;
  }
  table.tpl-budget .sign-td .sig-img { max-height: 68px; max-width: 200px; }
  table.tpl-budget .sign-td .sig-line { width: 180px; margin: 0 auto 4px; height: 36px; }
  table.tpl-budget .sign-td .sig-spacer { height: 64px; }
  table.tpl-budget .sign-td .sig-name {
    flex-shrink: 0;
    text-align: center;
    line-height: 1.25;
  }
  table.tpl-budget tr.budget-footer-h th,
  table.tpl-budget tr.budget-footer-catatan-h th {
    font-weight: bold;
    text-align: center;
    padding: 4px 6px;
    vertical-align: middle;
  }
  table.tpl-budget td.budget-total-amt {
    font-weight: bold;
    text-align: center;
    padding: 6px 8px;
    vertical-align: middle;
    white-space: nowrap;
  }
  table.tpl-budget td.catatan-body {
    height: 78px;
    vertical-align: top;
    padding: 6px 8px;
  }
  .sig-box {
    min-height: 58px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sig-img { max-height: 58px; max-width: 140px; }
  .sig-line {
    width: 130px;
    border-bottom: 1px solid #000;
    height: 40px;
    margin: 10px auto 6px;
  }
  .sig-spacer { height: 58px; }
  .sig-name { font-size: ${PDF_FONT_SIZE}; line-height: 1.2; }
  table.tpl-sasaran tr.dok-row td.dok-no {
    padding: 2px 4px;
  }
  table.tpl-sasaran tr.dok-row td.dok-item {
    text-align: left;
    padding-left: 10px;
    vertical-align: middle;
  }
  table.tpl-sasaran tr.dok-row td {
    height: 26px;
    padding: 3px 6px;
    line-height: 1.25;
  }
  .sign-td-stack {
    width: 100%;
  }
  table.tpl-lampiran .c-lno { width: 5%; }
  table.tpl-lampiran .c-lfoto { width: 95%; }
  .photo-td { text-align: center; vertical-align: middle; padding: 10px; }
  .photo-item-name { font-weight: bold; margin-bottom: 8px; font-size: ${PDF_FONT_SIZE}; }
  .photo-img { max-width: 90%; max-height: 210px; object-fit: contain; }
  .muted { color: #666; font-style: italic; }
`;

/**
 * @param {object} submission
 * @param {object[]} items
 * @param {object} ctx
 * @param {{ includeSignatures?: boolean, previewRole?: 'kaur'|'kaprodi'|null }} options
 */
export function buildFinancialProposalHtml(submission, items = [], ctx = {}, options = {}) {
  const includeSignatures = options.includeSignatures === true;
  const previewRole = options.previewRole || null;
  const judul = ctx.judul || 'BHP_lab';
  const nama = namaKegiatan(judul);
  const deskripsi = deskripsiKegiatan(judul);
  const tgl = formatIdDate(ctx.invoiceDate);
  const pic = STATIC.picKegiatan;
  const total = formatIdr(ctx.totalAnggaran);

  const finMode = String(submission?.financial_proposal_signing_mode ?? '')
    .trim()
    .toLowerCase();
  const isWetPrint = finMode === 'wet' && !includeSignatures;

  const showKaurSig = includeSignatures || previewRole === 'kaprodi';
  const showKapSig = includeSignatures;

  const kaurSig = showKaurSig
    ? dataUriForSignature(submission?.financial_proposal_kaur_signature)
    : '';
  const kapSig = showKapSig
    ? dataUriForSignature(submission?.financial_proposal_kaprodi_signature)
    : '';

  let kaurName = '';
  let kapName = '';
  if (includeSignatures || previewRole === 'kaprodi') {
    kaurName =
      submission?.financial_proposal_kaur_signer_name ||
      submission?.kaur_lab_signer_name ||
      '';
  }
  if (includeSignatures) {
    kapName = submission?.financial_proposal_kaprodi_signer_name || '';
  }
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
  }

  const pengusulBody = signBodyHtml({
    name: kaurName,
    signatureDataUri: kaurSig,
    showWetPlaceholder: !kaurSig,
  });
  const menyetujuiBody = signBodyHtml({
    name: kapName,
    signatureDataUri: kapSig,
    showWetPlaceholder: !kapSig,
  });

  const page1 = `
  <div class="page">
    <table class="tpl tpl-4">
      ${activityHeaderHtml({
        nama,
        pic,
        col4Label: 'KATEGORI KEGIATAN',
        col4Value: STATIC.kategoriKegiatan,
      })}
      <tr class="deskripsi-h">
        <th colspan="4" class="section-h">DESKRIPSI KEGIATAN</th>
      </tr>
      <tr class="deskripsi-d">
        <td colspan="4" class="va-top">${escapeHtml(deskripsi)}</td>
      </tr>
    </table>
    <table class="tpl tpl-sasaran" style="margin-top:-1px">
      <colgroup>
        <col class="c-dok-no" />
        <col class="c-dok-item" />
        <col class="c-ket" />
        <col class="c-tr" />
        <col class="c-treal" />
        <col class="c-cpic" />
      </colgroup>
      <tr class="luaran-row luaran-row-h">
        <th colspan="2" class="va-top">LUARAN KEGIATAN</th>
        <th>KETERANGAN</th>
        <th>TARGET WAKTU RENCANA</th>
        <th>TARGET WAKTU REALISASI</th>
        <th>CATATAN PIC</th>
      </tr>
      <tr class="luaran-row luaran-row-d">
        <td colspan="2" class="va-top luaran-body">${escapeHtml(STATIC.sasaranPage1)}</td>
        <td class="keterangan-cell"></td>
        <td class="target-waktu-cell">${tgl}</td>
        <td class="target-waktu-cell">${tgl}</td>
        <td></td>
      </tr>
      <tr class="dokumen-header-row">
        <th colspan="2">DOKUMEN ADMINISTRASI</th>
        <th colspan="2">PENGUSUL</th>
        <th colspan="2">MENYETUJUI</th>
      </tr>
      ${buildDokumenAdministrasiRowsHtml({ pengusulBody, menyetujuiBody })}
    </table>
  </div>`;

  const page2 = `
  <div class="page">
    <table class="tpl tpl-4">
      ${activityHeaderHtml({
        nama,
        pic,
        col4Label: 'KATEGORI KEGIATAN',
        col4Value: STATIC.kategoriKegiatan,
      })}
    </table>
    <table class="tpl tpl-budget" style="margin-top:-1px">
      <colgroup>
        <col class="c-bno" />
        <col class="c-bkeb" />
        <col class="c-bharga" />
        <col class="c-bjml" />
        <col class="c-bsat" />
        <col class="c-bsub" />
      </colgroup>
      <tr>
        <th colspan="6" class="budget-h">RINCIAN ANGGARAN</th>
      </tr>
      <tr class="budget-cols-h">
        <th>No</th>
        <th>Kebutuhan</th>
        <th>Harga</th>
        <th>Jumlah</th>
        <th>Satuan</th>
        <th>Sub Total</th>
      </tr>
      ${budgetRowsHtml(ctx.budgetRows)}
      ${buildBudgetFooterRowsHtml({ total, pengusulBody, menyetujuiBody })}
    </table>
  </div>`;

  const page3 = `
  <div class="page">
    <table class="tpl tpl-4">
      ${activityHeaderHtml({
        nama,
        pic,
        col4Label: 'KATEGORI KEGIATAN',
        col4Value: STATIC.kategoriKegiatan,
      })}
      <tr>
        <th colspan="4" class="section-h">LAMPIRAN</th>
      </tr>
    </table>
    <table class="tpl tpl-4 tpl-lampiran" style="margin-top:-1px">
      <colgroup>
        <col class="c-no" />
        <col class="c-nama" />
        <col class="c-pic" />
        <col class="c-kat" />
      </colgroup>
      <tr>
        <th>No.</th>
        <th colspan="3">Foto Produk</th>
      </tr>
      ${lampiranRowsHtml(ctx.productPhotos)}
    </table>
  </div>`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <style>
    ${PDF_A4_LANDSCAPE_PAGE_CSS}
    ${BASE_CSS}
  </style>
</head>
<body>
  ${page1}
  ${page2}
  ${page3}
</body>
</html>`;
}

export async function renderSubmissionFinancialProposalPdf(submission, items = [], options = {}) {
  const wantSigned = options.includeSignatures === true;
  if (wantSigned && !financialProposalDigitallyFullySigned(submission)) {
    const err = new Error(
      'Signed PDF is only available after Kaur Lab and Kaprodi have signed the financial proposal.',
    );
    err.code = 'FIN_PROP_NOT_FULLY_SIGNED';
    throw err;
  }

  const ctx = options.context || await loadFinancialProposalContext(submission, items);
  const html = buildFinancialProposalHtml(submission, items, ctx, options);
  return renderGenericHtmlToPdf(html, { landscape: true });
}

export { loadFinancialProposalContext } from './financialProposalDataService.js';

export default {
  buildFinancialProposalHtml,
  renderSubmissionFinancialProposalPdf,
  loadFinancialProposalContext,
  financialProposalKaurSigned,
  financialProposalKaprodiSigned,
};
