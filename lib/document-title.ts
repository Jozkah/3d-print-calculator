// Document titles for the printable quote/invoice pages.
//
// Browsers derive the "Save as PDF" filename from document.title, so these
// titles are effectively the download filenames. They therefore say which
// document it is (quotation vs detailed quotation vs invoice), which job it
// belongs to, and when it was issued — instead of the tab-friendly but
// useless "3D Print Calculator".

export const DEFAULT_DOCUMENT_TITLE = "3D Print Calculator"

/** Characters browsers/OSes reject (or silently mangle) in a filename. */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|#]/g

/** Filename-safe slug: illegal characters dropped, whitespace collapsed to "_". */
function slug(value: string): string {
  return value.replace(ILLEGAL_FILENAME_CHARS, " ").trim().replace(/\s+/g, "_")
}

/** ISO date (YYYY-MM-DD) for a stored timestamp, or today when absent/invalid. */
function isoDate(value?: string | null): string {
  const date = value ? new Date(value) : new Date()
  const safe = Number.isNaN(date.getTime()) ? new Date() : date
  return safe.toISOString().slice(0, 10)
}

/** Joins the non-empty parts of a filename with underscores. */
function join(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join("_")
}

/**
 * Title for a quotation document.
 *
 * `Quotation_Simple_Bracket-v2_2026-07-31`
 * `Quotation_Detailed_Bracket-v2_2026-07-31`
 */
export function quotationDocumentTitle(
  quote: { quote_name?: string | null; created_at?: string | null } | null | undefined,
  variant: "simple" | "detailed",
): string {
  const variantLabel = variant === "detailed" ? "Detailed" : "Simple"
  const name = quote?.quote_name ? slug(quote.quote_name) : null
  return join(["Quotation", variantLabel, name, isoDate(quote?.created_at)])
}

/**
 * Title for an invoice document.
 *
 * `Invoice_INV-0042_Bracket-v2_2026-07-31`
 */
export function invoiceDocumentTitle(
  quote:
    | {
        invoice_number?: string | null
        invoice_date?: string | null
        quote_name?: string | null
        created_at?: string | null
      }
    | null
    | undefined,
): string {
  const number = quote?.invoice_number ? slug(quote.invoice_number) : null
  const name = quote?.quote_name ? slug(quote.quote_name) : null
  return join(["Invoice", number, name, isoDate(quote?.invoice_date ?? quote?.created_at)])
}
