import * as service from '../services/inventoryService.js';
import * as logService from '../services/inventoryLogService.js';
import reportService from '../services/reportService.js';

/**
 * POST /api/procurement/inventory
 * Body: { item_name, stock }
 */
export async function createInventory(req, res) {
  try {
    const { item_name, stock, minimum_quantity, category_id } = req.body || {};
    if (!item_name || String(item_name).trim() === '') {
      return res.status(400).json({ success: false, message: 'item_name is required' });
    }

    const createdBy = req.user?.id || null;
    const row = await service.createInventory({
      item_name: String(item_name).trim(),
      stock: Number(stock) || 0,
      minimum_quantity: Number(minimum_quantity) || 0,
      category_id: category_id == null ? null : Number(category_id),
      created_by: createdBy,
    });
    try {
      await logService.createLog({
        inventory_id: row.id,
        item_name: row.item_name,
        change_amount: Number(row.stock) || 0,
        action: 'created',
        note: 'Inventory item created',
        created_by: createdBy,
      });
    } catch (logErr) {
      console.error('createInventory log error', logErr);
    }
    return res.json({ success: true, data: row });
  } catch (e) {
    console.error('createInventory error', e);
    return res.status(500).json({ success: false, message: e.message || 'Internal error' });
  }
}

export async function listInventory(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000);
    const offset = parseInt(req.query.offset || '0', 10);
    const rows = await service.listInventory({ limit, offset });
    return res.json({ success: true, data: rows });
  } catch (e) {
    console.error('listInventory error', e);
    return res.status(500).json({ success: false, message: e.message || 'Internal error' });
  }
}

export async function getInventory(req, res) {
  try {
    const id = req.params.id;
    const row = await service.getInventoryById(id);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: row });
  } catch (e) {
    console.error('getInventory error', e);
    return res.status(500).json({ success: false, message: e.message || 'Internal error' });
  }
}

export async function updateInventoryCtrl(req, res) {
  try {
    const id = req.params.id;
    const { item_name, stock, minimum_quantity, category_id } = req.body || {};
    const before = await service.getInventoryById(id);
    const row = await service.updateInventory(id, {
      item_name,
      stock,
      minimum_quantity,
      category_id: category_id == null ? null : Number(category_id),
    });
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    try {
      const beforeStock = Number(before?.stock) || 0;
      const afterStock = Number(row.stock) || 0;
      await logService.createLog({
        inventory_id: row.id,
        item_name: row.item_name,
        change_amount: afterStock - beforeStock,
        action: 'updated',
        note: `Stock changed from ${beforeStock} to ${afterStock}`,
        created_by: req.user?.id || null,
      });
    } catch (logErr) {
      console.error('updateInventory log error', logErr);
    }
    return res.json({ success: true, data: row });
  } catch (e) {
    console.error('updateInventory error', e);
    return res.status(500).json({ success: false, message: e.message || 'Internal error' });
  }
}

export async function listLowStockInventory(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000);
    const offset = parseInt(req.query.offset || '0', 10);
    const rows = await service.listLowStock({ limit, offset });
    return res.json({ success: true, data: rows });
  } catch (e) {
    console.error('listLowStockInventory error', e);
    return res.status(500).json({ success: false, message: e.message || 'Internal error' });
  }
}

export async function deleteInventoryCtrl(req, res) {
  try {
    const id = req.params.id;
    const before = await service.getInventoryById(id);
    if (!before) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    const eligibility = await service.getInventoryDeleteEligibility(id);
    if (!eligibility.canDelete) {
      return res.status(409).json({
        success: false,
        message: eligibility.reason,
        activeSubmissions: eligibility.activeSubmissions ?? [],
      });
    }

    const row = await service.deleteInventory(id);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    try {
      await logService.createLog({
        // keep null since item has been deleted and FK may no longer exist
        inventory_id: null,
        item_name: row.item_name,
        change_amount: Number(row.stock) || 0,
        action: 'deleted',
        note: 'Inventory item deleted',
        created_by: req.user?.id || null,
      });
    } catch (logErr) {
      console.error('deleteInventory log error', logErr);
    }
    return res.json({ success: true, data: row });
  } catch (e) {
    console.error('deleteInventory error', e);
    return res.status(500).json({ success: false, message: e.message || 'Internal error' });
  }
}

export async function listInventoryLogs(req, res) {
  try {
    const id = req.params.id;
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000);
    const offset = parseInt(req.query.offset || '0', 10);
    const rows = await logService.listLogs(id, { limit, offset });
    return res.json({ success: true, data: rows });
  } catch (e) {
    console.error('listInventoryLogs error', e);
    return res.status(500).json({ success: false, message: e.message || 'Internal error' });
  }
}

export async function listAllInventoryLogs(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000);
    const offset = parseInt(req.query.offset || '0', 10);
    const rows = await logService.listAllLogs({ limit, offset });
    return res.json({ success: true, data: rows });
  } catch (e) {
    console.error('listAllInventoryLogs error', e);
    return res.status(500).json({ success: false, message: e.message || 'Internal error' });
  }
}

export async function quarterlyReportCtrl(req, res) {
  try {
    const { year, quarter, item_ids, include_logs = true, location_id, format = 'json' } = req.body || {};
    if (!year || !quarter) return res.status(400).json({ success: false, message: 'year and quarter are required' });

    // Always generate JSON report first
    const result = await reportService.generateQuarterlyReport({ year, quarter, item_ids, include_logs, location_id, format: 'json' });

    if (format && format !== 'json') {
      // generate buffer according to requested format
      if (format === 'csv') {
        const buf = reportService.toCsvBuffer(result.report);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="inventory_quarterly_${year}_Q${quarter}.csv"`);
        return res.send(buf);
      }
      if (format === 'xlsx' || format === 'xls') {
        const buf = reportService.toXlsxBuffer(result.report);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="inventory_quarterly_${year}_Q${quarter}.xlsx"`);
        return res.send(buf);
      }
      // Unsupported format
      return res.status(400).json({ success: false, message: 'unsupported format' });
    }

    return res.json({ success: true, data: result });
  } catch (e) {
    console.error('quarterlyReportCtrl error', e);
    return res.status(500).json({ success: false, message: e.message || 'Internal error' });
  }
}
