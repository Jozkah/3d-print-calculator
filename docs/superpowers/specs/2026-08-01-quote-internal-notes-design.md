# Quote Internal Notes — Design

Date: 2026-08-01
Status: Approved

## Goal

Operators can attach free-text internal notes to a quote for future clarification.
Notes must NEVER appear in any client-facing output: standard quotation document,
detailed quotation, invoice, shared view link, or any PDF printed from those pages.

## Data Model

- Add `internal_notes?: string` to `Quote` in `types/db.ts`.
- Optional field: absent on legacy rows; every read site treats absent/empty as "no note".
- Single free-text value (no timestamped log).

## Operator UI

### Calculators (excel-calculator, laser-calculator, uv-calculator)

- "Internal Notes" `Textarea` in the Quote Details area, near Client Name / Distance.
- Placeholder communicates that the client never sees this text.
- Value is saved with the quote on every save path and restored when a quote is
  reopened for editing.

### Quote History (`components/quote-history.tsx`)

- Full note text rendered in the quote card (muted style with a small "Internal"
  label) whenever the note is non-empty. Quote history is an operator-only page.
- Note text is added to the search haystack so searching finds quotes by note.
- Duplicating a quote carries the note into the copy.
- Saving a quote as a template EXCLUDES `internal_notes` — notes are
  quote-specific, templates are reusable structure.

## Client-Facing Surfaces — No Changes

The guarantee is structural, not filter-based:

- `components/quotation-document.tsx`, `app/quote/[id]/detailed/page.tsx`,
  `app/quote/[id]/invoice/page.tsx` render only explicitly chosen fields; the new
  field is invisible there by default. They are not modified.
- The share link builder (`handleCopyShareLink` in `quote-history.tsx`) serializes
  an explicit allowlist of quote fields into the URL fragment; `internal_notes` is
  not added to that allowlist, so it cannot leak into shared URLs.

## Error Handling

No new failure modes: the field is plain optional text persisted with the existing
quote save flow. Empty string and absent are equivalent.

## Testing

No pricing logic is touched; repo unit tests cover pricing libs only. Verification
is the production build (`npm run build`) plus manual check of the three
calculators and quote history.
