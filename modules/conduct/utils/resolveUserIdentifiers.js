import { userManagementDb } from '../../../config/databases.js';

/**
 * Kumpulkan semua identifier user (user_id + nipnim + profil terkait) untuk filter jadwal.
 * Memetakan JWT gateway UUID ke profil dev lokal yang punya assignment berbeda user_id.
 */
export async function resolveUserIdentifiers(currentUserId, { nipnimHint } = {}) {
  const raw = String(currentUserId ?? '').trim();
  const hint = String(nipnimHint ?? '').trim();
  const identifiers = new Set();

  if (raw) identifiers.add(raw.toLowerCase());
  if (hint && !hint.includes('@')) identifiers.add(hint.toLowerCase());

  const lookupKeys = [...identifiers];
  if (lookupKeys.length === 0) return [];

  const profile = await userManagementDb.query(
    `SELECT user_id, nipnim
     FROM user_profiles
     WHERE deleted_at IS NULL
       AND (
         lower(user_id) = ANY($1::text[])
         OR lower(nipnim) = ANY($1::text[])
       )`,
    [lookupKeys]
  );

  for (const row of profile.rows) {
    if (row.user_id) identifiers.add(String(row.user_id).toLowerCase());
    if (row.nipnim) identifiers.add(String(row.nipnim).toLowerCase());
  }

  const nipnims = profile.rows.map((row) => row.nipnim).filter(Boolean);
  if (nipnims.length > 0) {
    const relatedProfiles = await userManagementDb.query(
      `SELECT user_id, nipnim
       FROM user_profiles
       WHERE deleted_at IS NULL
         AND lower(nipnim) = ANY($1::text[])`,
      [nipnims.map((value) => String(value).toLowerCase())]
    );
    for (const row of relatedProfiles.rows) {
      if (row.user_id) identifiers.add(String(row.user_id).toLowerCase());
      if (row.nipnim) identifiers.add(String(row.nipnim).toLowerCase());
    }
  }

  return [...identifiers];
}
