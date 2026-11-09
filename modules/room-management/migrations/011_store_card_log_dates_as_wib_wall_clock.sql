-- Store card access windows as WIB wall-clock (same as Excel), not timestamptz.
ALTER TABLE card_logs
  ALTER COLUMN start_date TYPE timestamp without time zone
  USING (start_date AT TIME ZONE 'Asia/Jakarta');

ALTER TABLE card_logs
  ALTER COLUMN end_date TYPE timestamp without time zone
  USING (end_date AT TIME ZONE 'Asia/Jakarta');

COMMENT ON COLUMN card_logs.start_date IS 'Mulai akses kartu (WIB wall-clock, sama seperti Excel)';
COMMENT ON COLUMN card_logs.end_date IS 'Akhir akses kartu (WIB wall-clock, sama seperti Excel)';
