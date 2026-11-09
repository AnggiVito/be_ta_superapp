const modules = [
  { week: 7, sequence: 1, name: 'Modul 1 - Use Case Diagram' },
  { week: 8, sequence: 2, name: 'Modul 2 - Activity Diagram' },
  { week: 9, sequence: 3, name: 'Modul 3 - Sequence Diagram' },
  { week: 10, sequence: 4, name: 'Modul 4 - Class Diagram' },
];

const classes = [
  { group: 'SI-47-01', day: 'monday', shift: 'SHIFT-1', start: '08:00', end: '11:00', venue: 'Lab EAD - R1', assistants: ['user-asisten-1', 'user-asisten-2'] },
  { group: 'SI-47-02', day: 'monday', shift: 'SHIFT-2', start: '13:00', end: '16:00', venue: 'Lab EAD - R2', assistants: ['user-asisten-2'] },
  { group: 'SI-47-03', day: 'tuesday', shift: 'SHIFT-1', start: '08:00', end: '11:00', venue: 'Lab EAD - R1', assistants: ['user-asisten-3'] },
  { group: 'SI-47-04', day: 'tuesday', shift: 'SHIFT-2', start: '13:00', end: '16:00', venue: 'Lab EAD - R2', assistants: ['user-asisten-2'] },
  { group: 'SI-47-05', day: 'wednesday', shift: 'SHIFT-1', start: '08:00', end: '11:00', venue: 'Lab EAD - R1', assistants: ['user-asisten-4'] },
  { group: 'SI-47-06', day: 'wednesday', shift: 'SHIFT-2', start: '13:00', end: '16:00', venue: 'Lab EAD - R2', assistants: ['user-asisten-1'] },
  { group: 'SI-47-07', day: 'thursday', shift: 'SHIFT-1', start: '08:00', end: '11:00', venue: 'Lab EAD - R1', assistants: ['user-asisten-5'] },
  { group: 'SI-47-08', day: 'thursday', shift: 'SHIFT-2', start: '13:00', end: '16:00', venue: 'Lab EAD - R2', assistants: ['user-asisten-3'] },
  { group: 'SI-47-09', day: 'friday', shift: 'SHIFT-1', start: '08:00', end: '11:00', venue: 'Lab EAD - R1', assistants: ['user-asisten-2', 'user-asisten-4'] },
  { group: 'SI-47-10', day: 'friday', shift: 'SHIFT-2', start: '13:00', end: '16:00', venue: 'Lab EAD - R2', assistants: ['user-asisten-1', 'user-asisten-5'] },
  { group: 'SI-47-INT', day: 'saturday', shift: 'SHIFT-1', start: '08:00', end: '11:00', venue: 'Lab EAD - R1', assistants: ['user-asisten-2', 'user-asisten-5'] },
];

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlTextArray(values) {
  return `ARRAY[${values.map(sqlString).join(',')}]`;
}

exports.up = (pgm) => {
  const rows = [];

  for (const cls of classes) {
    for (const mod of modules) {
      rows.push(`(
        '2026-genap',
        'Analisis Perancangan Sistem Informasi',
        ${sqlString(mod.name)},
        ${sqlString(cls.group)},
        ${sqlString(cls.day)},
        ${sqlString(cls.shift)},
        ${sqlString(cls.start)},
        ${sqlString(cls.end)},
        ${sqlString(cls.venue)},
        36,
        ${mod.week},
        ${mod.sequence},
        ${sqlTextArray(cls.assistants)},
        'final'
      )`);
    }
  }

  pgm.sql(`
    INSERT INTO practicum_plot_schedules (
      semester_code,
      practicum_name,
      module_name,
      class_group,
      day_of_week,
      shift_code,
      start_time,
      end_time,
      venue,
      capacity,
      week_number,
      module_sequence,
      assistants,
      status
    )
    VALUES
      ${rows.join(',\n')};
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM practicum_plot_schedules
    WHERE semester_code = '2026-genap'
      AND practicum_name = 'Analisis Perancangan Sistem Informasi';
  `);
};
