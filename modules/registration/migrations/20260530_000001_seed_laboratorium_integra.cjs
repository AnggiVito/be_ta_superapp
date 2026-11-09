/** Master laboratory for TPA / laboran procurement submissions. */

exports.up = (pgm) => {

  pgm.sql(`

    INSERT INTO study_programs (id, name)

    SELECT gen_random_uuid(), 'URUSAN LABORATORIUM/BENGKEL/STUDIO (FRI)'

    WHERE NOT EXISTS (

      SELECT 1 FROM study_programs

      WHERE lower(trim(name)) = lower('URUSAN LABORATORIUM/BENGKEL/STUDIO (FRI)')

    );



    INSERT INTO laboratories (id, study_program_id, name)

    SELECT gen_random_uuid(), sp.id, 'Laboratorium Integra'

    FROM study_programs sp

    WHERE lower(trim(sp.name)) = lower('URUSAN LABORATORIUM/BENGKEL/STUDIO (FRI)')

      AND NOT EXISTS (

        SELECT 1 FROM laboratories l

        WHERE lower(trim(l.name)) IN ('laboratorium integra', 'lab integra')

           OR lower(l.name) LIKE '%integra%'

      )

    LIMIT 1;

  `);

};



exports.down = (pgm) => {

  pgm.sql(`

    DELETE FROM laboratories

    WHERE lower(trim(name)) = 'laboratorium integra';



    DELETE FROM study_programs

    WHERE lower(trim(name)) = lower('URUSAN LABORATORIUM/BENGKEL/STUDIO (FRI)')

      AND NOT EXISTS (

        SELECT 1 FROM laboratories l

        WHERE l.study_program_id = study_programs.id

          AND lower(trim(l.name)) <> 'laboratorium integra'

      );

  `);

};

