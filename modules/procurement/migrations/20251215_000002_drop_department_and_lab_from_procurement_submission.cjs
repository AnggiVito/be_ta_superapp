/**
 * Drop textual columns department and lab from procurement_submission
 * Reversible: down will re-add the text columns (but won't restore original values)
 */

exports.up = (pgm) => {
  // Drop textual columns (if exist)
  pgm.dropColumns('procurement_submission', ['department', 'lab']);
};

exports.down = (pgm) => {
  // Recreate textual columns in case of rollback
  pgm.addColumns('procurement_submission', {
    department: { type: 'text', notNull: false },
    lab: { type: 'text', notNull: false }
  });
};
