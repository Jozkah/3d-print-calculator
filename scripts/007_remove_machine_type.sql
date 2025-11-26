-- Remove machine_type column from printers table
ALTER TABLE printers DROP COLUMN IF EXISTS machine_type;
