/**
 * Migration: 2026-05-29
 *
 * Add lab category to rooms (Class Lab, Computer Lab, Exam Lab).
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS category VARCHAR(32);

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rooms_category_check'
      ) THEN
        ALTER TABLE rooms
          ADD CONSTRAINT rooms_category_check
          CHECK (
            category IS NULL OR category IN (
              'class_lab', 'computer_lab', 'exam_lab'
            )
          );
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_rooms_category ON rooms(category);

    COMMENT ON COLUMN rooms.category IS
      'Lab category: class_lab, computer_lab, or exam_lab';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_rooms_category;

    ALTER TABLE rooms
      DROP CONSTRAINT IF EXISTS rooms_category_check;

    ALTER TABLE rooms
      DROP COLUMN IF EXISTS category;
  `);
};
