/**
 * Berita Acara / Bukti Penerimaan Barang PDF (non-blockchain handover).
 */
import { renderGenericHtmlToPdf, PDF_A4_BERITA_ACARA_PAGE_CSS } from './pdfService.js';
import { resolveProcurementItemDisplayName } from '../utils/itemDisplayName.js';

const SIGN_CITY = process.env.PDF_SIGN_CITY || 'Bandung';
const HEADER_LINE1 = process.env.PDF_HEADER_LINE1 || '';
const HEADER_LINE2 = process.env.PDF_HEADER_LINE2 || '';
const HEADER_LINE3 = process.env.PDF_HEADER_LINE3 || '';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dataUriForSignature(raw) {
  const s = raw ? String(raw).trim() : '';
  if (!s) return '';
  return s.startsWith('data:') ? s : `data:image/png;base64,${s}`;
}

/** Earliest handover signature timestamp (document date). */
export function firstHandoverSignatureDate(submission) {
  const candidates = [];
  for (const key of ['tpa_handover_signed_at', 'requester_handover_signed_at']) {
    const raw = submission?.[key];
    if (!raw) continue;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) candidates.push(d);
  }
  if (!candidates.length) return null;
  return new Date(Math.min(...candidates.map((d) => d.getTime())));
}

function partyCell({ partyTitle, roleHint, sigSrc, name, idLabel, idValue }) {
  const nm = escapeHtml(name || '____________________');
  const idv = escapeHtml(idValue || '—');
  const sigPad = sigSrc
    ? `<motion class="sign-pad"><img class="signature-img" src="${sigSrc}" alt="" /></motion>`
    : '<div class="sign-pad"><div class="signature-line"></div></div>';
  const sigPadHtml = sigPad.startsWith('<motion')
    ? sigPad.replace('<motion class="sign-pad">', '<div class="sign-pad">').replace('</motion>', '</motion>'.replace('motion', 'div'))
    : sigPad;
  const sigPadClean = sigSrc
    ? `<div class="sign-pad"><img class="signature-img" src="${sigSrc}" alt="" /></div>`
    : '<motion class="sign-pad"><div class="signature-line"></div></div>';
  const sigFinal = sigSrc
    ? `<div class="sign-pad"><img class="signature-img" src="${sigSrc}" alt="" /></div>`
    : '<div class="sign-pad"><div class="signature-line"></div></div>';
  return `
    <td class="party-cell">
      <div class="party-title">${escapeHtml(partyTitle)}</div>
      <div class="party-role">${escapeHtml(roleHint)}</div>
      ${sigFinal}
      <div class="party-name">( ${nm} )</div>
      <div class="party-id">${escapeHtml(idLabel)} : ${idv}</div>
    </td>`;
}

export async function renderHandoverBeritaAcaraPdf(submission, items = []) {
  const signDate = firstHandoverSignatureDate(submission) || new Date();
  const dateLong = signDate.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const dateShort = signDate.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const labName = (
    submission?._laboratory_name ||
    submission?.laboratory_name ||
    submission?.lab ||
    ''
  ).toString();
  const requesterName = (
    submission?.requester_handover_signer_name ||
    submission?.requester_name ||
    ''
  ).toString();
  const requesterNim = (submission?.requester_handover_signer_nipnim || '').toString();
  const tpaName = (submission?.tpa_handover_signer_name || '').toString();
  const tpaNip = (submission?.tpa_handover_signer_nipnim || '').toString();
  const tpaSig = dataUriForSignature(submission?.tpa_handover_signature);
  const reqSig = dataUriForSignature(submission?.requester_handover_signature);

  const itemRows = (items || [])
    .map((it, i) => {
      const barang = resolveProcurementItemDisplayName(it);
      const qty = it.quantity ?? it.qty ?? '—';
      const satuan = (it.unit ?? it.unit_name ?? it.satuan ?? '').toString().trim() || '—';
      const ketRaw =
        it.berita_acara_keterangan ??
        it.beritaAcaraKeterangan ??
        it.handover_keterangan ??
        '';
      const ket = String(ketRaw).trim() || '—';
      return `<tr>
        <td class="c">${i + 1}</td>
        <td>${escapeHtml(barang)}</td>
        <td class="c">${escapeHtml(String(qty))}</td>
        <td class="c">${escapeHtml(satuan)}</td>
        <td>${escapeHtml(ket)}</td>
      </tr>`;
    })
    .join('');

  const showKop = [HEADER_LINE1, HEADER_LINE2, HEADER_LINE3].some((s) => String(s || '').trim());
  const kopHtml = showKop
    ? `<div class="kop">
        <div class="l1">${escapeHtml(HEADER_LINE1)}</div>
        <div class="l2">${escapeHtml(HEADER_LINE2)}</div>
        <div class="l3">${escapeHtml(HEADER_LINE3)}</div>
        <div class="line"></div>
      </div>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    ${PDF_A4_BERITA_ACARA_PAGE_CSS}
    body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #000; line-height: 1.5; }
    .kop { text-align: center; margin-bottom: 12px; border-bottom: 3px double #000; padding-bottom: 8px; }
    .kop .l1 { font-size: 9.5pt; font-weight: bold; }
    .kop .l2 { font-size: 12pt; font-weight: bold; margin-top: 2px; }
    .kop .l3 { font-size: 11pt; font-weight: bold; margin-top: 2px; }
    .kop .line { border-bottom: 1px solid #000; width: 72%; margin: 6px auto 0; }
    .doc-title { text-align: center; font-weight: bold; font-size: 12pt; text-decoration: underline; margin: 16px 0 4px; }
    .doc-subtitle { text-align: center; font-weight: bold; font-size: 11pt; margin-bottom: 14px; }
    .intro { text-align: justify; margin: 0 0 14px; text-indent: 32px; }
    .section-title { font-weight: bold; margin: 12px 0 6px; }
    .data-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10.5pt; }
    .data-table td { padding: 4px 8px; vertical-align: top; }
    .data-table .lbl { width: 130px; }
    .data-table .colon { width: 14px; }
    table.items { width: 100%; border-collapse: collapse; font-size: 10pt; margin: 8px 0 16px; border: 1px solid #000; }
    table.items th, table.items td { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
    table.items thead th { background: #e8e8e8; text-align: center; font-weight: bold; }
    table.items td.c { text-align: center; }
    .closing { text-align: justify; margin: 12px 0; text-indent: 32px; }
    .place-date { margin: 20px 0 24px; text-align: right; }
    table.parties { width: 100%; border-collapse: collapse; margin-top: 8px; }
    table.parties td.party-cell { width: 50%; vertical-align: top; padding: 8px 12px; text-align: center; }
    .party-title { font-weight: bold; margin-bottom: 4px; }
    .party-role { font-size: 10pt; margin-bottom: 8px; font-style: italic; }
    .sign-pad { min-height: 70px; margin: 8px 0; }
    .signature-img { max-width: 200px; max-height: 65px; object-fit: contain; }
    .signature-line { border-bottom: 1px solid #000; width: 65%; margin: 28px auto 10px; }
    .party-name { font-weight: bold; margin-top: 6px; }
    .party-id { font-size: 10pt; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="sheet">
    ${kopHtml}
    <div class="doc-title">BERITA ACARA</div>
    <div class="doc-subtitle">BUKTI PENERIMAAN BARANG</div>

    <p class="intro">Pada hari ini, <strong>${escapeHtml(dateLong)}</strong>, telah dilaksanakan serah terima dan penerimaan barang dengan data sebagai berikut:</p>

    <div class="section-title">1. Data Pemberi Barang</div>
    <table class="data-table">
      <tr><td class="lbl">Jabatan Unit</td><td class="colon">:</td><td>Laboran</td></tr>
      <tr><td class="lbl">Nama</td><td class="colon">:</td><td>${escapeHtml(tpaName || '—')}</td></tr>
      <tr><td class="lbl">NIP</td><td class="colon">:</td><td>${escapeHtml(tpaNip || '—')}</td></tr>
    </table>

    <div class="section-title">2. Data Penerima</div>
    <table class="data-table">
      <tr><td class="lbl">Laboratorium</td><td class="colon">:</td><td>${escapeHtml(labName || '—')}</td></tr>
      <tr><td class="lbl">Nama</td><td class="colon">:</td><td>${escapeHtml(requesterName || '—')}</td></tr>
      <tr><td class="lbl">NIM</td><td class="colon">:</td><td>${escapeHtml(requesterNim || '—')}</td></tr>
    </table>

    <div class="section-title">3. Data Barang</div>
    <table class="items">
      <thead>
        <tr>
          <th style="width:36px">No</th>
          <th>Barang</th>
          <th style="width:72px">Jumlah</th>
          <th style="width:72px">Satuan</th>
          <th style="width:120px">Keterangan</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || '<tr><td class="c">1</td><td colspan="4">—</td></tr>'}
      </tbody>
    </table>

    <p class="closing"><strong>PIHAK KEDUA</strong> tersebut telah menerima barang sesuai dengan data barang yang diberikan oleh <strong>PIHAK PERTAMA</strong> berdasarkan aturan Fakultas Rekayasa Industri mengenai Pengajuan dan Penerimaan barang inventaris dan barang habis pakai (BHP). Barang tersebut telah diterima dalam keadaan baik. Demikian Berita Acara ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.</p>

    <div class="place-date">${escapeHtml(SIGN_CITY)}, ${escapeHtml(dateShort)}</div>

    <table class="parties">
      <tr>
        ${partyCell({
          partyTitle: 'PIHAK PERTAMA,',
          roleHint: 'Pemberi Barang (Laboran)',
          sigSrc: tpaSig,
          name: tpaName,
          idLabel: 'NIP',
          idValue: tpaNip,
        })}
        ${partyCell({
          partyTitle: 'PIHAK KEDUA,',
          roleHint: 'Penerima Barang',
          sigSrc: reqSig,
          name: requesterName,
          idLabel: 'NIM',
          idValue: requesterNim,
        })}
      </tr>
    </table>
  </div>
</body>
</html>`;

  return renderGenericHtmlToPdf(html);
}
