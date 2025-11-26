-- Add brand, type, and color columns to filaments table
ALTER TABLE filaments 
ADD COLUMN IF NOT EXISTS brand TEXT,
ADD COLUMN IF NOT EXISTS type TEXT,
ADD COLUMN IF NOT EXISTS color TEXT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_filaments_brand ON filaments(brand);
CREATE INDEX IF NOT EXISTS idx_filaments_type ON filaments(type);
CREATE INDEX IF NOT EXISTS idx_filaments_color ON filaments(color);
