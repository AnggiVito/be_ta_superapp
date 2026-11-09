import { procurementDb } from '../../../config/databases.js';
import XLSX from 'xlsx';

function buildQuarterDates(year, quarter) {
  const q = Math.max(1, Math.min(4, Number(quarter)));
  const startMonth = (q - 1) * 3 + 1;
  // use timestamptz in DB; keep ISO strings
  const start = new Date(Date.UTC(Number(year), startMonth - 1, 1)).toISOString();
  // end = first day of next quarter
  const endMonth = startMonth + 3;
  const end = new Date(Date.UTC(Number(year), endMonth - 1, 1)).toISOString();
  return { start, end };
}

/**
 * Generate quarterly inventory report per item. Returns JSON summary and optionally logs.
 * Params: { year, quarter, item_ids (array|null), include_logs (bool), location_id (nullable) }
 */
export async function generateQuarterlyReport({ year, quarter, item_ids = null, include_logs = true, location_id = null, format = 'json' } = {}) {
  const { start, end } = buildQuarterDates(year, quarter);

  // Build base SQL for items summary using change_amount and action column names
  const itemsSql = `
    WITH params AS (SELECT $1::timestamptz AS start_date, $2::timestamptz AS end_date),
    beg AS (
      SELECT il.inventory_id, COALESCE(SUM(il.change_amount),0) AS beginning
      FROM procurement_inventory_logs il, params p
      WHERE il.created_at < p.start_date
      GROUP BY il.inventory_id
    ),
    period AS (
      SELECT il.inventory_id,
        COALESCE(SUM(CASE WHEN il.change_amount > 0 THEN il.change_amount ELSE 0 END),0) AS receipts,
        COALESCE(ABS(SUM(CASE WHEN il.change_amount < 0 THEN il.change_amount ELSE 0 END)),0) AS issues,
        COALESCE(SUM(CASE WHEN il.action = 'adjustment' THEN il.change_amount ELSE 0 END),0) AS adjustments
      FROM procurement_inventory_logs il, params p
      WHERE il.created_at >= p.start_date AND il.created_at < p.end_date
      GROUP BY il.inventory_id
    )
  SELECT i.id AS inventory_id, i.item_name AS name, i.stock AS stock, NULL::text AS sku, NULL::bigint AS location_id, COALESCE(b.beginning,0) AS beginning_balance,
      COALESCE(p.receipts,0) AS receipts, COALESCE(p.issues,0) AS issues, COALESCE(p.adjustments,0) AS adjustments,
      (COALESCE(b.beginning,0) + COALESCE(p.receipts,0) - COALESCE(p.issues,0) + COALESCE(p.adjustments,0)) AS ending_balance,
      i.minimum_quantity
    FROM procurement_inventory i
    LEFT JOIN beg b ON b.inventory_id = i.id
    LEFT JOIN period p ON p.inventory_id = i.id
    ${ item_ids && item_ids.length ? 'WHERE i.id = ANY($3::int[])' : '' }
    ORDER BY i.item_name;
  `;

  const params = item_ids && item_ids.length ? [start, end, item_ids] : [start, end];
  const itemsRes = await procurementDb.query(itemsSql, params);
  const rows = itemsRes.rows;

  const report = rows.map(r => ({
    inventory_id: r.inventory_id,
    name: r.name,
    current_stock: Number(r.stock || 0),
    beginning_stock: Number(r.beginning_balance || 0),
    // keep legacy fields for compatibility
    sku: r.sku,
    location_id: r.location_id,
    receipts: Number(r.receipts || 0),
    issues: Number(r.issues || 0),
    adjustments: Number(r.adjustments || 0),
    ending_balance: Number(r.ending_balance || 0),
    minimum_quantity: Number(r.minimum_quantity || 0),
  }));

  // Optionally fetch logs in period for those items
  const logsByItem = {};
  if (include_logs && rows.length) {
    const ids = rows.map(r => r.inventory_id);
    const logsSql = `
      SELECT id, inventory_id, change_amount, action, note, submission_id, requester_name, created_by, created_at
      FROM procurement_inventory_logs
      WHERE created_at >= $1 AND created_at < $2 AND inventory_id = ANY($3::int[])
      ORDER BY inventory_id, created_at ASC
    `;
    const logsRes = await procurementDb.query(logsSql, [start, end, ids]);
    logsRes.rows.forEach(l => {
      if (!logsByItem[l.inventory_id]) logsByItem[l.inventory_id] = [];
      logsByItem[l.inventory_id].push(l);
    });
  }

  // attach logs and flags
  report.forEach(r => {
    r.logs = logsByItem[r.inventory_id] || [];
    r.low_stock = r.ending_balance <= r.minimum_quantity;
  });

  // totals
  const totals = report.reduce((acc, r) => {
    acc.total_beginning += r.beginning_balance;
    acc.total_receipts += r.receipts;
    acc.total_issues += r.issues;
    acc.total_adjustments += r.adjustments;
    acc.total_ending += r.ending_balance;
    acc.items += 1;
    return acc;
  }, { items: 0, total_beginning: 0, total_receipts: 0, total_issues: 0, total_adjustments: 0, total_ending: 0 });

  return { report, totals, period: { start, end }, generated_at: new Date().toISOString() };
}

function toCsvBuffer(report) {
  // CSV will contain items summary only: name,current_stock,beginning_stock,minimum_quantity
  const header = ['name','current_stock','beginning_stock','minimum_quantity'];
  const lines = [header.join(',')];
  report.forEach(r => {
    const row = [
      `"${String(r.name || '').replace(/"/g,'""')}"`,
      r.current_stock,
      r.beginning_stock,
      r.minimum_quantity || ''
    ];
    lines.push(row.join(','));
  });
  return Buffer.from(lines.join('\n'), 'utf8');
}

function toXlsxBuffer(report) {
  // Build two sheets: Items (name, current_stock, beginning_stock, minimum_quantity)
  // and Logs (inventory_id, item_name, created_at, change_amount, action, note)
  const itemsSheet = [ ['name','current_stock','beginning_stock','minimum_quantity'] ];
  report.forEach(r => {
    itemsSheet.push([
      r.name || '',
      r.current_stock ?? '',
      r.beginning_stock ?? '',
      r.minimum_quantity ?? ''
    ]);
  });

  const logsSheet = [ ['inventory_id','item_name','created_at','change_amount','action','note'] ];
  report.forEach(r => {
    const logs = r.logs || [];
    logs.forEach(l => {
      logsSheet.push([
        r.inventory_id,
        r.name || '',
        l.created_at?.toISOString ? l.created_at.toISOString() : String(l.created_at || ''),
        l.change_amount ?? l.qty_change ?? l.change ?? '',
        l.action ?? '',
        l.note ?? ''
      ]);
    });
  });

  const wb = XLSX.utils.book_new();
  const wsItems = XLSX.utils.aoa_to_sheet(itemsSheet);
  XLSX.utils.book_append_sheet(wb, wsItems, 'Items');
  const wsLogs = XLSX.utils.aoa_to_sheet(logsSheet);
  XLSX.utils.book_append_sheet(wb, wsLogs, 'Logs');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  return buf;
}

export default { generateQuarterlyReport, toCsvBuffer, toXlsxBuffer };
