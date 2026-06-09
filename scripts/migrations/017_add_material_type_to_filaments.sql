-- Add material_type column to filaments table to distinguish between filaments and laser materials
ALTER TABLE filaments ADD COLUMN IF NOT EXISTS material_type TEXT DEFAULT 'filament';

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_filaments_material_type ON filaments(material_type);

COMMENT ON COLUMN filaments.material_type IS 'Type of material: filament for 3D printing, material for laser cutting/engraving';
