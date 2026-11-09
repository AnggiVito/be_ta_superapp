import { procurementDb, userManagementDb } from '../../../config/databases.js';
import { canonicalStudyProgramId } from './financialProposalSigningService.js';

const KAUR_ROLES = ['kaur_lab', 'kaur'];

async function profileNameByUserId(userId) {
  if (!userId) return '';
  const { rows } = await userManagementDb.query(
    `SELECT name FROM user_profiles
     WHERE user_id = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [String(userId)],
  );
  return String(rows[0]?.name ?? '').trim();
}

/** Active Kaur Lab user display name (faculty-wide). */
export async function resolveKaurLabSignerDisplayName() {
  const { rows } = await userManagementDb.query(
    `SELECT up.name, ur.role
     FROM user_roles ur
     JOIN user_profiles up ON up.user_id = ur.user_id AND up.deleted_at IS NULL
     WHERE ur.deleted_at IS NULL
       AND ur.is_active = true
       AND ur.role = ANY($1::text[])
       AND up.name IS NOT NULL AND trim(up.name) <> ''
     ORDER BY CASE ur.role WHEN 'kaur_lab' THEN 0 ELSE 1 END, ur.created_at ASC
     LIMIT 1`,
    [KAUR_ROLES],
  );
  return String(rows[0]?.name ?? '').trim();
}

/** Kaprodi display name for a submission study program. */
export async function resolveKaprodiSignerDisplayName(studyProgramIdRaw) {
  const spId = await canonicalStudyProgramId(studyProgramIdRaw);

  if (spId) {
    const { rows: hist } = await procurementDb.query(
      `SELECT kaprodi_signer_name, kaprodi_signed_by
       FROM procurement_submission
       WHERE study_program_id::text = $1::text
         AND (
           (kaprodi_signer_name IS NOT NULL AND trim(kaprodi_signer_name) <> '')
           OR kaprodi_signed_by IS NOT NULL
         )
       ORDER BY kaprodi_signed_at DESC NULLS LAST, updated_at DESC
       LIMIT 1`,
      [String(spId)],
    );
    if (hist[0]?.kaprodi_signer_name) {
      return String(hist[0].kaprodi_signer_name).trim();
    }
    const fromUser = await profileNameByUserId(hist[0]?.kaprodi_signed_by);
    if (fromUser) return fromUser;

    const { rows: finHist } = await procurementDb.query(
      `SELECT financial_proposal_kaprodi_signer_name AS name
       FROM procurement_submission
       WHERE study_program_id::text = $1::text
         AND financial_proposal_kaprodi_signer_name IS NOT NULL
         AND trim(financial_proposal_kaprodi_signer_name) <> ''
       ORDER BY financial_proposal_kaprodi_signed_at DESC NULLS LAST
       LIMIT 1`,
      [String(spId)],
    );
    if (finHist[0]?.name) return String(finHist[0].name).trim();
  }

  const { rows: kaprodiRows } = await userManagementDb.query(
    `SELECT ur.user_id, up.name
     FROM user_roles ur
     LEFT JOIN user_profiles up ON up.user_id = ur.user_id AND up.deleted_at IS NULL
     WHERE ur.deleted_at IS NULL AND ur.is_active = true AND ur.role = 'kaprodi'
     ORDER BY up.name NULLS LAST, ur.created_at ASC`,
  );

  if (kaprodiRows.length === 1) {
    const only = String(kaprodiRows[0]?.name ?? '').trim();
    if (only) return only;
  }

  for (const row of kaprodiRows) {
    const name = String(row?.name ?? '').trim();
    if (name) return name;
  }

  return '';
}

export async function resolveWetSignaturePlaceholderNames(submission) {
  const spId =
    submission?.study_program_id ||
    submission?.studyProgramId ||
    null;

  const [kaurName, kaprodiName] = await Promise.all([
    resolveKaurLabSignerDisplayName(),
    resolveKaprodiSignerDisplayName(spId),
  ]);

  return { kaurName, kaprodiName };
}

export default {
  resolveKaurLabSignerDisplayName,
  resolveKaprodiSignerDisplayName,
  resolveWetSignaturePlaceholderNames,
};
