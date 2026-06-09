-- Add size field for materials (dimensions like 20x30, A4, etc.)
ALTER TABLE filaments ADD COLUMN IF NOT EXISTS size TEXT;

-- Add comment
COMMENT ON COLUMN filaments.size IS 'Size/dimensions of the material (e.g., 20x30cm, A4, etc.)';
