// Simple model for procurement_submission table: column list and helper
export const columns = [
  'requester_name',
  'requester_role',
  'requester_id',
  'study_program_id',
  'lab_id',
  'item_name',
  'specification',
  'quantity_text',
  'unit_price_text',
  'total_price',
  'purpose',
  'status',
  // 'created_by' removed in favor of requester_id
];

export function buildInsert(values) {
  // values is an array matching columns order (except id/created_at)
  const cols = columns.join(', ');
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO procurement_submission (${cols}) VALUES (${placeholders}) RETURNING *`;
  return { sql, params: values };
}
