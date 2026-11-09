import * as Model from '../models/registrationOperationalSettingsModel.js';

function parseIsoDateOnly(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export async function getBundle(req, res, next) {
  try {
    const [settingsRows, holidays] = await Promise.all([
      Model.findAllSettings(),
      Model.findAllHolidays(),
    ]);
    const settings = {};
    for (const row of settingsRows) {
      settings[row.setting_key] = {
        value: row.value,
        description: row.description,
        updated_at: row.updated_at,
      };
    }
    res.json({
      success: true,
      data: { settings, holidays },
    });
  } catch (err) {
    next(err);
  }
}

export async function upsertSetting(req, res, next) {
  try {
    const { key } = req.params;
    if (!Model.isValidSettingKey(key)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid setting_key: gunakan snake_case, huruf kecil di awal, max 191 karakter',
      });
    }
    const body = req.body || {};
    if (!Object.prototype.hasOwnProperty.call(body, 'value')) {
      return res.status(400).json({ success: false, message: 'value is required' });
    }
    const row = await Model.upsertSetting(key, body.value, body.description);
    res.json({ success: true, data: row });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Conflict' });
    }
    next(err);
  }
}

export async function removeSetting(req, res, next) {
  try {
    const { key } = req.params;
    if (!Model.isValidSettingKey(key)) {
      return res.status(400).json({ success: false, message: 'Invalid setting_key' });
    }
    const deleted = await Model.deleteSetting(key);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Setting not found' });
    }
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    next(err);
  }
}

export async function listHolidays(req, res, next) {
  try {
    const rows = await Model.findAllHolidays();
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

export async function createHoliday(req, res, next) {
  try {
    const { holiday_date: holidayDate, label } = req.body || {};
    const normalized = parseIsoDateOnly(holidayDate);
    if (!normalized) {
      return res.status(400).json({
        success: false,
        message: 'holiday_date wajib format YYYY-MM-DD',
      });
    }
    const row = await Model.insertHoliday(normalized, label);
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Tanggal libur sudah terdaftar',
      });
    }
    next(err);
  }
}

export async function removeHoliday(req, res, next) {
  try {
    const { id } = req.params;
    const deleted = await Model.deleteHolidayById(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Holiday not found' });
    }
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    next(err);
  }
}
