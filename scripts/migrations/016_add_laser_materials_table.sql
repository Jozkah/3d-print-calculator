-- Create laser materials table for laser engraving/cutting/stickers
CREATE TABLE IF NOT EXISTS laser_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  material_type TEXT NOT NULL, -- PLYWOOD, BASSWOOD, SAPELE, etc.
  price_per_unit NUMERIC, -- Can be null for items without price yet
  unit TEXT DEFAULT 'sheet', -- unit of measurement
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_laser_materials_type ON laser_materials(material_type);

-- Insert default laser materials
INSERT INTO laser_materials (name, material_type, price_per_unit, unit) VALUES
  ('Plywood Sheet', 'PLYWOOD', NULL, 'sheet'),
  ('Basswood Sheet', 'BASSWOOD', NULL, 'sheet'),
  ('Sapele Sheet', 'SAPELE', NULL, 'sheet'),
  ('Black Walnut Sheet', 'BLACK WALNUT', NULL, 'sheet'),
  ('Bamboo Sheet', 'BAMBOO', NULL, 'sheet'),
  ('Birch Sheet', 'BIRCH', NULL, 'sheet'),
  ('Cork Sheet', 'CORK', NULL, 'sheet'),
  ('Vinyl Roll', 'VINYL', NULL, 'roll'),
  ('Custom Item', 'CUSTOM ITEM', NULL, 'unit')
ON CONFLICT DO NOTHING;
