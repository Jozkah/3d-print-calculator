-- Add owner_a_receives and owner_b_receives columns to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS owner_a_receives NUMERIC DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS owner_b_receives NUMERIC DEFAULT 0;
