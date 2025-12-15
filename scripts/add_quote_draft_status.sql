-- Add is_draft column to quotes table to support saving drafts
ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;

-- Add an index for better query performance
CREATE INDEX IF NOT EXISTS idx_quotes_is_draft ON quotes(is_draft);
