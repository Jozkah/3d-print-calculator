-- Add has_enclosure column to printers table
ALTER TABLE printers
ADD COLUMN IF NOT EXISTS has_enclosure boolean DEFAULT false;

COMMENT ON COLUMN printers.has_enclosure IS 'When true, this printer has an enclosure and will not accept filaments that require heating/drying';
