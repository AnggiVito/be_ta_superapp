-- Store schedule times as WIB wall-clock (same as Excel), not timestamptz.
ALTER TABLE schedules
  ALTER COLUMN start_time TYPE timestamp without time zone
  USING (start_time AT TIME ZONE 'Asia/Jakarta');

ALTER TABLE schedules
  ALTER COLUMN end_time TYPE timestamp without time zone
  USING (end_time AT TIME ZONE 'Asia/Jakarta');

ALTER TABLE schedule_slots
  ALTER COLUMN start_time TYPE timestamp without time zone
  USING (start_time AT TIME ZONE 'Asia/Jakarta');

ALTER TABLE schedule_slots
  ALTER COLUMN end_time TYPE timestamp without time zone
  USING (end_time AT TIME ZONE 'Asia/Jakarta');

COMMENT ON COLUMN schedules.start_time IS 'Waktu mulai jadwal (WIB wall-clock, sama seperti Excel)';
COMMENT ON COLUMN schedules.end_time IS 'Waktu akhir jadwal (WIB wall-clock, sama seperti Excel)';
