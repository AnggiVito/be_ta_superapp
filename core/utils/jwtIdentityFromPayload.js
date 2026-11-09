/**
 * Helpers to read human identity from decoded JWT payloads (auth gateway / SSO).
 * NIP = Nomor Induk Pegawai, NIM = Nomor Induk Mahasiswa — never treat username/email as NIP/NIM.
 */

function _firstString(u, keys) {
  if (!u || typeof u !== 'object') return '';
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(u, k)) continue;
    const v = u[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

/** NIP/NIM di klaim datar token (bukan username/email). */
function _officialLegacyNipnimRootClaim(u) {
  if (!u || typeof u !== 'object') return '';
  const legacy = _firstString(u, [
    'nipnim',
    'nipNim',
    'nip_nim',
    'identifier',
    'id_number',
    'idNumber',
    'nim',
    'NIM',
    'student_nim',
    'nip',
    'NIP',
  ]);
  if (!legacy || legacy.includes('@')) return '';
  const uname = _firstString(u, ['username', 'preferred_username', 'preferredUsername']);
  if (uname && legacy === uname) return '';
  const em = _firstString(u, ['email']);
  if (em && legacy.toLowerCase() === em.toLowerCase()) return '';
  return legacy.trim();
}

function _maybeJsonParseObject(v) {
  if (v == null) return null;
  if (typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t.startsWith('{')) return null;
  try {
    const o = JSON.parse(t);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

/**
 * Kumpulkan objek “wadah” yang mungkin berisi `employee` / `student_detail` / `lecturer_detail`.
 * Token gateway sering menaruh nested di `data` langsung (tanpa `data.user`), atau `user` sebagai string JSON.
 */
function _jwtNestedProfileContainers(u) {
  if (!u || typeof u !== 'object') return [];
  const out = [];
  const seen = new Set();
  const push = (x) => {
    if (x == null) return;
    const o = _maybeJsonParseObject(x) ?? (typeof x === 'object' && !Array.isArray(x) ? x : null);
    if (!o) return;
    const key = o;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(o);
  };

  push(u.user);
  const dataRaw = u.data;
  const dataObj =
    _maybeJsonParseObject(dataRaw) ??
    (dataRaw && typeof dataRaw === 'object' && !Array.isArray(dataRaw) ? dataRaw : null);
  if (dataObj) {
    push(dataObj.user);
    push(dataObj.profile);
    push(dataObj);
  }
  push(u.profile);
  push(u.user_profile ?? u.userProfile);

  return out;
}

/** Gateway FRI: respons `/jwt/payload` memakai `{ claims: { name, nipnim, sub, … } }`; sebarkan ke root agar middleware sama seperti token datar. */
function _spreadGatewayJwtClaimsOntoRoot(u) {
  const claims = u.claims;
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return u;
  return {
    ...u,
    ...claims,
    claims,
  };
}

/**
 * Respons login gateway kadang punya `user: { employee, student_detail, … }` sementara JWT access hanya klaim datar.
 * `user` / `data` kadang **string JSON**. Nested bisa ada di `data.user`, atau **langsung di `data`** (tanpa `user`).
 * Jika ada `claims` (bentuk ACS / gateway), klaim tersebut **disebarkan ke root** setelah merge nested.
 */
export function mergeGatewayJwtUserPayload(u) {
  if (!u || typeof u !== 'object') return u;

  const containers = _jwtNestedProfileContainers(u);

  let employee = u.employee ?? u.employee_data ?? u.employeeData ?? null;
  let student_detail = u.student_detail ?? u.studentDetail ?? null;
  let lecturer_detail = u.lecturer_detail ?? u.lecturerDetail ?? null;

  for (const inner of containers) {
    employee =
      employee ??
      inner.employee ??
      inner.employee_data ??
      inner.employeeData ??
      null;
    lecturer_detail =
      lecturer_detail ??
      inner.lecturer_detail ??
      inner.lecturerDetail ??
      null;
    student_detail =
      student_detail ??
      inner.student_detail ??
      inner.studentDetail ??
      inner.mahasiswa ??
      inner.student ??
      null;
  }

  let out;
  if (employee == null && student_detail == null && lecturer_detail == null) {
    out = u;
  } else {
    out = {
      ...u,
      employee: u.employee ?? u.employee_data ?? u.employeeData ?? employee ?? null,
      student_detail: u.student_detail ?? u.studentDetail ?? student_detail ?? null,
      lecturer_detail: u.lecturer_detail ?? u.lecturerDetail ?? lecturer_detail ?? null,
    };
  }

  return _spreadGatewayJwtClaimsOntoRoot(out);
}

/**
 * True if `s` looks like an internal gateway/SSO account code (e.g. M001, DOSEN001).
 * @deprecated Tidak dipakai lagi untuk memfilter NIP/NIM; tetap diekspor agar impor lama tidak putus.
 */
export function looksLikeGatewaySsoNipnimCode(s) {
  const t = String(s || '').trim();
  if (!t || t.includes('@')) return false;
  if (/^\d{6,}$/.test(t)) return false;
  if (/^\d[\d-]{5,}\d$/.test(t)) return false;
  return /^[A-Za-z]{1,7}\d{1,5}$/.test(t);
}

/**
 * NIP hanya dari nested `employee` / `lecturer_detail` (tanpa klaim root `nipnim` / `identifier`).
 * Dipakai snapshot penandatangan procurement agar tidak mengisi dari kode datar di token.
 */
export function nipFromEmployeeNestedOnly(u) {
  if (!u || typeof u !== 'object') return '';
  const emp = u.employee ?? u.employee_data ?? u.employeeData ?? u.pegawai ?? u.dosen;
  const vEmp = _firstString(emp, [
    'nip',
    'NIP',
    'nomor_induk_pegawai',
    'nomorIndukPegawai',
    'no_induk_pegawai',
    'noIndukPegawai',
  ]);
  if (vEmp) return String(vEmp).trim();

  const lec = u.lecturer_detail ?? u.lecturerDetail;
  const vLec = _firstString(lec, [
    'nip',
    'NIP',
    'nidn',
    'NIDN',
    'nomor_induk_pegawai',
    'nomorIndukPegawai',
  ]);
  if (vLec) return String(vLec).trim();

  return '';
}

/**
 * NIM hanya dari nested `student_detail` (tanpa klaim root).
 */
export function nimFromStudentNestedOnly(u) {
  if (!u || typeof u !== 'object') return '';
  const blocks = [
    u.student_detail,
    u.studentDetail,
    u.student,
    u.mahasiswa,
    u.mahasiswa_detail,
    u.mahasiswaDetail,
  ];
  for (const stu of blocks) {
    if (!stu || typeof stu !== 'object' || Array.isArray(stu)) continue;
    const v = _firstString(stu, [
      'nim',
      'NIM',
      'nomor_induk_mahasiswa',
      'nomorIndukMahasiswa',
      'no_induk_mahasiswa',
      'noIndukMahasiswa',
    ]);
    if (v) return String(v).trim();
  }
  return '';
}

/**
 * NIP untuk slot dosen_pembina / kaur / kaprodi: `employee.nip`, lalu `lecturer_detail` (nidn),
 * lalu klaim datar `nipnim` / `identifier`.
 */
export function nipFromEmployeeJwtPayload(u) {
  const n = nipFromEmployeeNestedOnly(u);
  if (n) return n;
  return _officialLegacyNipnimRootClaim(u);
}

/**
 * NIM untuk slot kordas: `student_detail.nim`, lalu klaim datar `nipnim`.
 */
export function nimFromStudentDetailJwtPayload(u) {
  const n = nimFromStudentNestedOnly(u);
  if (n) return n;
  return _officialLegacyNipnimRootClaim(u);
}

/**
 * NIP (staff) or NIM (student) from JWT / enriched `req.user`.
 * Prefer nested (`employee.nip`, `student_detail.nim`) lalu klaim datar.
 */
export function nipOrNimFromJwtPayload(u) {
  if (!u || typeof u !== 'object') return '';

  const fromEmp = nipFromEmployeeJwtPayload(u);
  if (fromEmp) return fromEmp;

  const fromStu = nimFromStudentDetailJwtPayload(u);
  if (fromStu) return fromStu;

  const nip = _firstString(u, [
    'nomor_induk_pegawai',
    'nomorIndukPegawai',
    'no_induk_pegawai',
    'noIndukPegawai',
    'nip',
    'NIP',
    'employee_nip',
    'employeeNip',
    'lecturer_nip',
    'lecturerNip',
    'nrk',
    'nrp',
  ]);
  if (nip) return nip;

  const nim = _firstString(u, [
    'nomor_induk_mahasiswa',
    'nomorIndukMahasiswa',
    'no_induk_mahasiswa',
    'noIndukMahasiswa',
    'nim',
    'NIM',
    'student_nim',
    'studentNim',
    'mahasiswa_nim',
    'mahasiswaNim',
    'nim_mahasiswa',
    'nimMahasiswa',
  ]);
  if (nim) return nim;

  return _officialLegacyNipnimRootClaim(u);
}

/**
 * Display name for documents; avoids using account username before real name fields are exhausted.
 */
export function displayNameFromJwtPayload(u) {
  let n = _firstString(u, [
    'nama',
    'nama_lengkap',
    'namaLengkap',
    'full_name',
    'fullName',
    'name',
    'displayName',
    'display_name',
  ]);
  if (n) return n;
  const gn = _firstString(u, ['given_name', 'givenName']);
  const fn = _firstString(u, ['family_name', 'familyName', 'surname']);
  const combined = `${gn} ${fn}`.trim();
  if (combined) return combined;
  return _firstString(u, ['username', 'preferred_username', 'preferredUsername']);
}

/** UUID v4-ish (accept common gateway variants). */
export function looksLikeUuid(value) {
  const s = value == null ? '' : String(value).trim();
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Study program id or label from JWT (Kaprodi: often on `employee` / flat claims).
 * Returns UUID string or program name/code — caller may resolve to canonical UUID.
 */
export function studyProgramIdFromJwtPayload(u) {
  if (!u || typeof u !== 'object') return '';

  const probe = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
    const flat = _firstString(obj, [
      'study_program_id',
      'studyProgramId',
      'studyprogramid',
      'prodi_id',
      'prodiId',
      'program_id',
      'programId',
    ]);
    if (flat) return flat;
    const nested = obj.study_program ?? obj.studyProgram ?? obj.prodi ?? obj.program;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const id = _firstString(nested, ['id', 'study_program_id', 'studyProgramId', 'uuid', '_id']);
      if (id) return id;
    }
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
    return _firstString(obj, [
      'study_program_name',
      'studyProgramName',
      'studyprogramname',
      'prodi_name',
      'prodiName',
      'program_name',
      'programName',
    ]);
  };

  let v = probe(u);
  if (v) return v;

  const merged = mergeGatewayJwtUserPayload(u);
  v = probe(merged);
  if (v) return v;

  for (const inner of _jwtNestedProfileContainers(merged)) {
    v = probe(inner);
    if (v) return v;
    const emp = inner.employee ?? inner.employee_data ?? inner.employeeData;
    v = probe(emp);
    if (v) return v;
    const lec = inner.lecturer_detail ?? inner.lecturerDetail;
    v = probe(lec);
    if (v) return v;
    const tpa = inner.tpa_detail ?? inner.tpaDetail;
    v = probe(tpa);
    if (v) return v;
  }

  return '';
}
