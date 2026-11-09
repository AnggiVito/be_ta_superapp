/**
 * Profile Service
 * Business logic untuk user profile management
 */

import * as profileModel from '../models/profileModel.js';
import * as roleModel from '../models/roleModel.js';
import { logger } from '../../../core/utils/logger.js';
import { displayNameFromJwtPayload, nipOrNimFromJwtPayload } from '../../../core/utils/jwtIdentityFromPayload.js';

/**
 * Get user profile dengan data dari JWT
 * Auto-sync name dan identifier dari JWT jika profile belum ada atau field masih kosong
 */
export async function getUserProfile(userId, jwtUserData = null) {
  try {
    let profile = await profileModel.getUserProfile(userId);
    
    // NIP / NIM from JWT (not username)
    const identifierFromJWT = nipOrNimFromJwtPayload(jwtUserData) || null;
    
    // Auto-sync name dan nipnim dari JWT jika:
    // 1. Profile belum ada, atau
    // 2. Profile ada tapi name/nipnim masih kosong/null
    const needsUpdate = jwtUserData && (!profile || !profile.name || (!profile.nipnim && identifierFromJWT));
    
    if (needsUpdate) {
      const updateData = {};
      
      // Sync name jika belum ada (nama lengkap dari JWT, bukan username sebagai prioritas utama)
      const nameFromJwt = displayNameFromJwtPayload(jwtUserData);
      if (nameFromJwt && (!profile || !profile.name)) {
        updateData.name = nameFromJwt;
        logger.info('Auto-syncing name from JWT:', { userId, name: updateData.name });
      }
      
      // Sync nipnim jika belum ada tapi ada di JWT
      if (identifierFromJWT && (!profile || !profile.nipnim)) {
        updateData.nipnim = identifierFromJWT;
        logger.info('Auto-syncing nipnim from JWT:', { userId, nipnim: updateData.nipnim });
      }
      
      if (Object.keys(updateData).length > 0) {
        profile = await profileModel.upsertUserProfile(userId, updateData);
      }
    }
    
    return profile;
  } catch (error) {
    logger.error('Error in getUserProfile service:', error);
    throw error;
  }
}

/**
 * Combine user data from JWT with profile data
 * @deprecated Use combineUserDataFromProfile instead for getting other users' profiles
 * This function is kept for backward compatibility when getting own profile
 */
export function combineUserData(jwtUserData, profileData) {
  // Normalize name field from JWT - get name and map to full_name in response
  // Ensure full_name is always present in response
  const fullName = jwtUserData?.name || null;
  
  // Extract nipnim from profile data (NIM for students, NIP for lecturers/staff)
  const nipnim = profileData?.nipnim || null;
  
  return {
    ...jwtUserData, // Data dari AUTH GATEWAY (username, email, name, dll)
    full_name: fullName, // Ensure full_name is always present (mapped from name)
    nipnim: nipnim, // NIM (for students) or NIP (for lecturers/staff)
    profile: profileData || null, // Data tambahan (TTD, no rekening)
  };
}

/**
 * Combine user data from profile data (for getting other users' profiles)
 * Uses userId from parameter and profile data as primary source
 * This ensures the response returns data for the requested user, not the logged-in user
 */
export function combineUserDataFromProfile(userId, profileData, jwtUserData = null) {
  // Use profile data as primary source for name and identifier
  // If profile doesn't exist or name is missing, fallback to JWT (only if it's the same user)
  const isOwnProfile = jwtUserData && String(jwtUserData.id || jwtUserData.user_id) === String(userId);
  
  // Get name from profile first, fallback to JWT only if it's own profile
  const fullName = profileData?.name || (isOwnProfile ? jwtUserData?.name : null) || null;
  
  // NIP/NIM: sama seperti contoh GET profile JSON — utama `data.nipnim` / alias `data.identifier` dari user_profiles (+ kolom legacy `identifier`)
  let nipnim = profileData != null ? (profileData.nipnim ?? profileData.identifier ?? null) : null;
  if (nipnim == null || String(nipnim).trim() === '') {
    // Profil milik pemanggil: isi dari JWT jika DB masih kosong (contoh IdP kirim nip di token, sinkron DB belum jalan)
    if (isOwnProfile && jwtUserData) {
      const fromJwt = nipOrNimFromJwtPayload(jwtUserData) || null;
      if (fromJwt) nipnim = fromJwt;
    }
  }
  
  // Get email and username from JWT only if it's own profile, otherwise null
  // For other users, we don't have email/username in local database
  const email = isOwnProfile ? jwtUserData?.email : null;
  const username = isOwnProfile ? jwtUserData?.username : null;
  
  const flags = deriveAccessCredentialFlags(profileData);
  const profileForView = sanitizeProfileForView(profileData);

  return {
    id: userId, // CRITICAL: Use userId from parameter, not from JWT
    user_id: userId, // Also include as user_id for consistency
    username: username,
    email: email,
    full_name: fullName,
    name: fullName, // Also include as name for consistency
    identifier: nipnim, // Alias nipnim — konsisten dengan response JSON dokumentasi API
    nipnim: nipnim, // NIM (for students) or NIP (for lecturers/staff)
    procurement_supervised_lab_id: profileData?.procurement_supervised_lab_id ?? null,
    kode_asisten_praktikum: profileData?.kode_asisten_praktikum ?? null,
    has_fingerprint: flags.has_fingerprint,
    has_kartu_akses: flags.has_kartu_akses,
    profile: profileForView, // Tanpa nilai fingerprint/kartu (hanya untuk view)
  };
}

/** Apakah kolom text punya nilai (untuk derive boolean di response view) */
export function hasTextValue(value) {
  return value != null && String(value).trim() !== '';
}

/** Hitung boolean dari kolom TEXT di DB */
export function deriveAccessCredentialFlags(profileData) {
  return {
    has_fingerprint: hasTextValue(profileData?.fingerprint),
    has_kartu_akses: hasTextValue(profileData?.kartu_akses_number),
  };
}

/** Hilangkan nilai sensitif dari objek profile di response view */
export function sanitizeProfileForView(profileData) {
  if (!profileData) return null;
  const {
    fingerprint,
    kartu_akses_number,
    has_fingerprint,
    has_kartu_akses,
    access_credentials_updated_at,
    access_credentials_updated_by,
    ...safe
  } = profileData;
  return safe;
}

/**
 * Data untuk form edit (laboran/kaur_lab) — berisi nilai TEXT asli
 */
export function buildAccessCredentialsForEdit(userId, profileData) {
  return {
    user_id: userId,
    fingerprint: profileData?.fingerprint ?? null,
    kartu_akses_number: profileData?.kartu_akses_number ?? null,
    access_credentials_updated_at: profileData?.access_credentials_updated_at ?? null,
    access_credentials_updated_by: profileData?.access_credentials_updated_by ?? null,
  };
}

/**
 * Ambil credential untuk form edit (hanya laboran / kaur_lab)
 */
export async function getAccessCredentialsForEdit(targetUserId, requestingUserId) {
  const canManage = await canManageAccessCredentials(requestingUserId);
  if (!canManage) {
    throw new Error('Hanya Kaur Lab dan Laboran yang dapat mengelola fingerprint dan kartu akses');
  }
  const profile = await profileModel.getUserProfile(targetUserId);
  return buildAccessCredentialsForEdit(targetUserId, profile);
}

/**
 * Cek apakah user boleh mengelola fingerprint & kartu akses user lain
 */
export async function canManageAccessCredentials(requestingUserId) {
  if (!requestingUserId) return false;
  const uid = String(requestingUserId);
  return (
    (await roleModel.userHasRole(uid, 'kaur_lab')) ||
    (await roleModel.userHasRole(uid, 'laboran'))
  );
}

/**
 * Room RFID admins who may list profile kartu akses numbers for lock assignment.
 */
export async function canListAccessCardsForAssignment(requestingUserId) {
  if (!requestingUserId) return false;
  const uid = String(requestingUserId);
  return (
    (await roleModel.userHasRole(uid, 'kaur_lab')) ||
    (await roleModel.userHasRole(uid, 'laboran')) ||
    (await roleModel.userHasRole(uid, 'tpa'))
  );
}

/**
 * List users with kartu akses on profile (RFID card assignment picker).
 */
export async function listUsersWithAccessCards(requestingUserId, { search } = {}) {
  const canList = await canListAccessCardsForAssignment(requestingUserId);
  if (!canList) {
    throw new Error(
      'Hanya Kaur Lab, Laboran, dan TPA yang dapat melihat daftar kartu akses profil'
    );
  }

  const rows = await profileModel.listUsersWithAccessCards({ search });
  return rows.map((row) => ({
    user_id: row.user_id,
    name: row.name || null,
    nipnim: row.nipnim || null,
    kartu_akses_number: String(row.kartu_akses_number).trim(),
  }));
}

/**
 * Update status fingerprint & kartu akses (hanya laboran / kaur_lab)
 */
export async function updateAccessCredentials(targetUserId, credentialsData, updatedBy) {
  const canManage = await canManageAccessCredentials(updatedBy);
  if (!canManage) {
    throw new Error('Hanya Kaur Lab dan Laboran yang dapat mengelola fingerprint dan kartu akses');
  }

  if (
    credentialsData.fingerprint === undefined &&
    credentialsData.kartu_akses_number === undefined
  ) {
    throw new Error('Minimal satu field harus diisi: fingerprint atau kartu_akses_number');
  }

  const updatePayload = {
    access_credentials_updated_at: new Date(),
    access_credentials_updated_by: updatedBy ? String(updatedBy) : null,
  };

  if (credentialsData.fingerprint !== undefined) {
    const fp = credentialsData.fingerprint;
    updatePayload.fingerprint = fp === null || fp === '' ? null : String(fp).trim();
  }
  if (credentialsData.kartu_akses_number !== undefined) {
    const num = credentialsData.kartu_akses_number;
    updatePayload.kartu_akses_number = num === null || num === '' ? null : String(num).trim();
  }

  const profile = await profileModel.upsertUserProfile(targetUserId, updatePayload);
  return buildAccessCredentialsForEdit(targetUserId, profile);
}

/**
 * Update user profile
 * Validasi: no_rekening hanya bisa diisi jika user punya role asisten_praktikum atau lebih tinggi
 * Support: name dan identifier (auto-sync dari JWT jika tidak diisi)
 */
export async function updateUserProfile(userId, profileData, jwtUserData = null) {
  try {
    // Fingerprint & kartu akses hanya via endpoint access-credentials (laboran/kaur_lab)
    delete profileData.fingerprint;
    delete profileData.kartu_akses_number;
    delete profileData.has_fingerprint;
    delete profileData.has_kartu_akses;
    delete profileData.access_credentials_updated_at;
    delete profileData.access_credentials_updated_by;

    // Auto-sync name dari JWT jika tidak diisi di request body
    if (!profileData.name && jwtUserData) {
      const nameFromJwt = displayNameFromJwtPayload(jwtUserData) || jwtUserData.name || null;
      if (nameFromJwt) {
        profileData.name = nameFromJwt;
        logger.info('Auto-syncing name from JWT in updateUserProfile:', { userId, name: profileData.name });
      }
    }

    // Auto-sync nipnim dari JWT jika tidak diisi (NIP/NIM resmi: nested employee/student_detail atau klaim datar, bukan kode SSO di nipnim)
    if (!profileData.nipnim && jwtUserData) {
      const nipnimFromJWT = nipOrNimFromJwtPayload(jwtUserData) || null;
      if (nipnimFromJWT) {
        profileData.nipnim = nipnimFromJWT;
        logger.info('Auto-syncing nipnim from JWT in updateUserProfile:', { userId, nipnim: nipnimFromJWT });
      }
    }

    // Validasi no_rekening: hanya untuk asisten praktikum
    if (profileData.no_rekening) {
      const hasAsistenRole = await roleModel.userHasRole(userId, 'asisten_praktikum') ||
                             await roleModel.userHasRole(userId, 'asisten_praktikum_aktif') ||
                             await roleModel.userHasRole(userId, 'koordinator_praktikum') ||
                             await roleModel.userHasRole(userId, 'koordinator_asisten') ||
                             await roleModel.userHasRole(userId, 'kaur_lab') ||
                             await roleModel.userHasRole(userId, 'laboran');
      
      if (!hasAsistenRole) {
        throw new Error('No rekening hanya dapat diisi untuk asisten praktikum atau koordinator');
      }
    }

    // Validasi format no rekening (numeric, min 10 digits)
    if (profileData.no_rekening) {
      const noRekeningRegex = /^\d{10,}$/;
      if (!noRekeningRegex.test(profileData.no_rekening)) {
        throw new Error('Format no rekening tidak valid. Harus berupa angka minimal 10 digit');
      }
    }

    if (profileData.procurement_supervised_lab_id !== undefined) {
      const labId = profileData.procurement_supervised_lab_id;
      if (labId === null || labId === '') {
        profileData.procurement_supervised_lab_id = null;
      } else {
        const reviewerRoles = [];
        if (await roleModel.userHasRole(userId, 'dosen_pembina')) {
          reviewerRoles.push('dosen_pembina');
        }
        if (await roleModel.userHasRole(userId, 'koordinator_asisten')) {
          reviewerRoles.push('koordinator_asisten');
        }
        if (reviewerRoles.length === 0) {
          throw new Error(
            'Laboratorium pengawas hanya dapat diassign ke dosen pembina atau koordinator asisten'
          );
        }
        for (const roleSlug of reviewerRoles) {
          const conflict = await profileModel.findProcurementSupervisedLabConflict(
            labId,
            roleSlug,
            userId
          );
          if (conflict) {
            const who = conflict.name?.trim() || conflict.user_id;
            const roleLabel =
              roleSlug === 'dosen_pembina' ? 'dosen pembina' : 'koordinator asisten';
            throw new Error(
              `Laboratorium ini sudah diassign ke ${who} (${roleLabel})`
            );
          }
        }
      }
    }

    // Kode asisten praktikum (1-4 huruf, untuk template import jadwal)
    if (profileData.kode_asisten_praktikum !== undefined) {
      let k = profileData.kode_asisten_praktikum;
      if (k === null || k === '') {
        profileData.kode_asisten_praktikum = null;
      } else {
        k = String(k).trim();
        if (!/^[A-Za-z]{1,4}$/.test(k)) {
          throw new Error('Kode asisten harus 1-4 huruf (A-Z, tanpa angka/spasi)');
        }
        profileData.kode_asisten_praktikum = k.toUpperCase();
      }

      if (profileData.kode_asisten_praktikum) {
        const hasAsistenRole =
          (await roleModel.userHasRole(userId, 'asisten_praktikum')) ||
          (await roleModel.userHasRole(userId, 'asisten_praktikum_aktif'));
        if (!hasAsistenRole) {
          throw new Error('Kode asisten hanya dapat diisi untuk user dengan role asisten praktikum');
        }
      }
    }

    let profile;
    try {
      profile = await profileModel.upsertUserProfile(userId, profileData);
    } catch (error) {
      if (error.code === '23505' && String(error.constraint || '').includes('kode_asisten')) {
        throw new Error('Kode asisten sudah dipakai user lain. Pilih kode lain.');
      }
      throw error;
    }
    return profile;
  } catch (error) {
    logger.error('Error in updateUserProfile service:', error);
    throw error;
  }
}

/**
 * Upload TTD
 * Save file path to database (file sudah di-upload ke storage di controller)
 */
export async function uploadTTD(userId, ttdData) {
  try {
    // Only save file path, ttd (base64) is deprecated
    const profile = await profileModel.upsertUserProfile(userId, {
      ttd: null, // Deprecated, use ttd_file_path instead
      ttd_file_path: ttdData.ttd_file_path || null,
    });

    return profile;
  } catch (error) {
    logger.error('Error in uploadTTD service:', error);
    throw error;
  }
}

/**
 * Delete TTD
 * Jika profile belum ada, return null (tidak error)
 */
export async function deleteTTD(userId) {
  try {
    // Check if profile exists first
    const existingProfile = await profileModel.getUserProfile(userId);
    if (!existingProfile) {
      logger.info('Profile not found for TTD deletion:', { userId });
      return null;
    }
    
    const profile = await profileModel.deleteTTD(userId);
    return profile;
  } catch (error) {
    logger.error('Error in deleteTTD service:', error);
    throw error;
  }
}

/**
 * Update no rekening
 * Validasi role dan format
 * Jika profile belum ada, akan dibuat otomatis
 */
export async function updateNoRekening(userId, rekeningData) {
  try {
    // Validasi role
    const hasAsistenRole = await roleModel.userHasRole(userId, 'asisten_praktikum') ||
                           await roleModel.userHasRole(userId, 'asisten_praktikum_aktif') ||
                           await roleModel.userHasRole(userId, 'koordinator_praktikum') ||
                           await roleModel.userHasRole(userId, 'koordinator_asisten') ||
                           await roleModel.userHasRole(userId, 'admin');
    
    if (!hasAsistenRole) {
      throw new Error('No rekening hanya dapat diisi untuk asisten praktikum atau koordinator');
    }

    // Validasi format
    const noRekeningRegex = /^\d{10,}$/;
    if (!noRekeningRegex.test(rekeningData.no_rekening)) {
      throw new Error('Format no rekening tidak valid. Harus berupa angka minimal 10 digit');
    }

    // Check if profile exists, if not create it first
    let profile = await profileModel.getUserProfile(userId);
    if (!profile) {
      // Create profile dengan no rekening
      profile = await profileModel.upsertUserProfile(userId, {
        no_rekening: rekeningData.no_rekening,
        bank_name: rekeningData.bank_name || null,
        account_name: rekeningData.account_name || null,
      });
    } else {
      // Update existing profile
      profile = await profileModel.updateNoRekening(userId, rekeningData);
    }
    
    return profile;
  } catch (error) {
    logger.error('Error in updateNoRekening service:', error);
    throw error;
  }
}