// Document titles for the printable quote/invoice pages.
//
// Browsers derive the "Save as PDF" filename from document.title, so these
// titles are effectively the download filenames. They therefore say which
// document it is (quotation vs detailed quotation vs invoice), which job it
// belongs to, and when it was issued — instead of the tab-friendly but
// useless "3D Print Calculator".
//
// Quotation filenames are made unique by the quote reference (Q-YYYY-NNN,
// lib/quote-number.ts). Quotes without one (e.g. old share links) fall back
// to the creation date + time so two same-day saves still don't trigger the
// OS "replace existing file?" prompt. Invoices are already unique through
// their invoice number.

export const DEFAULT_DOCUMENT_TITLE = "3D Print Calculator"

/** Characters browsers/OSes reject (or silently mangle) in a filename. */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|#]/g

/** Filename-safe text: illegal characters dropped, whitespace collapsed. */
function clean(value: string): string {
  return value.replace(ILLEGAL_FILENAME_CHARS, " ").replace(/\s+/g, " ").trim()
}

/** Parses a stored timestamp, falling back to now when absent or invalid. */
function toDate(value?: string | null): Date {
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? new Date() : date
}

/** Local calendar date (YYYY-MM-DD) — not UTC, so a late-night quote keeps its local day. */
function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** Local time as "14h32" — filename-safe (colons are illegal) but still reads as a time. */
function localTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}h${minutes}`
}

/** Joins the non-empty parts of a filename with " - ". */
function join(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" - ")
}

/**
 * Title for a quotation document.
 *
 * `Quotation Q-2026-001 - Bracket v2`
 * `Detailed Quotation Q-2026-001 - Bracket v2`
 * `Quotation - Bracket v2 - 2026-07-31 14h32` (no reference — legacy/share fallback)
 */
export function quotationDocumentTitle(
  quote:
    | { quote_number?: string | null; quote_name?: string | null; created_at?: string | null }
    | null
    | undefined,
  variant: "simple" | "detailed",
): string {
  const label = variant === "detailed" ? "Detailed Quotation" : "Quotation"
  const number = quote?.quote_number ? clean(quote.quote_number) : null
  const name = quote?.quote_name ? clean(quote.quote_name) : null
  if (number) return join([`${label} ${number}`, name])
  const created = toDate(quote?.created_at)
  return join([label, name, `${localDate(created)} ${localTime(created)}`])
}

/**
 * Title for an invoice document.
 *
 * `Invoice INV-2026-001 - Bracket v2 - 2026-07-31`
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
  const number = quote?.invoice_number ? clean(quote.invoice_number) : null
  const name = quote?.quote_name ? clean(quote.quote_name) : null
  const issued = toDate(quote?.invoice_date ?? quote?.created_at)
  // The invoice number already makes the filename unique; without one, fall
  // back to the issue time so same-day invoices don't overwrite each other.
  const dateLabel = number ? localDate(issued) : `${localDate(issued)} ${localTime(issued)}`
  return join([number ? `Invoice ${number}` : "Invoice", name, dateLabel])
}

/**
 * Title for an order invoice document (the Orders feature's own invoices).
 *
 * `Invoice INV-2026-0001 - BMW Vent Pod`
 */
export function orderInvoiceDocumentTitle(
  invoice:
    | { invoice_number?: string | null; issue_date?: string | null }
    | null
    | undefined,
  orderTitle?: string | null,
): string {
  const number = invoice?.invoice_number ? clean(invoice.invoice_number) : null
  const name = orderTitle ? clean(orderTitle) : null
  const issued = toDate(invoice?.issue_date)
  const dateLabel = number ? localDate(issued) : `${localDate(issued)} ${localTime(issued)}`
  return join([number ? `Invoice ${number}` : "Invoice", name, dateLabel])
}
