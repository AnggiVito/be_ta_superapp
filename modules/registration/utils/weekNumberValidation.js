/**
 * Validasi week_number modul praktikum (minggu pelaksanaan).
 */
export function validateWeekNumber(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      return { ok: false, message: 'week_number wajib diisi (bilangan bulat positif, mis. 7)' };
    }
    return { ok: true };
  }

  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    return {
      ok: false,
      message: 'week_number harus bilangan bulat positif (contoh: 7, 8, 9)',
    };
  }

  return { ok: true, value: n };
}
