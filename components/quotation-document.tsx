"use client"

import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { formatMoney } from "@/lib/format"
import type { GlobalSettings, Quote } from "@/types/db"

// The standard quotation document, shared by the saved-quote page
// (app/quote/[id]) and the self-contained share view (app/quote/view). Pure
// presentation: data loading, ?print=1 behavior and document.title stay in
// the pages.

/** True when any business-identity field is configured in settings. */
export function hasCompanyIdentity(settings: GlobalSettings | null | undefined): boolean {
  if (!settings) return false
  return Boolean(
    settings.company_name ||
      settings.company_logo ||
      settings.company_address ||
      settings.company_email ||
      settings.company_phone ||
      settings.company_tax_id,
  )
}

/** "email · phone" issuer contact line for document footers, or null when unset. */
export function issuerContactLine(settings: GlobalSettings | null | undefined): string | null {
  const parts = [settings?.company_email, settings?.company_phone].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : null
}

/**
 * Letterhead block (logo + name + address/email/phone/tax id) rendered at the
 * top of quote/invoice documents. Renders nothing when no identity is set, so
 * documents gracefully keep their original layout.
 */
export function CompanyLetterhead({ settings }: { settings: GlobalSettings | null | undefined }) {
  if (!hasCompanyIdentity(settings)) return null
  const s = settings as GlobalSettings
  return (
    <div className="mb-10 pb-6 border-b border-slate-200 flex items-start justify-between gap-6">
      <div className="flex items-center gap-4 min-w-0">
        {s.company_logo && (
          // Logo is a local data URI; next/image adds nothing for inline data.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={s.company_logo}
            alt={s.company_name ? `${s.company_name} logo` : "Company logo"}
            className="h-12 w-auto max-w-[160px] object-contain shrink-0"
          />
        )}
        {s.company_name && (
          <p className="text-lg font-semibold tracking-tight text-slate-900 break-words">{s.company_name}</p>
        )}
      </div>
      <div className="text-right text-xs text-slate-500 space-y-0.5 shrink-0">
        {s.company_address && <p className="whitespace-pre-line">{s.company_address}</p>}
        {s.company_email && <p>{s.company_email}</p>}
        {s.company_phone && <p>{s.company_phone}</p>}
        {s.company_tax_id && <p>Tax ID: {s.company_tax_id}</p>}
      </div>
    </div>
  )
}

export function QuotationDocument({
  quote,
  client,
  settings,
}: {
  quote: Quote
  client: any
  settings: GlobalSettings | null
}) {
  function handlePrint() {
    window.print()
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
  // Render with the rate the quote was priced at; legacy rows without the
  // field were all quoted at 23%.
  const vatRate = quote.vat_rate ?? 0.23
  const vatPercentLabel = Math.round(vatRate * 10000) / 100
  const currencySymbol = settings?.currency_symbol || "€"
  const money = (n: number) => formatMoney(n, currencySymbol)
  // Expiry date: stored valid_until when present, otherwise the legacy
  // convention of created_at + 30 days.
  const validUntil = quote.valid_until
    ? new Date(quote.valid_until)
    : new Date(new Date(quote.created_at).getTime() + 30 * 86400000)

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

  // Calculate Labor and Packaging with margin
  const laborCost = quote.labor_cost || 0
  const packagingShippingCost = (quote.packaging_cost || 0) + (quote.fuel_cost || 0)

  const laborWithMargin = laborCost * displayMultiplier
  const packagingWithMargin = packagingShippingCost * displayMultiplier

  // Get the total with margin (without emergency fee)
  const priceWithMargin = totalLandedCost * displayMultiplier

  const printingAndMaterialsWithMargin = priceWithMargin - laborWithMargin - packagingWithMargin

  const priceWithMarginAndEmergency = priceWithMargin + emergencyFeeCost

  // Add VAT for business quotes at the quoted rate
  const recomputedVat = vatApplies ? priceWithMarginAndEmergency * vatRate : 0
  const recomputedFinal = priceWithMarginAndEmergency + recomputedVat

  // Prefer the stored authoritative final_price (set for target-price quotes) over the
  // margin recompute. selected_margin is stored rounded to 0.1% and, for business+VAT
  // quotes, is derived without stripping VAT — so recomputing here would diverge from the
  // operator's entered total (and from what quote-history shows). Only fall back to the
  // recompute when no target price was stored (margin-mode quotes).
  const finalPrice = quote.final_price != null ? quote.final_price : recomputedFinal
  // For business quotes the stored final_price is VAT-inclusive, so back out the VAT
  // component (total - total/(1+vatRate)) instead of re-applying the rate on top.
  const vatAmount =
    quote.final_price != null
      ? vatApplies
        ? quote.final_price - quote.final_price / (1 + vatRate)
        : 0
      : recomputedVat

  const contactLine = issuerContactLine(settings)

  const isLaserQuote = quote.quote_type_mode === "laser"
  const laserItems: any[] = isLaserQuote ? quote.laser_items || [] : []

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
        {/* Letterhead (renders nothing when business identity is unset) */}
        <CompanyLetterhead settings={settings} />

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
            <p>Valid until {validUntil.toLocaleDateString()}</p>
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

          {isLaserQuote ? (
            <div className="divide-y divide-slate-100">
              {laserItems.map((it: any, i: number) => (
                <div key={it.id || i} className="flex items-baseline justify-between gap-8 py-4">
                  <div>
                    <p className="text-slate-900">
                      {it.name || "Unnamed item"} × {Number(it.quantity) || 0}
                    </p>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {it.material_name}
                      {it.machine_name ? ` · ${it.machine_name}` : ""}
                      {Number(it.discount_pct) > 0 ? ` · ${it.discount_pct}% quantity discount` : ""}
                      {` · ${money(Number(it.sell_per_piece) || 0)} each`}
                    </p>
                  </div>
                  <p className="tabular-nums text-slate-900 whitespace-nowrap">{money(Number(it.line_sell) || 0)}</p>
                </div>
              ))}
              {Number(quote.setup_fee) > 0 && (
                <div className="flex items-baseline justify-between gap-8 py-4">
                  <div>
                    <p className="text-slate-900">Design &amp; setup fee</p>
                    <p className="text-sm text-slate-400 mt-0.5">Artwork preparation and machine setup</p>
                  </div>
                  <p className="tabular-nums text-slate-900 whitespace-nowrap">
                    {money(Number(quote.setup_fee_sell ?? (Number(quote.setup_fee) || 0) * displayMultiplier) || 0)}
                  </p>
                </div>
              )}
              {(Number(quote.labor_cost) > 0 || Number(quote.packaging_cost) + Number(quote.fuel_cost) > 0) && (
                <div className="flex items-baseline justify-between gap-8 py-4">
                  <div>
                    <p className="text-slate-900">Labor, Packaging &amp; Transport</p>
                    <p className="text-sm text-slate-400 mt-0.5">Included in the item prices above</p>
                  </div>
                  <p className="tabular-nums text-slate-400 whitespace-nowrap">included</p>
                </div>
              )}
              {quote.min_price_applied && (
                <div className="flex items-baseline justify-between gap-8 py-4">
                  <p className="text-slate-900">Minimum job price adjustment</p>
                  <p className="tabular-nums text-slate-900 whitespace-nowrap">
                    {money(Number(quote.min_price_adjustment) || 0)}
                  </p>
                </div>
              )}
              {quote.is_emergency && emergencyFeeCost > 0 && (
                <div className="flex items-baseline justify-between gap-8 py-4">
                  <p className="text-slate-900">Emergency Fee</p>
                  <p className="tabular-nums text-slate-900 whitespace-nowrap">{money(emergencyFeeCost)}</p>
                </div>
              )}
              {vatApplies && (
                <div className="flex items-baseline justify-between gap-8 py-4">
                  <p className="text-slate-900">VAT ({vatPercentLabel}%)</p>
                  <p className="tabular-nums text-slate-900 whitespace-nowrap">{money(vatAmount)}</p>
                </div>
              )}
            </div>
          ) : (
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
          )}

          {/* Total */}
          <div
            className="pdf-keep mt-6 bg-slate-900 text-white rounded-md px-6 py-5 flex items-baseline justify-between"
            style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
          >
            <span className="text-xs uppercase tracking-[0.2em] text-slate-300">Total</span>
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
              {isLaserQuote
                ? "This quotation includes all costs associated with the laser cutting, engraving and printing service, including materials, machine time, labor, packaging, and delivery."
                : "This quotation includes all costs associated with the 3D printing service, including materials, machine time, labor, packaging, and delivery."}
            </li>
            <li>
              All costs include a {quote.selected_margin}% profit margin to cover business operations and overhead.
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
            <li>This quotation is valid until {validUntil.toLocaleDateString()}.</li>
          </ul>
        </section>

        {/* Footer */}
        <footer className="pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
          <p className="text-slate-500">Thank you for your business</p>
          <p className="mt-2">
            For questions about this quotation, please contact us
            {contactLine ? ` at ${contactLine}` : ""} with reference: {quote.quote_name}
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
