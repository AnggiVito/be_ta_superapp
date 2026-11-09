/**
 * Migration: 2025-01-01
 * 
 * Add booking_id column to qr_attendance_sessions table
 * Related: Feature - Individual Mentoring QR Generation
 * Description: Add booking_id column to support individual mentoring schema where QR is generated per booking slot
 * 
 * NULL = default schema (QR per jadwal)
 * NOT NULL = individual mentoring schema (QR per booking slot)
 */

exports.up = (pgm) => {
  // Add booking_id column (nullable, for individual mentoring)
  pgm.addColumn('qr_attendance_sessions', {
    booking_id: {
      type: 'uuid',
      notNull: false,
    },
  });

  // Add comment for documentation
  pgm.sql(`
    COMMENT ON COLUMN qr_attendance_sessions.booking_id IS 'Reference ke schedule_bookings.id untuk individual mentoring. NULL untuk skema default (per jadwal), NOT NULL untuk individual mentoring (per booking slot)';
  `);

  // Add index for better query performance on booking-based queries
  // This helps when filtering QR sessions by booking_id
  pgm.createIndex('qr_attendance_sessions', 'booking_id', {
    name: 'idx_qr_sessions_booking',
    where: 'booking_id IS NOT NULL',
  });
};

exports.down = (pgm) => {
  // Drop index first
  pgm.dropIndex('qr_attendance_sessions', 'idx_qr_sessions_booking');

  // Drop column
  pgm.dropColumn('qr_attendance_sessions', 'booking_id');
};

