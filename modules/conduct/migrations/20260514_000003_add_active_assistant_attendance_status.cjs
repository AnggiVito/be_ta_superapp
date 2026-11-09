exports.up = (pgm) => {
  pgm.addColumns('practicum_operational_session_active_assistants', {
    attendance_status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'present',
    },
  });

  pgm.addConstraint(
    'practicum_operational_session_active_assistants',
    'chk_active_assistant_attendance_status',
    { check: "attendance_status IN ('present','late')" }
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint(
    'practicum_operational_session_active_assistants',
    'chk_active_assistant_attendance_status',
    { ifExists: true }
  );

  pgm.dropColumns('practicum_operational_session_active_assistants', ['attendance_status'], {
    ifExists: true,
  });
};
