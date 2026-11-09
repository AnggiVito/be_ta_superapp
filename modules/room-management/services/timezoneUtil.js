/**
 * Timezone Utility
 * Convert between WIB (Asia/Jakarta) and UTC timestamps.
 * WIB wall-clock values are stored as "YYYY-MM-DD HH:mm:ss" (no timezone suffix).
 */

export function normalizeTimePart(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
  return raw.slice(0, 8);
}

export function formatWibNaiveTimestamp(tanggal, jam) {
  const time = normalizeTimePart(jam);
  if (!tanggal || !time) return null;
  return `${tanggal} ${time}`;
}

export function toWibNaiveFromInstant(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

export function coerceWibNaiveTimestamp(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const sqlMatch = value.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
    if (sqlMatch) {
      const time = sqlMatch[2].length === 5 ? `${sqlMatch[2]}:00` : sqlMatch[2];
      return `${sqlMatch[1]} ${time}`;
    }
  }
  return toWibNaiveFromInstant(value instanceof Date ? value : new Date(value));
}

/**
 * Convert WIB datetime string to UTC timestamp for TTLock
 * NOTE: TTLock expects UTC timestamps; convert WIB wall-clock to UTC
 * by subtracting the +7 hour offset.
 * @param {string} wibDateString - Date string in WIB (e.g., "2025-12-03 16:00:00.000" or "2025-11-08T02:00:00")
 * @returns {number} Timestamp in milliseconds
 */
export function wibToUtcTimestamp(wibDateString) {
  // Parse the date string manually to avoid timezone ambiguity
  // Input format: "2025-12-03 16:00:00.000" (WIB timezone)
  
  // Parse components from string (split by space, dash, colon, dot)
  const parts = wibDateString.replace('T', ' ').split(/[\s\-:.]+/);
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1; // Month is 0-indexed
  const day = parseInt(parts[2]);
  const hour = parseInt(parts[3] || 0);
  const minute = parseInt(parts[4] || 0);
  const second = parseInt(parts[5] || 0);
  const millisecond = parseInt(parts[6] || 0);
  
  // Create UTC timestamp from WIB wall-clock by subtracting the +7 offset.
  const wibAsUtc = Date.UTC(year, month, day, hour, minute, second, millisecond);
  return wibAsUtc - (7 * 60 * 60 * 1000);
}

/**
 * Convert WIB datetime string to TTLock wall-clock timestamp
 * NOTE: Some TTLock endpoints display timestamps without timezone conversion.
 * This returns the wall-clock as a UTC timestamp without applying offset.
 * @param {string} wibDateString - Date string in WIB
 * @returns {number} Timestamp in milliseconds
 */
export function wibToWallClockTimestamp(wibDateString) {
  const parts = wibDateString.replace('T', ' ').split(/[^0-9]+/);
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1;
  const day = parseInt(parts[2]);
  const hour = parseInt(parts[3] || 0);
  const minute = parseInt(parts[4] || 0);
  const second = parseInt(parts[5] || 0);
  const millisecond = parseInt(parts[6] || 0);

  return Date.UTC(year, month, day, hour, minute, second, millisecond);
}

/**
 * Convert UTC timestamp to WIB datetime string
 * @param {number} utcTimestamp - UTC timestamp in milliseconds
 * @returns {string} WIB datetime string (ISO format)
 */
export function utcToWibString(utcTimestamp) {
  // Add 7 hours to UTC to get WIB
  const wibTimestamp = utcTimestamp + (7 * 60 * 60 * 1000);
  const wibDate = new Date(wibTimestamp);
  
  return wibDate.toISOString();
}

/**
 * Get current WIB timestamp
 * @returns {number} Current timestamp in WIB
 */
export function getCurrentWibTimestamp() {
  return Date.now() + (7 * 60 * 60 * 1000);
}

/**
 * Format date to WIB string
 * @param {Date} date - Date object
 * @returns {string} Formatted WIB date string
 */
export function formatToWib(date) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}
