import { registrationDb } from '../../../config/databases.js';

const SETTING_KEY_PATTERN = /^[a-z][a-z0-9_]{0,190}$/;

export function isValidSettingKey(key) {
  return typeof key === 'string' && SETTING_KEY_PATTERN.test(key);
}

export async function findAllSettings() {
  const res = await registrationDb.query(
    `SELECT setting_key, value, description, updated_at
     FROM registration_settings
     ORDER BY setting_key`
  );
  return res.rows;
}

export async function findSettingByKey(settingKey) {
  const res = await registrationDb.query(
    `SELECT setting_key, value, description, updated_at
     FROM registration_settings
     WHERE setting_key = $1`,
    [settingKey]
  );
  return res.rows[0] ?? null;
}

export async function upsertSetting(settingKey, value, description) {
  const res = await registrationDb.query(
    `INSERT INTO registration_settings (setting_key, value, description, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (setting_key) DO UPDATE SET
       value = EXCLUDED.value,
       description = COALESCE(EXCLUDED.description, registration_settings.description),
       updated_at = now()
     RETURNING setting_key, value, description, updated_at`,
    [settingKey, JSON.stringify(value), description ?? null]
  );
  return res.rows[0];
}

export async function deleteSetting(settingKey) {
  const res = await registrationDb.query(
    `DELETE FROM registration_settings WHERE setting_key = $1 RETURNING setting_key`,
    [settingKey]
  );
  return res.rows[0] ?? null;
}

export async function findAllHolidays() {
  const res = await registrationDb.query(
    `SELECT id, holiday_date, label, created_at, updated_at
     FROM registration_holidays
     ORDER BY holiday_date`
  );
  return res.rows;
}

export async function insertHoliday(holidayDate, label) {
  const res = await registrationDb.query(
    `INSERT INTO registration_holidays (holiday_date, label, updated_at)
     VALUES ($1::date, $2, now())
     RETURNING id, holiday_date, label, created_at, updated_at`,
    [holidayDate, label ?? null]
  );
  return res.rows[0];
}

export async function deleteHolidayById(id) {
  const res = await registrationDb.query(
    `DELETE FROM registration_holidays WHERE id = $1::uuid RETURNING id`,
    [id]
  );
  return res.rows[0] ?? null;
}
