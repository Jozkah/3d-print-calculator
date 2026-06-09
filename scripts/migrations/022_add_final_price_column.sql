-- Add final_price column to quotes table for storing custom target prices
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS final_price numeric;

-- Add a comment to describe the column
COMMENT ON COLUMN quotes.final_price IS 'Stores the actual custom target price when using target price mode instead of percentage-based margin';
