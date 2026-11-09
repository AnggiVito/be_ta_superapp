/**
 * Migration: 2025-12-06
 *
 * Update comment untuk booking_date agar jelas bahwa ini menyimpan tanggal schedule,
 * bukan tanggal booking dibuat. Constraint sudah benar karena booking_date sekarang
 * menyimpan tanggal schedule (dari slot.start_time).
 */

exports.up = (pgm) => {
  pgm.sql(`
    COMMENT ON COLUMN schedule_bookings.booking_date IS 'Tanggal jadwal schedule (dari slot.start_time), digunakan untuk validasi 1 slot per hari jadwal';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    COMMENT ON COLUMN schedule_bookings.booking_date IS 'Tanggal saat booking (untuk validasi 1 slot per hari)';
  `);
};

