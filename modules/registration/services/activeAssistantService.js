import * as activePeriodeService from './activePeriodeService.js';
import { resolvePeriodeLabel } from './activePeriodeService.js';
import * as activeAssistantModel from '../models/activeAssistantModel.js';
import * as practicumModel from '../models/practicumModel.js';
import * as profileModel from '../../user-management/models/profileModel.js';
import * as roleService from '../../user-management/services/roleService.js';

export function resolvePeriodeKey(activePeriode) {
  if (!activePeriode || typeof activePeriode !== 'object') {
    return resolvePeriodeLabel(activePeriode);
  }
  const id = activePeriode.id != null ? String(activePeriode.id).trim() : null;
  const label = activePeriode.label != null ? String(activePeriode.label).trim() : null;
  const periode = activePeriode.periode != null ? String(activePeriode.periode).trim() : null;
  return id || label || periode || null;
}

function practicumMatchesActivePeriode(practicumPeriode, activePeriode) {
  if (!practicumPeriode) {
    return false;
  }
  const normalizedPracticum = String(practicumPeriode).trim().toLowerCase();
  if (!activePeriode || typeof activePeriode !== 'object') {
    const label = resolvePeriodeLabel(activePeriode);
    return label ? normalizedPracticum === label.toLowerCase() : false;
  }
  const candidates = [
    activePeriode.id,
    activePeriode.label,
    activePeriode.periode,
  ]
    .filter((value) => value != null && String(value).trim())
    .map((value) => String(value).trim().toLowerCase());
  return candidates.includes(normalizedPracticum);
}

export async function requireActivePeriodeContext() {
  const { active_periode, updated_at } = await activePeriodeService.getActivePeriode();
  const periodeKey = resolvePeriodeKey(active_periode);
  if (!periodeKey) {
    const error = new Error('Periode aktif belum dikonfigurasi. Set terlebih dahulu via PUT /api/registration/periode/active');
    error.userFacing = true;
    error.code = 'ACTIVE_PERIODE_NOT_CONFIGURED';
    throw error;
  }
  return {
    active_periode,
    periode_key: periodeKey,
    periode_label: resolvePeriodeLabel(active_periode),
    updated_at,
  };
}

/**
 * Konteks assign asisten aktif: wajib pilih praktikum yang selaras dengan periode aktif.
 */
export async function requirePracticumAssignmentContext(practicumId) {
  const normalizedId = String(practicumId || '').trim();
  if (!normalizedId) {
    const error = new Error('practicum_id wajib diisi');
    error.userFacing = true;
    error.code = 'PRACTICUM_ID_REQUIRED';
    throw error;
  }

  const periodeCtx = await requireActivePeriodeContext();
  const practicum = await practicumModel.findById(normalizedId);
  if (!practicum) {
    const error = new Error('Praktikum tidak ditemukan');
    error.userFacing = true;
    error.code = 'PRACTICUM_NOT_FOUND';
    throw error;
  }

  if (!practicumMatchesActivePeriode(practicum.periode, periodeCtx.active_periode)) {
    const error = new Error(
      `Praktikum "${practicum.name}" bukan milik periode aktif (${periodeCtx.periode_label || periodeCtx.periode_key})`
    );
    error.userFacing = true;
    error.code = 'PRACTICUM_PERIODE_MISMATCH';
    throw error;
  }

  return {
    ...periodeCtx,
    practicum_id: practicum.id,
    practicum,
  };
}

/**
 * Registry asisten aktif per (praktikum, periode berjalan).
 */
export async function getActiveAssistantRegistryForPracticum(practicumId) {
  const ctx = await requirePracticumAssignmentContext(practicumId);
  const assignments = await activeAssistantModel.findByPracticumAndPeriodeKey(
    ctx.practicum_id,
    ctx.periode_key
  );
  const userIds = new Set(assignments.map((row) => String(row.user_id)));
  const nims = new Set(
    assignments.map((row) => String(row.nim || '').trim().toLowerCase()).filter(Boolean)
  );
  return {
    ...ctx,
    assignments,
    userIds,
    nims,
  };
}

export async function listActiveAssistantsForPracticum(practicumId) {
  const registry = await getActiveAssistantRegistryForPracticum(practicumId);

  const userIds = registry.assignments.map((row) => row.user_id).filter(Boolean);
  const profiles = await profileModel.findByUserIds(userIds);
  const profileByUserId = new Map(
    profiles.map((profile) => [String(profile.user_id).toLowerCase(), profile])
  );

  return {
    active_periode: registry.active_periode,
    periode_key: registry.periode_key,
    practicum_id: registry.practicum_id,
    practicum: registry.practicum,
    data: registry.assignments.map((row) => {
      const profile = profileByUserId.get(String(row.user_id).toLowerCase());
      return {
        ...row,
        name: profile?.name || null,
        nipnim: profile?.nipnim || row.nim,
      };
    }),
  };
}

/**
 * Daftar asisten aktif terdaftar untuk UI penjadwalan (per praktikum & periode aktif).
 */
export async function listAvailableActiveAssistantsForAssignment(practicumId) {
  const listed = await listActiveAssistantsForPracticum(practicumId);
  return listed.data.map((row) => ({
    user_id: row.user_id,
    name: row.name || null,
    nipnim: row.nipnim || row.nim || null,
  }));
}

function formatRegistryError(prefix, identifiers, practicumName, periodeLabel) {
  const scope = practicumName
    ? `${practicumName} / ${periodeLabel}`
    : periodeLabel;
  return `${prefix}: ${identifiers.join(', ')} (praktikum & periode aktif: ${scope})`;
}

/**
 * Validasi user_id harus terdaftar di registry asisten aktif praktikum terpilih.
 */
export async function assertUsersAreRegisteredActiveAssistants(userIds = [], practicumId) {
  const ids = [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
  if (ids.length === 0) {
    return;
  }

  const registry = await getActiveAssistantRegistryForPracticum(practicumId);
  const invalid = ids.filter((userId) => !registry.userIds.has(userId));
  if (invalid.length > 0) {
    throw new Error(
      formatRegistryError(
        'User berikut bukan asisten aktif terdaftar',
        invalid,
        registry.practicum?.name,
        registry.periode_label || registry.periode_key
      )
    );
  }
}

/**
 * Validasi NIM harus terdaftar di registry asisten aktif praktikum terpilih.
 */
export async function assertNimsAreRegisteredActiveAssistants(nims = [], practicumId) {
  const normalized = [...new Set(
    (nims || []).map((nim) => String(nim).trim().toLowerCase()).filter(Boolean)
  )];
  if (normalized.length === 0) {
    return;
  }

  const registry = await getActiveAssistantRegistryForPracticum(practicumId);
  const invalid = normalized.filter((nim) => !registry.nims.has(nim));
  if (invalid.length > 0) {
    throw new Error(
      formatRegistryError(
        'NIM berikut bukan asisten aktif terdaftar',
        invalid,
        registry.practicum?.name,
        registry.periode_label || registry.periode_key
      )
    );
  }
}

/**
 * Assign role UM asisten praktikum aktif (dipanggil saat import registry).
 */
export async function applyActiveAssistantRolesOnAssignment(userIds = [], assignedBy = null) {
  const ids = [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
  if (ids.length === 0) {
    return;
  }

  for (const userId of ids) {
    await roleService.ensureActiveAssistantRoles(userId, assignedBy);
  }
}

/**
 * Validasi NIM terdaftar + assign role by NIM (legacy helper).
 */
export async function applyActiveAssistantRolesForAssignedNims(
  nims = [],
  practicumId,
  assignedBy = null
) {
  const normalized = [...new Set(
    (nims || []).map((nim) => String(nim).trim()).filter(Boolean)
  )];
  if (normalized.length === 0) {
    return;
  }

  await assertNimsAreRegisteredActiveAssistants(normalized, practicumId);
  const profiles = await profileModel.findByNipnims(normalized);
  const userIds = profiles.map((profile) => profile.user_id).filter(Boolean);
  await applyActiveAssistantRolesOnAssignment(userIds, assignedBy);
}
