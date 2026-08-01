-- Operator-only free-text note on quotes. Rendered exclusively in the
-- calculators and quote history; client-facing documents and the share-link
-- payload never read it.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS internal_notes TEXT;
