import * as Model from '../models/practicumModel.js';
import * as practicumService from '../services/practicumService.js';

export async function list(req, res, next) {
  try {
    const { laboratory_id, periode: periodeQuery } = req.query;
    let periodeFilter;
    try {
      const resolved = await practicumService.resolveListPeriodeFilter(periodeQuery);
      periodeFilter = resolved.filter;
    } catch (err) {
      if (err.code === 'ACTIVE_PERIODE_NOT_CONFIGURED') {
        return res.status(400).json({ success: false, message: err.message });
      }
      if (err.message?.includes('harus berupa')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      throw err;
    }

    const filterOpts = { periode: periodeFilter };
    let rows;
    if (laboratory_id) rows = await Model.findByLaboratory(laboratory_id, filterOpts);
    else rows = await Model.findAll(filterOpts);

    res.json({
      success: true,
      data: rows,
      meta: {
        periode_filter: periodeFilter,
        laboratory_id: laboratory_id || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const { id } = req.params;
    const row = await Model.findById(id);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const payload = req.body || {};
    if (!payload.laboratory_id || !payload.name) {
      return res.status(400).json({
        success: false,
        message: 'laboratory_id dan name wajib diisi',
      });
    }

    let periode;
    try {
      periode = await practicumService.resolvePracticumPeriode(payload.periode);
    } catch (err) {
      if (err.message?.includes('harus berupa')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      throw err;
    }

    if (!periode) {
      return res.status(400).json({
        success: false,
        message: 'Periode aktif belum dikonfigurasi. Atur di Konfigurasi atau kirim field periode pada request.',
      });
    }

    const code =
      payload.code?.trim() ||
      practicumService.defaultPracticumCode(payload.name);

    const created = await Model.create({
      laboratory_id: payload.laboratory_id,
      code,
      name: payload.name,
      description: payload.description,
      periode,
    });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    if (practicumService.isPgUniqueViolation(err)) {
      return res.status(409).json({
        success: false,
        message:
          'Praktikum dengan nama dan periode yang sama sudah ada di laboratorium ini',
      });
    }
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { id } = req.params;
    const payload = req.body || {};
    const existing = await Model.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const laboratory_id = payload.laboratory_id ?? existing.laboratory_id;
    const name = payload.name ?? existing.name;
    const code =
      payload.code?.trim() ||
      existing.code ||
      practicumService.defaultPracticumCode(name);
    const description =
      payload.description !== undefined
        ? payload.description
        : existing.description;

    let periode = existing.periode;
    if (payload.periode !== undefined) {
      try {
        periode = practicumService.resolvePeriodeLabel(payload.periode);
      } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      if (!periode) {
        return res.status(400).json({
          success: false,
          message: 'periode tidak boleh kosong',
        });
      }

      const periodeChanged =
        String(periode).trim() !== String(existing.periode ?? '').trim();
      if (periodeChanged) {
        const moduleCount = await Model.countModules(id);
        const enrollmentCount = await Model.countEnrollments(id);
        if (moduleCount > 0 || enrollmentCount > 0) {
          return res.status(400).json({
            success: false,
            message:
              'Periode praktikum tidak dapat diubah karena sudah memiliki modul atau enrollment',
          });
        }
      }
    }

    if (!periode) {
      return res.status(400).json({
        success: false,
        message:
          'Praktikum belum memiliki periode. Kirim field periode atau atur periode aktif lalu update.',
      });
    }

    const updated = await Model.update(id, {
      laboratory_id,
      code,
      name,
      description,
      periode,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (practicumService.isPgUniqueViolation(err)) {
      return res.status(409).json({
        success: false,
        message:
          'Praktikum dengan nama dan periode yang sama sudah ada di laboratorium ini',
      });
    }
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await Model.findById(id);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });

    const moduleCount = await Model.countModules(id);
    const enrollmentCount = await Model.countEnrollments(id);
    if (moduleCount > 0 || enrollmentCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete practicum: it has modules or enrollments',
      });
    }

    await Model.remove(id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    next(err);
  }
}
