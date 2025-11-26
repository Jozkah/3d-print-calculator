-- Make price_per_kg nullable to allow filaments without prices
ALTER TABLE filaments 
ALTER COLUMN price_per_kg DROP NOT NULL;
