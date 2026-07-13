"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Download, Loader2 } from "lucide-react"
import type { Quote } from "@/types/db"

export default function QuotePage() {
  const params = useParams()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [client, setClient] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadQuote() {
      const supabase = createClient()
      const { data, error } = await supabase.from("quotes").select("*").eq("id", params.id).single()

      if (error) {
        console.error("Error loading quote:", error)
      } else {
        setQuote(data)
        if (data.client_id) {
          const { data: clientData } = await supabase.from("clients").select("*").eq("id", data.client_id).single()
          if (clientData) {
            setClient(clientData)
          }
        }
      }
      setLoading(false)
    }
    loadQuote()
  }, [params.id])

  useEffect(() => {
    if (quote?.quote_name) {
      document.title = `${quote.quote_name} - Quotation`
    }
    return () => {
      document.title = "3D Print Calculator"
    }
  }, [quote?.quote_name])

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

  // Get the price with the selected margin from the stored value
  const marginPercentage = Number.parseFloat(quote.selected_margin || "0") / 100
  const marginMultiplier = marginPercentage > 0 ? 1 / (1 - marginPercentage) : 1

  const totalLandedCost = quote.landed_cost || 0
  const emergencyFeeCost = quote.is_emergency ? quote.emergency_fee || 0 : 0
  const isBusinessQuote = quote.quote_type === "business"
  // Honor the saved VAT toggle — quotes saved with "Include VAT" unchecked
  // must not grow a VAT line here. Legacy rows without the flag default to
  // VAT on (the historical behavior).
  const vatApplies = isBusinessQuote && quote.vat_enabled !== false

  // For target-price quotes the Total is the stored (authoritative) final_price.
  // Scale the breakdown by an effective multiplier derived from that total so the
  // lines reconcile to it (the rounded selected_margin drifts by a rounding cent).
  // Margin-mode quotes keep marginMultiplier exactly.
  const targetExVat =
    quote.final_price != null ? (vatApplies ? quote.final_price / 1.23 : quote.final_price) : null
  const displayMultiplier =
    targetExVat != null && totalLandedCost > 0
      ? (targetExVat - emergencyFeeCost) / totalLandedCost
      : marginMultiplier

  // Calculate Labor and Packaging with margin
  const laborCost = quote.labor_cost || 0
  const packagingShippingCost = (quote.packaging_cost || 0) + (quote.fuel_cost || 0)

  const laborWithMargin = laborCost * displayMultiplier
  const packagingWithMargin = packagingShippingCost * displayMultiplier

  // Get the total with margin (without emergency fee)
  const priceWithMargin = totalLandedCost * displayMultiplier

  const printingAndMaterialsWithMargin = priceWithMargin - laborWithMargin - packagingWithMargin

  const priceWithMarginAndEmergency = priceWithMargin + emergencyFeeCost

  // Add VAT for business quotes (23%)
  const recomputedVat = vatApplies ? priceWithMarginAndEmergency * 0.23 : 0
  const recomputedFinal = priceWithMarginAndEmergency + recomputedVat

  // Prefer the stored authoritative final_price (set for target-price quotes) over the
  // margin recompute. selected_margin is stored rounded to 0.1% and, for business+VAT
  // quotes, is derived without stripping VAT — so recomputing here would diverge from the
  // operator's entered total (and from what quote-history shows). Only fall back to the
  // recompute when no target price was stored (margin-mode quotes).
  const finalPrice = quote.final_price != null ? quote.final_price : recomputedFinal
  // For business quotes the stored final_price is VAT-inclusive, so back out the VAT
  // component (total - total/1.23) instead of re-applying 23% on top.
  const vatAmount =
    quote.final_price != null
      ? vatApplies
        ? quote.final_price - quote.final_price / 1.23
        : 0
      : recomputedVat

  return (
    <div className="min-h-screen print:min-h-0 bg-white font-sans text-slate-900">
      {/* Print button - hidden when printing */}
      <div className="print:hidden fixed top-4 right-4 z-50">
        <Button onClick={handlePrint} className="bg-slate-900 hover:bg-slate-700 text-white">
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </Button>
      </div>

      {/* Quotation Document */}
      <div className="max-w-3xl mx-auto px-8 py-16 print:py-10 print:px-0">
        {/* Header */}
        <header className="mb-14">
          <div className="flex items-baseline justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-3">Quotation</p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{quote.quote_name}</h1>
            </div>
            {quote.is_emergency && (
              <span className="shrink-0 text-[11px] uppercase tracking-widest text-red-600 border border-red-200 rounded-full px-3 py-1">
                Emergency order
              </span>
            )}
          </div>
          <div className="mt-4 flex gap-6 text-sm text-slate-400">
            <p>Issued {new Date(quote.created_at).toLocaleDateString()}</p>
            <p>Valid 30 days</p>
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
                € {printingAndMaterialsWithMargin.toFixed(2)}
              </p>
            </div>

            <div className="flex items-baseline justify-between gap-8 py-4">
              <div>
                <p className="text-slate-900">Labor</p>
                <p className="text-sm text-slate-400 mt-0.5">Assembly, post-processing, or design work</p>
              </div>
              <p className="tabular-nums text-slate-900 whitespace-nowrap">€ {laborWithMargin.toFixed(2)}</p>
            </div>

            <div className="flex items-baseline justify-between gap-8 py-4">
              <div>
                <p className="text-slate-900">Packaging, Shipping &amp; Transport</p>
                <p className="text-sm text-slate-400 mt-0.5">Packaging materials, courier, and transportation</p>
              </div>
              <p className="tabular-nums text-slate-900 whitespace-nowrap">€ {packagingWithMargin.toFixed(2)}</p>
            </div>

            {quote.is_emergency && emergencyFeeCost > 0 && (
              <div className="flex items-baseline justify-between gap-8 py-4">
                <div>
                  <p className="text-slate-900">Emergency Fee</p>
                  <p className="text-sm text-slate-400 mt-0.5">Urgent order surcharge</p>
                </div>
                <p className="tabular-nums text-slate-900 whitespace-nowrap">€ {emergencyFeeCost.toFixed(2)}</p>
              </div>
            )}

            {/* VAT - Only for business quotes that charged it */}
            {vatApplies && (
              <div className="flex items-baseline justify-between gap-8 py-4">
                <p className="text-slate-900">VAT (23%)</p>
                <p className="tabular-nums text-slate-900 whitespace-nowrap">€ {vatAmount.toFixed(2)}</p>
              </div>
            )}
          </div>

          {/* Total */}
          <div
            className="pdf-keep mt-6 bg-slate-900 text-white rounded-md px-6 py-5 flex items-baseline justify-between"
            style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
          >
            <span className="text-xs uppercase tracking-[0.2em] text-slate-300">Total</span>
            <span className="tabular-nums text-3xl font-semibold whitespace-nowrap">€ {finalPrice.toFixed(2)}</span>
          </div>
        </section>

        {/* Notes */}
        <section className="mb-12">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-4 pb-3 border-b border-slate-200">
            Notes
          </p>
          <ul className="text-sm text-slate-500 space-y-2 list-disc list-outside pl-4">
            <li>
              This quotation includes all costs associated with the 3D printing service, including materials, machine
              time, labor, packaging, and delivery.
            </li>
            <li>
              All costs include a {quote.selected_margin}% profit margin to cover business operations and overhead.
            </li>
            {vatApplies && (
              <li>VAT at 23% is included in the final price as per legal requirements for business transactions.</li>
            )}
            {quote.is_emergency && (
              <li className="text-red-600">
                Emergency order surcharge applied for expedited processing and priority handling.
              </li>
            )}
            <li>This quotation is valid for 30 days from the date of issue.</li>
          </ul>
        </section>

        {/* Footer */}
        <footer className="pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
          <p className="text-slate-500">Thank you for your business</p>
          <p className="mt-2">For questions about this quotation, please contact us with reference: {quote.quote_name}</p>
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
