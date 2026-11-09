import { resolveProcurementItemDisplayName } from '../utils/itemDisplayName.js';

/** ISO A4 (210 × 297 mm) — CSS @page for proposal PDF. */
export const PDF_A4_PAGE_CSS = `
  @page {
    size: 210mm 297mm portrait;
    margin: 18mm 16mm;
  }
  html, body {
    width: 210mm;
    max-width: 210mm;
    margin: 0;
    padding: 0;
  }
`;

/** ISO A4 landscape (297 × 210 mm) — proposal keuangan. */
export const PDF_A4_LANDSCAPE_PAGE_CSS = `
  @page {
    size: 297mm 210mm landscape;
    margin: 12mm 14mm;
  }
  html, body {
    width: 297mm;
    max-width: 297mm;
    margin: 0;
    padding: 0;
  }
`;

/** ISO A4 — CSS @page for berita acara handover PDF. */
export const PDF_A4_BERITA_ACARA_PAGE_CSS = `
  @page {
    size: 210mm 297mm portrait;
    margin: 20mm 18mm;
  }
  html, body {
    width: 210mm;
    max-width: 210mm;
    margin: 0;
    padding: 0;
  }
`;

/** Puppeteer: page dimensions from CSS @page (A4); margins defined in CSS only. */
const PUPPETEER_A4_PDF_OPTIONS = {
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
};

/**
 * Proposal PDF — Formulir Pengajuan Inventaris Barang.
 * Bagian dinamis: meta (termasuk Lampiran N lembar dari jumlah halaman PDF), alamat surat (Yth. Wakil Dekan II …),
 * narasi surat dengan purpose tersisip, blok persetujuan (Mengetahui/Hormat Kami/Menyetujui + tanda tangan),
 * dan tabel lampiran item. Satu submission = satu dokumen PDF (HTML → Puppeteer; jumlah halaman dicek via pdf-lib).
 */

/** Judul & narasi baku. `line1`–`line3` / `docSubtitle` kosong: tidak dirender (bisa diisi lewat env jika perlu kop lagi). */
const TPL = {
  line1: process.env.PDF_HEADER_LINE1 || '',
  line2: process.env.PDF_HEADER_LINE2 || '',
  line3: process.env.PDF_HEADER_LINE3 || '',
  docTitle: process.env.PDF_DOC_TITLE || 'PROPOSAL PENGAJUAN INVENTARIS BARANG',
  docSubtitle: process.env.PDF_DOC_SUBTITLE || '',
  signCity: process.env.PDF_SIGN_CITY || 'Bandung',
  attachmentTitle: 'LAMPIRAN I',
  attachmentSubtitle: 'DAFTAR RINCIAN BARANG YANG DIAJUKAN',
  signIntro: 'Persetujuan dan tanda tangan digital berikut diperlukan sebagai bagian dari alur persetujuan pengajuan:',
};

const LAUNCH_TIMEOUT_MS = Number(process.env.PUPPETEER_LAUNCH_TIMEOUT_MS || 120000);
const PDF_PAGE_ITER_MAX = Number(process.env.PDF_PROPOSAL_PAGE_ITER_MAX || 4);

let _pdfBrowserPromise = null;
let _pdfRenderQueue = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueuePdfTask(task) {
  const run = _pdfRenderQueue.then(task, task);
  _pdfRenderQueue = run.catch(() => {});
  return run;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatIdr(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return escapeHtml(String(n ?? ''));
  try {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(x);
  } catch {
    return escapeHtml(String(n));
  }
}

function isInventorySubmissionItem(it) {
  if (!it || typeof it !== 'object') return false;
  const inv = it.inventory_id ?? it.inventoryId ?? it.inventoryid ?? it.inventory;
  return inv != null && String(inv).trim() !== '';
}

function dataUriForSignature(raw) {
  const s = raw ? String(raw).trim() : '';
  if (!s) return '';
  return s.startsWith('data:') ? s : `data:image/png;base64,${s}`;
}

/** Narasi surat: purpose disisipkan di kalimat pertama (HTML aman). */
function buildBodyLetterHtml(purposeText) {
  const inner = escapeHtml(String(purposeText).replace(/\s+/g, ' ').trim() || '—');
  return `<p class="body-letter">Sehubungan dengan kegiatan ${inner}, dengan ini kami mengajukan pengajuan pengadaan barang untuk menunjang kelancaran kegiatan tersebut. Kebutuhan pengadaan barang yang dimaksud terlampir. Demikian surat permohonan ini kami buat. Atas perhatiannya kami ucapkan terimakasih.</p>`;
}

async function countPdfPages(buffer) {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch (e) {
    console.warn('pdfService: countPdfPages failed:', e?.message || e);
    return 2;
  }
}

async function launchPdfBrowser(puppeteer, execPath) {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--no-first-run',
    '--mute-audio',
    '--disable-sync',
    '--disable-translate',
    '--disable-software-rasterizer',
  ];
  return puppeteer.launch({
    executablePath: execPath,
    headless: true,
    timeout: LAUNCH_TIMEOUT_MS,
    protocolTimeout: LAUNCH_TIMEOUT_MS,
    args,
  });
}

/** Reuse one Chromium instance — cold launch per request caused intermittent 500 errors. */
async function getPdfBrowser(puppeteer, execPath) {
  if (_pdfBrowserPromise) {
    try {
      const existing = await _pdfBrowserPromise;
      if (existing && existing.isConnected()) return existing;
    } catch (_) {
      /* relaunch below */
    }
    _pdfBrowserPromise = null;
  }
  _pdfBrowserPromise = launchPdfBrowser(puppeteer, execPath)
    .then((browser) => {
      browser.on('disconnected', () => {
        _pdfBrowserPromise = null;
      });
      return browser;
    })
    .catch((err) => {
      _pdfBrowserPromise = null;
      throw err;
    });
  return _pdfBrowserPromise;
}

async function getPdfBrowserWithRetry(puppeteer, execPath) {
  const maxAttempts = 3;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await getPdfBrowser(puppeteer, execPath);
    } catch (err) {
      lastErr = err;
      _pdfBrowserPromise = null;
      if (attempt < maxAttempts - 1) {
        await sleep(1500 * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

async function renderHtmlToPdfBuffer(html, puppeteer, execPath, pdfOptions = PUPPETEER_A4_PDF_OPTIONS) {
  return enqueuePdfTask(async () => {
    const browser = await getPdfBrowserWithRetry(puppeteer, execPath);
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load', timeout: 120000 });
      return await page.pdf(pdfOptions);
    } finally {
      try {
        await page.close();
      } catch (_) {}
    }
  });
}

/** Pre-launch Chromium at startup so the first proposal download does not cold-start timeout. */
export async function warmupPdfBrowser() {
  const { default: puppeteer } = await import('puppeteer-core').catch(() => ({ default: null }));
  if (!puppeteer) return false;

  const fs = await import('fs');
  const candidates = [];
  if (process.env.PUPPETEER_EXECUTABLE_PATH) candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH);
  candidates.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome-stable', '/usr/bin/chrome');
  const execPath = candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
  if (!execPath) return false;

  return enqueuePdfTask(async () => {
    const browser = await getPdfBrowserWithRetry(puppeteer, execPath);
    const page = await browser.newPage();
    try {
      await page.setContent('<!DOCTYPE html><html><body>warmup</body></html>', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      console.info('pdfService: Chromium warmup complete');
      return true;
    } finally {
      try {
        await page.close();
      } catch (_) {}
    }
  });
}

export async function closePdfBrowser() {
  if (!_pdfBrowserPromise) return;
  try {
    const browser = await _pdfBrowserPromise;
    await browser?.close?.();
  } catch (_) {
    /* ignore */
  }
  _pdfBrowserPromise = null;
}

/** Tanggal pengajuan di dokumen: bukan waktu generate PDF. */
export function submittedDateForPdf(submission) {
  const raw =
    submission?.submitted_at ||
    submission?.applied_at ||
    submission?.diajukan_at ||
    submission?.created_at ||
    null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Blok tanda tangan: opsional lead (Mengetahui, / Hormat Kami,) → gelar jabatan → ttd → nama bergaris → NIP/NIM. */
function signerBlock({ leadLine, roleTitle, name, idLabel, idValue, sigSrc, signedAt }) {
  const nm = escapeHtml(name || '____________________');
  const idv = escapeHtml(idValue || '—');
  const when = signedAt ? escapeHtml(signedAt) : '';
  const img = sigSrc
    ? `<img class="signature-img" src="${sigSrc}" alt="${escapeHtml(roleTitle)}" />`
    : '<div class="signature-line"></div>';
  const lead = leadLine ? `<div class="sign-lead">${escapeHtml(leadLine)}</div>` : '';
  return `
    <td class="sign-cell">
      ${lead}
      <div class="sign-role">${escapeHtml(roleTitle)}</div>
      <div class="sign-pad">${img}</div>
      <div class="sign-name"><span class="sign-name-u">${nm}</span></div>
      <div class="sign-id">${escapeHtml(idLabel)}&nbsp;${idv}</div>
      ${when ? `<div class="sign-when">${when}</div>` : ''}
    </td>`;
}

/**
 * @param {object} submission - procurement_submission row (+ optional _study_program_name, _laboratory_name)
 * @param {object[]} items - procurement_submission_items rows
 * @param {object} signerProfiles - { dosen_pembina, kordas, kaur_lab, kaprodi } each { name, nipnim }
 */
/** Minimum total (IDR) before justification PDF is offered. */
export const JUSTIFICATION_AMOUNT_THRESHOLD_IDR = 1_000_000;

export async function renderSubmissionJustificationPdf(
  submission,
  items = [],
  signerProfiles = {},
  options = {},
) {
  const { renderSubmissionJustificationPdf: renderJustif } = await import(
    './justificationPdf.js'
  );
  return renderJustif(submission, items, signerProfiles, options);
}

export async function renderSubmissionProposalPdf(
  submission,
  items = [],
  signerProfiles = {},
  options = {},
) {
  const docTitle = options.docTitle ?? TPL.docTitle;
  const sp = signerProfiles || {};
  const purposeText = (submission?.purpose ?? submission?.note ?? '').toString();
  const bodyLetterHtml = buildBodyLetterHtml(purposeText);

  const studyName = (submission?._study_program_name || submission?.department || submission?.study_program || '').toString();
  const labName = (submission?._laboratory_name || submission?.lab || '').toString();
  const requester = (submission?.requester_name || '').toString();
  const requesterRole = (submission?.requester_role || '').toString();
  const omitSupervisedLabSigners =
    options.omitSupervisedLabSigners === true
    || requesterRole.toLowerCase() === 'tpa'
    || requesterRole.toLowerCase() === 'laboran';
  const applied = submittedDateForPdf(submission);
  const dateLong = applied
    ? applied.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const dateShort = applied
    ? applied.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  const dosenSig = dataUriForSignature(submission?.dosen_pembina_signature);
  const kordasSig = dataUriForSignature(submission?.kordas_signature);
  const kaurSig = dataUriForSignature(submission?.kaur_lab_signature);
  const kaprodiSig = dataUriForSignature(submission?.kaprodi_signature);

  const dosenSignedAt = submission?.dosen_pembina_signed_at
    ? new Date(submission.dosen_pembina_signed_at).toLocaleString('id-ID')
    : '';
  const kordasSignedAt = submission?.kordas_signed_at
    ? new Date(submission.kordas_signed_at).toLocaleString('id-ID')
    : '';
  const kaurSignedAt = submission?.kaur_lab_signed_at
    ? new Date(submission.kaur_lab_signed_at).toLocaleString('id-ID')
    : '';
  const kaprodiSignedAt = submission?.kaprodi_signed_at
    ? new Date(submission.kaprodi_signed_at).toLocaleString('id-ID')
    : '';

  const dosenP = sp.dosen_pembina || {};
  const kordasP = sp.kordas || {};
  const kaurP = sp.kaur_lab || {};
  const kaprodiP = sp.kaprodi || {};

  const pembinaKoasRow = omitSupervisedLabSigners
    ? ''
    : `<tr>
        ${signerBlock({
          leadLine: 'Mengetahui,',
          roleTitle: 'Pembina Laboratorium',
          name: dosenP.name,
          idLabel: 'NIP',
          idValue: dosenP.nipnim,
          sigSrc: dosenSig,
          signedAt: dosenSignedAt,
        })}
        ${signerBlock({
          leadLine: 'Hormat Kami,',
          roleTitle: 'Koordinator Asisten Lab',
          name: kordasP.name,
          idLabel: 'NIM',
          idValue: kordasP.nipnim,
          sigSrc: kordasSig,
          signedAt: kordasSignedAt,
        })}
      </tr>`;

  const signersTable = `
    <p class="sign-intro">${escapeHtml(TPL.signIntro)}</p>
    <table class="signers-outer">
      ${pembinaKoasRow}
      <tr class="sign-menyetujui-row">
        <td colspan="2" class="sign-menyetujui-cell">Menyetujui,</td>
      </tr>
      <tr>
        ${signerBlock({
          roleTitle: 'Ka. Urusan Laboratorium dan Bengkel',
          name: kaurP.name,
          idLabel: 'NIP',
          idValue: kaurP.nipnim,
          sigSrc: kaurSig,
          signedAt: kaurSignedAt,
        })}
        ${signerBlock({
          roleTitle: 'Kepala Program Studi',
          name: kaprodiP.name,
          idLabel: 'NIP',
          idValue: kaprodiP.nipnim,
          sigSrc: kaprodiSig,
          signedAt: kaprodiSignedAt,
        })}
      </tr>
    </table>`;

  const showKop = [TPL.line1, TPL.line2, TPL.line3].some((s) => String(s || '').trim());
  const kopHtml = showKop
    ? `<div class="kop">
          <div class="l1">${escapeHtml(TPL.line1)}</div>
          <div class="l2">${escapeHtml(TPL.line2)}</div>
          <div class="l3">${escapeHtml(TPL.line3)}</div>
          <div class="line"></div>
        </div>`
    : '';
  const docSubHtml = String(TPL.docSubtitle || '').trim()
    ? `<div class="doc-sub">${escapeHtml(TPL.docSubtitle)}</div>`
    : '';

  const rows = (items || []).map((it, i) => {
    const name = resolveProcurementItemDisplayName(it);
    const spec = (it.specification ?? it.spec ?? '').toString().trim();
    const nameMerk = spec ? `${name} / ${spec}` : name;
    const qty = it.quantity ?? it.qty ?? '';
    const unitPrice = it.unit_price ?? it.price ?? '';
    const priceCell = isInventorySubmissionItem(it) ? 'Dari Stok' : formatIdr(unitPrice);
    const urg = (it.urgency_level ?? it.urgencyLevel ?? it.urgency ?? '').toString().trim();
    const link = (it.purchase_link ?? it.purchaseLink ?? it.link ?? '').toString().trim();
    return `
      <tr>
        <td class="c col-no">${i + 1}</td>
        <td class="col-item">${escapeHtml(nameMerk)}</td>
        <td class="r col-price">${escapeHtml(priceCell)}</td>
        <td class="c col-qty">${escapeHtml(String(qty))}</td>
        <td class="col-urg">${escapeHtml(urg || '—')}</td>
        <td class="col-link">${escapeHtml(link || '—')}</td>
      </tr>`;
  }).join('');

  const buildProposalHtml = (lampiranLembar) => {
    const lampRow =
      lampiranLembar == null
        ? ''
        : `<tr>
            <td class="k">Lampiran</td><td class="colon">:</td><td class="v">${Number(lampiranLembar)} lembar</td>
          </tr>`;
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        ${PDF_A4_PAGE_CSS}
        * { box-sizing: border-box; }
        body {
          font-family: 'Times New Roman', 'Times', serif;
          font-size: 11pt;
          color: #000;
          line-height: 1.45;
        }
        .sheet { max-width: 100%; }
        .kop { text-align: center; margin-bottom: 10px; border-bottom: 3px double #000; padding-bottom: 8px; }
        .kop .l1 { font-size: 9.5pt; font-weight: bold; letter-spacing: 0.3px; }
        .kop .l2 { font-size: 12pt; font-weight: bold; margin-top: 2px; }
        .kop .l3 { font-size: 11pt; font-weight: bold; margin-top: 2px; }
        .kop .line { border-bottom: 1px solid #000; width: 72%; margin: 6px auto 0; }
        .doc-title {
          text-align: center;
          font-size: 12pt;
          font-weight: bold;
          text-decoration: underline;
          text-underline-offset: 3px;
          margin: 14px 0 4px;
          letter-spacing: 0.5px;
        }
        .doc-sub { text-align: center; font-size: 9pt; font-style: italic; color: #222; margin-bottom: 12px; }
        .meta-table { width: 100%; border-collapse: collapse; font-size: 10.5pt; margin-bottom: 12px; table-layout: fixed; }
        .meta-table td { padding: 2px 6px; vertical-align: top; line-height: 1.45; }
        .meta-table .k {
          width: 220px;
          max-width: 220px;
          font-weight: bold;
          white-space: nowrap;
        }
        .meta-table .colon { width: 10px; white-space: nowrap; padding-left: 0; padding-right: 4px; }
        .meta-table .v { width: auto; }
        .letter-to-block {
          margin: 10px 0 12px;
          font-size: 10.5pt;
          line-height: 1.5;
        }
        .letter-to-block .l1 { margin-bottom: 2px; }
        .place-date { margin: 8px 0 14px; font-size: 10.5pt; }
        .place-date .right { float: right; text-align: right; }
        .clear { clear: both; }
        .body-letter {
          text-align: justify;
          margin: 0 0 14px;
          font-size: 10.5pt;
          text-indent: 28px;
          line-height: 1.55;
        }
        .sign-intro { font-size: 10pt; margin: 14px 0 8px; text-align: justify; }
        table.signers-outer { width: 100%; border-collapse: collapse; margin-top: 4px; }
        table.signers-outer td.sign-cell {
          width: 50%;
          border: 1px solid #000;
          vertical-align: top;
          padding: 10px 12px 14px;
          height: 150px;
        }
        .sign-lead { text-align: center; font-size: 10pt; margin-bottom: 8px; font-weight: normal; }
        table.signers-outer td.sign-menyetujui-cell {
          border: 1px solid #000;
          text-align: center;
          font-size: 10pt;
          padding: 8px 12px;
          vertical-align: middle;
        }
        .sign-role { font-weight: bold; text-align: center; font-size: 10pt; margin-bottom: 6px; text-decoration: underline; }
        .sign-pad { min-height: 64px; text-align: center; margin: 4px 0; }
        .signature-img { max-width: 180px; max-height: 60px; object-fit: contain; display: inline-block; }
        .signature-line { border-bottom: 1px solid #000; width: 70%; margin: 24px auto 8px; }
        .sign-name { text-align: center; font-weight: bold; font-size: 10pt; margin-top: 4px; }
        .sign-name-u { text-decoration: underline; text-underline-offset: 2px; }
        .sign-id { text-align: center; font-size: 9.5pt; margin-top: 2px; }
        .sign-when { text-align: center; font-size: 8pt; color: #333; margin-top: 4px; }
        .page-break { page-break-before: always; break-before: page; }
        .attach-head { text-align: center; margin: 8px 0 12px; }
        .attach-head .t1 { font-size: 11pt; font-weight: bold; }
        .attach-head .t2 { font-size: 10.5pt; font-weight: bold; margin-top: 4px; }
        table.items {
          width: 100%;
          border-collapse: collapse;
          font-size: 9.5pt;
          border: 2px solid #000;
        }
        table.items th, table.items td {
          border: 1px solid #000;
          padding: 5px 5px;
          vertical-align: middle;
          text-align: center;
        }
        table.items thead th { background: #e0e0e0; font-weight: bold; }
        table.items .col-no { width: 28px; }
        table.items .col-price { width: 88px; }
        table.items .col-qty { width: 48px; }
        table.items .col-urg { width: 100px; }
        table.items .col-link { word-break: break-all; font-size: 8.5pt; }
      </style>
    </head>
    <body>
      <div class="sheet">
        ${kopHtml}

        <div class="doc-title">${escapeHtml(docTitle)}</div>
        ${docSubHtml}

        <table class="meta-table" aria-label="Identitas pengajuan">
          <tr>
            <td class="k">Hari / tanggal pengajuan</td><td class="colon">:</td><td class="v">${escapeHtml(dateLong)}</td>
          </tr>
          <tr>
            <td class="k">Nama pengaju</td><td class="colon">:</td><td class="v">${escapeHtml(requester || '—')}</td>
          </tr>
          <tr>
            <td class="k">Status / peran pengaju</td><td class="colon">:</td><td class="v">${escapeHtml(requesterRole || '—')}</td>
          </tr>
          <tr>
            <td class="k">Program studi</td><td class="colon">:</td><td class="v">${escapeHtml(studyName || '—')}</td>
          </tr>
          <tr>
            <td class="k">Laboratorium</td><td class="colon">:</td><td class="v">${escapeHtml(labName || '—')}</td>
          </tr>
          ${lampRow}
        </table>

        <div class="letter-to-block" aria-label="Alamat surat">
          <div class="l1">Yth.</div>
          <div>Wakil Dekan II</div>
          <div>Fakultas Rekayasa Industri</div>
          <div>Universitas Telkom</div>
          <div>Di tempat</div>
        </div>

        <div class="place-date">
          <span class="right">${escapeHtml(TPL.signCity)}, ${escapeHtml(dateShort)}</span>
          <div class="clear"></div>
        </div>

        ${bodyLetterHtml}

        ${signersTable}
      </div>

      <div class="page-break"></div>

      <div class="sheet">
        ${showKop ? `<div class="kop" style="margin-bottom: 14px;">
          <div class="l1">${escapeHtml(TPL.line1)}</div>
          <div class="l2">${escapeHtml(TPL.line2)}</div>
          <div class="l3">${escapeHtml(TPL.line3)}</div>
          <div class="line"></div>
        </div>` : ''}
        <div class="attach-head">
          <div class="t1">${escapeHtml(TPL.attachmentTitle)}</div>
          <div class="t2">${escapeHtml(TPL.attachmentSubtitle)}</div>
        </div>

        <table class="items">
          <thead>
            <tr>
              <th class="col-no">No</th>
              <th>Nama barang &amp; merk / spesifikasi</th>
              <th class="col-price">Harga satuan</th>
              <th class="col-qty">Jumlah</th>
              <th class="col-urg">Tingkat urgensi</th>
              <th class="col-link">Link pembelian</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6" style="text-align:center;padding:12px;">Tidak ada item</td></tr>'}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
  };

  const { default: puppeteer } = await import('puppeteer-core').catch((e) => {
    console.error('pdfService: failed to import puppeteer-core:', e && e.message ? e.message : e);
    return { default: null };
  });
  if (!puppeteer) {
    console.warn('pdfService: puppeteer-core not available, returning HTML buffer as fallback');
    const fallbackHtml = buildProposalHtml(2);
    return Buffer.from(fallbackHtml, 'utf8');
  }

  const fs = await import('fs');
  const candidates = [];
  if (process.env.PUPPETEER_EXECUTABLE_PATH) candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH);
  candidates.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome-stable', '/usr/bin/chrome');
  const execPath = candidates.find(p => {
    try { return fs.existsSync(p); } catch (e) { return false; }
  });
  if (!execPath) {
    console.error('pdfService: no Chromium executable found among candidates, returning HTML fallback. Candidates:', candidates);
    return Buffer.from(buildProposalHtml(2), 'utf8');
  }

  // Typical proposal = surat + lampiran (2 halaman). Seed avoids an extra Puppeteer pass.
  let reported = 2;
  let pdfBuf = null;
  for (let iter = 0; iter < PDF_PAGE_ITER_MAX; iter++) {
    const html = buildProposalHtml(reported);
    pdfBuf = await renderHtmlToPdfBuffer(html, puppeteer, execPath);
    const actual = await countPdfPages(pdfBuf);
    if (reported === actual) break;
    reported = actual;
  }
  console.info('pdfService: generated PDF, size=', pdfBuf?.length || 0, 'pages=', reported);
  return pdfBuf;
}

/** Render arbitrary HTML to PDF (shared queue / Chromium instance). */
export async function renderGenericHtmlToPdf(html, options = {}) {
  const { default: puppeteer } = await import('puppeteer-core').catch(() => ({ default: null }));
  if (!puppeteer) {
    return Buffer.from(html, 'utf8');
  }
  const fs = await import('fs');
  const candidates = [];
  if (process.env.PUPPETEER_EXECUTABLE_PATH) candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH);
  candidates.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome-stable', '/usr/bin/chrome');
  const execPath = candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
  if (!execPath) {
    return Buffer.from(html, 'utf8');
  }
  const pdfOptions = options.landscape
    ? { ...PUPPETEER_A4_PDF_OPTIONS, landscape: true }
    : PUPPETEER_A4_PDF_OPTIONS;
  return renderHtmlToPdfBuffer(html, puppeteer, execPath, pdfOptions);
}

export default {
  renderSubmissionProposalPdf,
  renderSubmissionJustificationPdf,
  submittedDateForPdf,
  warmupPdfBrowser,
  closePdfBrowser,
};
