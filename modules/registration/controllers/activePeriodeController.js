/**
 * Periode aktif — GET (semua user terautentikasi), PUT (kaur_lab, laboran, koordinator)
 */

import * as activePeriodeService from '../services/activePeriodeService.js';

export async function getActivePeriode(req, res, next) {
  try {
    const data = await activePeriodeService.getActivePeriode();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function setActivePeriode(req, res, next) {
  try {
    const body = req.body || {};
    const raw =
      body.active_periode !== undefined
        ? body.active_periode
        : body.value !== undefined
          ? body.value
          : undefined;

    if (raw === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Field active_periode wajib diisi',
      });
    }

    const updatedBy = req.user?.id ? String(req.user.id) : null;
    const data = await activePeriodeService.setActivePeriode(raw, updatedBy);

    res.json({
      success: true,
      data,
      message: 'Periode aktif berhasil diperbarui',
    });
  } catch (err) {
    if (
      err.message.includes('wajib diisi') ||
      err.message.includes('harus berupa')
    ) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
}
