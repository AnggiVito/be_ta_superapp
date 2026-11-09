/**
 * Retire operational session assistants table and approval/bypass columns
 * Part of #133: Conduct tidak lagi mengelola assignment asisten atau approval
 * lifecycle. Sumber asisten = Registration schedule_assistants; session auto-approved.
 */

exports.up = (pgm) => {
  pgm.dropTable('practicum_operational_session_assistants', { ifExists: true });

  pgm.dropColumns(
    'practicum_operational_sessions',
    [
      'approval_requested_at',
      'approval_requested_note',
      'approved_at',
      'approved_by',
      'rejected_at',
      'rejected_by',
      'rejected_reason',
      'bypass_evidence_file_path',
      'bypass_evidence_file_name',
      'bypass_evidence_mime_type',
      'bypass_evidence_size',
      'bypassed_by',
      'bypassed_at',
      'bypass_reason',
    ],
    { ifExists: true }
  );
};

exports.down = (pgm) => {
  pgm.addColumns('practicum_operational_sessions', {
    approval_requested_at: { type: 'timestamptz' },
    approval_requested_note: { type: 'text' },
    approved_at: { type: 'timestamptz' },
    approved_by: { type: 'varchar(255)' },
    rejected_at: { type: 'timestamptz' },
    rejected_by: { type: 'varchar(255)' },
    rejected_reason: { type: 'text' },
    bypass_evidence_file_path: { type: 'text' },
    bypass_evidence_file_name: { type: 'varchar(255)' },
    bypass_evidence_mime_type: { type: 'varchar(100)' },
    bypass_evidence_size: { type: 'integer' },
    bypassed_by: { type: 'varchar(255)' },
    bypassed_at: { type: 'timestamptz' },
    bypass_reason: { type: 'text' },
  });

  pgm.createTable('practicum_operational_session_assistants', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    operational_session_id: {
      type: 'uuid',
      notNull: true,
      references: 'practicum_operational_sessions(id)',
      onDelete: 'CASCADE',
    },
    assistant_user_id: { type: 'varchar(255)', notNull: true },
    assistant_code: { type: 'varchar(50)' },
    assistant_name: { type: 'varchar(255)' },
    class_group: { type: 'varchar(50)' },
    assigned_by: { type: 'varchar(255)', notNull: true },
    assigned_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    deleted_at: { type: 'timestamptz' },
  });

  pgm.createIndex(
    'practicum_operational_session_assistants',
    ['operational_session_id'],
    { name: 'idx_operational_session_assistants_session_id' }
  );
  pgm.createIndex(
    'practicum_operational_session_assistants',
    ['operational_session_id', 'assistant_user_id'],
    {
      name: 'uniq_operational_session_assistant_active',
      unique: true,
      where: 'deleted_at IS NULL',
    }
  );
};
