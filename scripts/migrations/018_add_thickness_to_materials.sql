-- Add thickness column to filaments table for materials
ALTER TABLE filaments ADD COLUMN IF NOT EXISTS thickness text;

-- Update existing materials to have a default thickness if needed
UPDATE filaments SET thickness = 'Standard' WHERE material_type = 'material' AND thickness IS NULL;
