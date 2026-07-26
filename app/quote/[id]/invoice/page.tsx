"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Download, Loader2 } from "lucide-react"
import { formatMoney } from "@/lib/format"
import { CompanyLetterhead, issuerContactLine } from "@/components/quotation-document"
import type { GlobalSettings, Quote } from "@/types/db"

// Invoice document for a saved quote. Clones the standard quotation layout
// (and its exact price math) but is titled INVOICE and carries invoice
// metadata: a sequential per-year invoice number (INV-YYYY-NNN, minted from
// the local "counters" table on first visit), the invoice date, a due date
// (+14 days by default) and the paid flag.

const DUE_DAYS = 14

/**
 * Mint the next sequential invoice number for the current year using the
 * counters table ("3dpc:counters" in localStorage).
 */
async function mintInvoiceNumber(): Promise<{ invoice_number: string; invoice_date: string; due_date: string }> {
  const supabase = createClient()
  const year = new Date().getFullYear()
  const key = `invoice-${year}`
  const { data: counter } = await supabase.from("counters").select("*").eq("key", key).maybeSingle()
  let next = 1
  if (counter) {
    next = (counter.value || 0) + 1
    await supabase.from("counters").update({ value: next }).eq("id", counter.id)
  } else {
    await supabase.from("counters").insert([{ key, value: next }])
  }
  const invoiceDate = new Date()
  const dueDate = new Date(invoiceDate.getTime() + DUE_DAYS * 86400000)
  return {
    invoice_number: `INV-${year}-${String(next).padStart(3, "0")}`,
    invoice_date: invoiceDate.toISOString(),
    due_date: dueDate.toISOString(),
  }
}

export default function InvoicePage() {
  const params = useParams()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [client, setClient] = useState<any>(null)
  const [settings, setSettings] = useState<GlobalSettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadQuote() {
      const supabase = createClient()
      const { data, error } = await supabase.from("quotes").select("*").eq("id", params.id).single()

      if (error || !data) {
        console.error("Error loading quote:", error)
        setLoading(false)
        return
      }

      let quoteRow: Quote = data
      // First visit: mint the invoice number + dates and persist them onto the
      // quote row so the invoice stays stable on every later view.
      if (!quoteRow.invoice_number) {
        const minted = await mintInvoiceNumber()
        await supabase.from("quotes").update(minted).eq("id", quoteRow.id)
        quoteRow = { ...quoteRow, ...minted }
      }
      setQuote(quoteRow)

      if (quoteRow.client_id) {
        const { data: clientData } = await supabase.from("clients").select("*").eq("id", quoteRow.client_id).single()
        if (clientData) setClient(clientData)
      }

      const { data: settingsData } = await supabase.from("global_settings").select("*").limit(1).maybeSingle()
      setSettings(settingsData ?? null)
      setLoading(false)
    }
    loadQuote()
  }, [params.id])

  useEffect(() => {
    if (quote?.invoice_number) {
      document.title = `${quote.invoice_number} - Invoice`
    }
    return () => {
      document.title = "3D Print Calculator"
    }
  }, [quote?.invoice_number])

  function handlePrint() {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-slate-500">Quote not found</p>
      </div>
    )
  }

  // --- Price math: identical to the standard quotation page -----------------
  const marginPercentage = Number.parseFloat(quote.selected_margin || "0") / 100
  const marginMultiplier = marginPercentage > 0 ? 1 / (1 - marginPercentage) : 1

  const totalLandedCost = quote.landed_cost || 0
  const emergencyFeeCost = quote.is_emergency ? quote.emergency_fee || 0 : 0
  const isBusinessQuote = quote.quote_type === "business"
  // Honor the saved VAT toggle — quotes saved with "Include VAT" unchecked
  // must not grow a VAT line here. Legacy rows without the flag default to
  // VAT on (the historical behavior).
  const vatApplies = isBusinessQuote && quote.vat_enabled !== false
  // Render with the rate the quote was priced at; legacy rows without the
  // field were all quoted at 23%.
  const vatRate = quote.vat_rate ?? 0.23
  const vatPercentLabel = Math.round(vatRate * 10000) / 100
  const currencySymbol = settings?.currency_symbol || "€"
  const money = (n: number) => formatMoney(n, currencySymbol)

  // For target-price quotes the Total is the stored (authoritative) final_price.
  // Scale the breakdown by an effective multiplier derived from that total so the
  // lines reconcile to it (the rounded selected_margin drifts by a rounding cent).
  // Margin-mode quotes keep marginMultiplier exactly.
  const targetExVat =
    quote.final_price != null ? (vatApplies ? quote.final_price / (1 + vatRate) : quote.final_price) : null
  const displayMultiplier =
    targetExVat != null && totalLandedCost > 0
      ? (targetExVat - emergencyFeeCost) / totalLandedCost
      : marginMultiplier

  const laborCost = quote.labor_cost || 0
  const packagingShippingCost = (quote.packaging_cost || 0) + (quote.fuel_cost || 0)

  const laborWithMargin = laborCost * displayMultiplier
  const packagingWithMargin = packagingShippingCost * displayMultiplier

  const priceWithMargin = totalLandedCost * displayMultiplier
  const printingAndMaterialsWithMargin = priceWithMargin - laborWithMargin - packagingWithMargin
  const priceWithMarginAndEmergency = priceWithMargin + emergencyFeeCost

  const recomputedVat = vatApplies ? priceWithMarginAndEmergency * vatRate : 0
  const recomputedFinal = priceWithMarginAndEmergency + recomputedVat

  // Prefer the stored authoritative final_price (set for target-price quotes)
  // over the margin recompute — same rule as the quotation page.
  const finalPrice = quote.final_price != null ? quote.final_price : recomputedFinal
  const vatAmount =
    quote.final_price != null
      ? vatApplies
        ? quote.final_price - quote.final_price / (1 + vatRate)
        : 0
      : recomputedVat
  // ---------------------------------------------------------------------------

  const isPaid = Boolean(quote.paid_at)
  const invoiceDate = quote.invoice_date ? new Date(quote.invoice_date) : new Date(quote.created_at)
  const dueDate = quote.due_date
    ? new Date(quote.due_date)
    : new Date(invoiceDate.getTime() + DUE_DAYS * 86400000)
  const contactLine = issuerContactLine(settings)

  return (
    <div className="min-h-screen print:min-h-0 bg-white font-sans text-slate-900">
      {/* Print button - hidden when printing */}
      <div className="print:hidden fixed top-4 right-4 z-50">
        <Button onClick={handlePrint} className="bg-slate-900 hover:bg-slate-700 text-white">
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </Button>
      </div>

      {/* Invoice Document */}
      <div className="max-w-3xl mx-auto px-8 py-16 print:py-10 print:px-0">
        {/* Letterhead (renders nothing when business identity is unset) */}
        <CompanyLetterhead settings={settings} />

        {/* Header */}
        <header className="mb-14">
          <div className="flex items-baseline justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-3">Invoice</p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{quote.invoice_number}</h1>
              <p className="mt-2 text-sm text-slate-500">{quote.quote_name}</p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-2">
              {isPaid ? (
                <span
                  className="text-[11px] uppercase tracking-widest text-green-700 border border-green-300 bg-green-50 rounded-full px-3 py-1"
                  style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
                >
                  Paid
                </span>
              ) : (
                <span className="text-[11px] uppercase tracking-widest text-slate-500 border border-slate-200 rounded-full px-3 py-1">
                  Unpaid
                </span>
              )}
              {quote.is_emergency && (
                <span className="text-[11px] uppercase tracking-widest text-red-600 border border-red-200 rounded-full px-3 py-1">
                  Emergency order
                </span>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-6 text-sm text-slate-400">
            <p>Invoice date {invoiceDate.toLocaleDateString()}</p>
            <p>Due {dueDate.toLocaleDateString()}</p>
            {isPaid && quote.paid_at && <p>Paid on {new Date(quote.paid_at).toLocaleDateString()}</p>}
          </div>
        </header>

        {/* Bill To */}
        {client && (
          <section className="mb-14">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-3">Bill To</p>
            <p className="font-semibold text-slate-900">{client.name}</p>
            <div className="mt-1 text-sm text-slate-500 space-y-0.5">
              {client.email && <p>{client.email}</p>}
              {client.phone && <p>{client.phone}</p>}
              {client.address && <p className="whitespace-pre-line">{client.address}</p>}
            </div>
          </section>
        )}

        {/* Cost Breakdown */}
        <section className="mb-12">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-4 pb-3 border-b border-slate-200">
            Cost Breakdown
          </p>

          <div className="divide-y divide-slate-100">
            <div className="flex items-baseline justify-between gap-8 py-4">
              <div>
                <p className="text-slate-900">3D Printing &amp; Materials</p>
                <p className="text-sm text-slate-400 mt-0.5">Printing time, machine cost and material usage</p>
              </div>
              <p className="tabular-nums text-slate-900 whitespace-nowrap">
                {money(printingAndMaterialsWithMargin)}
              </p>
            </div>

            <div className="flex items-baseline justify-between gap-8 py-4">
              <div>
                <p className="text-slate-900">Labor</p>
                <p className="text-sm text-slate-400 mt-0.5">Assembly, post-processing, or design work</p>
              </div>
              <p className="tabular-nums text-slate-900 whitespace-nowrap">{money(laborWithMargin)}</p>
            </div>

            <div className="flex items-baseline justify-between gap-8 py-4">
              <div>
                <p className="text-slate-900">Packaging, Shipping &amp; Transport</p>
                <p className="text-sm text-slate-400 mt-0.5">Packaging materials, courier, and transportation</p>
              </div>
              <p className="tabular-nums text-slate-900 whitespace-nowrap">{money(packagingWithMargin)}</p>
            </div>

            {quote.is_emergency && emergencyFeeCost > 0 && (
              <div className="flex items-baseline justify-between gap-8 py-4">
                <div>
                  <p className="text-slate-900">Emergency Fee</p>
                  <p className="text-sm text-slate-400 mt-0.5">Urgent order surcharge</p>
                </div>
                <p className="tabular-nums text-slate-900 whitespace-nowrap">{money(emergencyFeeCost)}</p>
              </div>
            )}

            {/* VAT - Only for business quotes that charged it */}
            {vatApplies && (
              <div className="flex items-baseline justify-between gap-8 py-4">
                <p className="text-slate-900">VAT ({vatPercentLabel}%)</p>
                <p className="tabular-nums text-slate-900 whitespace-nowrap">{money(vatAmount)}</p>
              </div>
            )}
          </div>

          {/* Total */}
          <div
            className="pdf-keep mt-6 bg-slate-900 text-white rounded-md px-6 py-5 flex items-baseline justify-between"
            style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
          >
            <span className="text-xs uppercase tracking-[0.2em] text-slate-300">
              {isPaid ? "Total (paid)" : "Total due"}
            </span>
            <span className="tabular-nums text-3xl font-semibold whitespace-nowrap">{money(finalPrice)}</span>
          </div>
        </section>

        {/* Notes */}
        <section className="mb-12">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-4 pb-3 border-b border-slate-200">
            Notes
          </p>
          <ul className="text-sm text-slate-500 space-y-2 list-disc list-outside pl-4">
            <li>
              This invoice covers all costs associated with the 3D printing service, including materials, machine
              time, labor, packaging, and delivery.
            </li>
            {vatApplies && (
              <li>
                VAT at {vatPercentLabel}% is included in the final price as per legal requirements for business
                transactions.
              </li>
            )}
            {quote.is_emergency && (
              <li className="text-red-600">
                Emergency order surcharge applied for expedited processing and priority handling.
              </li>
            )}
            {!isPaid && <li>Payment is due by {dueDate.toLocaleDateString()}.</li>}
          </ul>
        </section>

        {/* Footer */}
        <footer className="pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
          <p className="text-slate-500">Thank you for your business</p>
          <p className="mt-2">
            For questions about this invoice, please contact us
            {contactLine ? ` at ${contactLine}` : ""} with reference: {quote.invoice_number}
          </p>
        </footer>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          html,
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
            background: #fff;
          }

          @page {
            size: A4;
            margin: 14mm;
          }

          /* Let tall content flow onto additional pages instead of being clipped. */
          table,
          tbody,
          section,
          div {
            break-inside: auto;
            page-break-inside: auto;
          }

          /* But never split an individual row, list item, heading or the
             total bar across a page boundary. */
          tr,
          thead,
          li,
          header,
          .pdf-keep,
          .divide-y > * {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Repeat table column headers at the top of each printed page. */
          thead {
            display: table-header-group;
          }

          h1,
          h2,
          h3 {
            break-after: avoid;
            page-break-after: avoid;
          }
        }
      `}</style>
    </div>
  )
}
