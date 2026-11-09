import { loadFinancialProposalContext } from './financialProposalDataService.js';
import { resolveFinancialProposalJudul } from './financialProposalDataService.js';
import { slugifyLaboratoryName } from './submissionReferenceService.js';

/**
 * Label for header / nama kegiatan: e.g. "BHP DASPRO 3".
 */
export function buildPurchaseSubjectLabel(labName, bhpLabel) {
  let label = String(bhpLabel || '').trim();
  if (!label) {
    const slug = slugifyLaboratoryName(labName).replace(/_/g, ' ').trim();
    label = `BHP ${slug} 1`;
  }
  if (!/^BHP[\s_]/i.test(label)) {
    const slug = slugifyLaboratoryName(label || labName).replace(/_/g, ' ').trim();
    label = `BHP ${slug} 1`;
  }
  if (label.includes('_')) {
    label = label.replace(/^BHP_/i, 'BHP ').replace(/_/g, ' ');
  }
  return label.toUpperCase();
}

/**
 * Context for justification PDF (invoice totals, dates, lab label, purpose).
 */
export async function loadJustificationContext(submission, items = []) {
  const fin = await loadFinancialProposalContext(submission, items);
  const labName =
    submission?._laboratory_name ||
    submission?.lab ||
    submission?.laboratory?.name ||
    'Laboratorium';
  const judul = fin.judul || resolveFinancialProposalJudul(submission, { labName });
  const bhpLabel = String(judul).trim() || `BHP_${labName}`;
  const purchaseSubject = buildPurchaseSubjectLabel(labName, bhpLabel);
  const studyProgram =
    submission?._study_program_name ||
    submission?.study_program?.name ||
    submission?.department ||
    submission?.study_program ||
    '';

  const purpose = (submission?.purpose ?? submission?.note ?? '').toString().trim();

  let totalAmount = Number(fin.totalAnggaran ?? 0);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    totalAmount = Number(submission?.total_price ?? submission?.total_amount ?? 0);
  }

  return {
    bhpLabel,
    purchaseSubject,
    labName: String(labName).trim(),
    studyProgram: String(studyProgram).trim(),
    purpose,
    invoiceDate: fin.invoiceDate,
    totalAmount: Math.round(totalAmount),
    finContext: fin,
  };
}

export default { loadJustificationContext };
