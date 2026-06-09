-- Add color_hex column to filaments table for storing hex color codes
ALTER TABLE filaments ADD COLUMN IF NOT EXISTS color_hex text;

-- Add a comment to describe the column
COMMENT ON COLUMN filaments.color_hex IS 'Hex color code for the filament (e.g., #FF5733), can be null if unknown';
