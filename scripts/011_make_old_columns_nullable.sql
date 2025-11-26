-- Remove NOT NULL constraints from old single-part columns
-- These are no longer used since we now store arrays in JSONB columns

ALTER TABLE quotes 
ALTER COLUMN part_name DROP NOT NULL,
ALTER COLUMN printer_name DROP NOT NULL,
ALTER COLUMN printer_id DROP NOT NULL;

-- Alternatively, we could drop these columns entirely if not needed:
-- ALTER TABLE quotes DROP COLUMN part_name;
-- ALTER TABLE quotes DROP COLUMN printer_name;
-- ALTER TABLE quotes DROP COLUMN printer_id;
