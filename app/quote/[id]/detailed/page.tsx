"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Download, Loader2 } from "lucide-react"
import { formatMoney } from "@/lib/format"
import { CompanyLetterhead, issuerContactLine } from "@/components/quotation-document"
import type { GlobalSettings, Quote as QuoteRow } from "@/types/db"

interface PrintedPart {
  id: string
  name: string
  filament_id: string
  printer_id: string
  printing_time_hr: number
  filament_grams: number
  material?: string
  part_cost?: number
}

interface DriedBatch {
  id: string
  material: string
  drying_time_hr: number
  cost: number
}

interface Material {
  name: string
  quantity: number
  unit_cost: number
  // Saved JSONB items never contain total_cost; line totals are derived from unit_cost*quantity.
  total_cost?: number
}

interface LaborItem {
  action: string
  hours: number
  hourly_cost: number
  // Saved JSONB items never contain total_cost; line totals are derived from hours*hourly_cost.
  total_cost?: number
}

interface PackagingItem {
  name: string
  quantity: number
  unit_cost: number
  // Saved JSONB items never contain total_cost; line totals are derived from unit_cost*quantity.
  total_cost?: number
}

// Shared quote row, with this page's narrowed shapes for the JSONB item
// arrays (the shared type keeps them loose because their element shape varies
// between quote versions).
type Quote = QuoteRow & {
  printed_parts: PrintedPart[]
  dried_batches: DriedBatch[]
  materials: Material[]
  labor_items: LaborItem[]
  packaging_items: PackagingItem[]
}

const sectionLabel = "text-xs uppercase tracking-[0.2em] text-slate-400 mb-4 pb-3 border-b border-slate-200"
const th = "text-left py-2 pr-4 text-xs uppercase tracking-wider font-medium text-slate-400"
const thRight = "text-right py-2 pl-4 text-xs uppercase tracking-wider font-medium text-slate-400"
const td = "py-3 pr-4 text-slate-900"
const tdMuted = "py-3 pr-4 text-slate-500"
const tdNum = "py-3 pl-4 text-right tabular-nums text-slate-500 whitespace-nowrap"
const tdNumStrong = "py-3 pl-4 text-right tabular-nums text-slate-900 whitespace-nowrap"

export default function DetailedQuotePage() {
  const params = useParams()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [client, setClient] = useState<any>(null)
  const [settings, setSettings] = useState<GlobalSettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (quote?.quote_name) {
      document.title = `${quote.quote_name} - Detailed Quotation`
    }
    return () => {
      document.title = "3D Print Calculator"
    }
  }, [quote?.quote_name])

  useEffect(() => {
    const loadQuote = async () => {
    const supabase = createClient()
    const { data, error } = await supabase.from("quotes").select("*").eq("id", params.id).single()

    if (error) {
      console.error("Error loading quote:", error)
      setLoading(false)
      return
    }

    if (data.client_id) {
      const { data: clientData } = await supabase.from("clients").select("*").eq("id", data.client_id).single()
      if (clientData) {
        setClient(clientData)
      }
    }

    if (data.printed_parts && data.printed_parts.length > 0) {
      // Handle both old and new data structures
      const allFilamentIds: string[] = []
      data.printed_parts.forEach((p: any) => {
        // Old structure: filament_id directly on part
        if (p.filament_id) {
          allFilamentIds.push(p.filament_id)
        }
        // New structure: filaments array
        if (p.filaments && Array.isArray(p.filaments)) {
          p.filaments.forEach((f: any) => {
            if (f.filament_id) {
              allFilamentIds.push(f.filament_id)
            }
          })
        }
      })

      const filamentIds = [...new Set(allFilamentIds)]
      // Fetch price_per_kg so each part's cost can be computed from its OWN filament prices,
      // instead of splitting total_printing_cost purely by weight (which makes two equal-gram
      // parts using different-priced filament show an identical, wrong per-part cost).
      const { data: filaments } = await supabase
        .from("filaments")
        .select("id, name, price_per_kg")
        .in("id", filamentIds)
      const filamentMap = new Map<string, string>(filaments?.map((f: any) => [f.id, f.name]) || [])
      const priceMap = new Map<string, number>(filaments?.map((f: any) => [f.id, f.price_per_kg]) || [])

      // The price-based per-part cost below matches how 3D-PRINT quotes build
      // total_printing_cost. Laser cutting/engraving/sticker quotes compute
      // total_printing_cost a different way, so for those we fall back to splitting
      // the stored total by weight; totalGrams is that split's denominator.
      const is3dPrint = data.quote_type_mode === "3d-print"
      const totalGrams = data.printed_parts.reduce((sum: number, part: any) => {
        if (part.filament_id) return sum + (part.filament_grams || 0)
        if (Array.isArray(part.filaments))
          return sum + part.filaments.reduce((s: number, f: any) => s + (f.grams || 0), 0)
        return sum
      }, 0)

      data.printed_parts = data.printed_parts.map((part: any) => {
        let materialName = "Unknown"
        let partGrams = 0
        // Compute material cost per part using its filament price(s): price_per_kg * grams / 1000.
        // This mirrors the calculator's total_printing_cost formula so per-part Base Cost /
        // With Margin are accurate and the per-part sum reconciles with the subtotal.
        let partCost = 0

        // Handle old structure
        if (part.filament_id) {
          materialName = filamentMap.get(part.filament_id) || "Unknown"
          partGrams = part.filament_grams || 0
          partCost = ((priceMap.get(part.filament_id) || 0) * partGrams) / 1000
        }
        // Handle new structure (multiple filaments per part)
        else if (part.filaments && Array.isArray(part.filaments) && part.filaments.length > 0) {
          // Get all filament names for this part
          const filamentNames = part.filaments
            .map((f: any) => filamentMap.get(f.filament_id))
            .filter(Boolean)
            .join(", ")
          materialName = filamentNames || "Unknown"
          partGrams = part.filaments.reduce((sum: number, f: any) => sum + (f.grams || 0), 0)
          partCost = part.filaments.reduce(
            (sum: number, f: any) => sum + ((priceMap.get(f.filament_id) || 0) * (f.grams || 0)) / 1000,
            0,
          )
        }

        // Prefer the authoritative per-part cost persisted at save time. Fall back
        // to a computed value for older quotes saved before that field existed:
        // the price-based cost for 3D-print, or a weight split of the stored total
        // for laser/sticker quotes (which is 0 when no weight was recorded).
        const storedCost = typeof part.part_cost === "number" ? part.part_cost : null
        const finalPartCost =
          storedCost != null
            ? storedCost
            : is3dPrint
              ? partCost
              : totalGrams > 0
                ? (data.total_printing_cost * partGrams) / totalGrams
                : 0

        return {
          ...part,
          material: materialName,
          filament_grams: partGrams,
          part_cost: finalPartCost,
        }
      })
    }

    // Settings only drive display (currency symbol); a missing row just
    // falls back to the defaults.
    const { data: settingsData } = await supabase.from("global_settings").select("*").limit(1).maybeSingle()
    setSettings(settingsData ?? null)

    setQuote(data)
    setLoading(false)
    }
    loadQuote()
  }, [params.id])

  async function loadFilamentName(filamentId: string): Promise<string> {
    const supabase = createClient()
    const { data, error } = await supabase.from("filaments").select("name").eq("id", filamentId).single()

    if (error) {
      console.error("Error loading filament name:", error)
      return "Unknown"
    }

    return data?.name || "Unknown"
  }

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
  // Scale the breakdown rows by an effective multiplier derived from that total so
  // the lines reconcile to it, instead of the rounded selected_margin (which drifts
  // by a rounding cent). targetExVat backs the quoted VAT out of the stored
  // VAT-inclusive business price. Margin-mode quotes keep marginMultiplier exactly.
  const targetExVat =
    quote.final_price != null ? (vatApplies ? quote.final_price / (1 + vatRate) : quote.final_price) : null
  const displayMultiplier =
    targetExVat != null && totalLandedCost > 0
      ? (targetExVat - emergencyFeeCost) / totalLandedCost
      : marginMultiplier
  // The summary subtotal must scale by the same multiplier as the line items,
  // or the printed summary rows don't add up to the Total bar below them.
  const priceWithMargin = totalLandedCost * displayMultiplier
  const priceWithMarginAndEmergency = priceWithMargin + emergencyFeeCost
  const recomputedVat = vatApplies ? priceWithMarginAndEmergency * vatRate : 0
  const recomputedFinal = priceWithMarginAndEmergency + recomputedVat

  // Prefer the stored authoritative final_price (set for target-price quotes) over the margin
  // recompute. selected_margin is stored rounded to 0.1% and, for business+VAT quotes, derived
  // without stripping VAT — so recomputing here diverges from the operator's entered total.
  // Only fall back to the recompute when no target price was stored (margin-mode quotes).
  const finalPrice = quote.final_price != null ? quote.final_price : recomputedFinal
  // For business quotes the stored final_price is VAT-inclusive, so back out the VAT
  // component (total - total/(1+vatRate)) instead of re-applying the rate on top.
  const vatAmount =
    quote.final_price != null
      ? vatApplies
        ? quote.final_price - quote.final_price / (1 + vatRate)
        : 0
      : recomputedVat

  return (
    <div className="min-h-screen print:min-h-0 bg-white font-sans text-slate-900">
      <div className="print:hidden fixed top-4 right-4 z-50">
        <Button onClick={handlePrint} className="bg-slate-900 hover:bg-slate-700 text-white">
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </Button>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-16 print:py-10 print:px-0">
        {/* Letterhead (renders nothing when business identity is unset) */}
        <CompanyLetterhead settings={settings} />

        {/* Header */}
        <header className="mb-14">
          <div className="flex items-baseline justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-3">Detailed Quotation</p>
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

        {quote.printed_parts && quote.printed_parts.length > 0 && (
          <section className="mb-12">
            <p className={sectionLabel}>Printed Parts &amp; Materials</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={th}>Part</th>
                    <th className={th}>Material</th>
                    <th className={thRight}>Weight (g)</th>
                    <th className={thRight}>Print Time (h)</th>
                    <th className={thRight}>Base</th>
                    <th className={thRight}>With Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.printed_parts.map((part, index) => (
                    <tr key={part.id || index} className="border-b border-slate-100">
                      <td className={td}>{part.name || `Part ${index + 1}`}</td>
                      <td className={tdMuted}>{part.material}</td>
                      <td className={tdNum}>{Math.round(part.filament_grams || 0)}</td>
                      <td className={tdNum}>{part.printing_time_hr?.toFixed(2) || "0.00"}</td>
                      <td className={tdNum}>{money(part.part_cost ?? 0)}</td>
                      <td className={tdNumStrong}>{money(((part.part_cost || 0) * displayMultiplier))}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={5} className="py-3 pr-4 text-right text-sm text-slate-500">
                      Subtotal
                    </td>
                    <td className="py-3 pl-4 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap border-t border-slate-200">
                      {money((quote.total_printing_cost * displayMultiplier))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="mb-12">
          <p className={sectionLabel}>Machine &amp; Operating Costs</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className={th}>Description</th>
                  <th className={thRight}>Base</th>
                  <th className={thRight}>With Margin</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className={td}>Machine depreciation and maintenance cost</td>
                  <td className={tdNum}>{money(quote.machine_cost ?? 0)}</td>
                  <td className={tdNumStrong}>{money(((quote.machine_cost || 0) * displayMultiplier))}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className={td}>Electricity cost</td>
                  <td className={tdNum}>{money(quote.electricity_cost ?? 0)}</td>
                  <td className={tdNumStrong}>{money(((quote.electricity_cost || 0) * displayMultiplier))}</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-right text-sm text-slate-500">Subtotal</td>
                  <td className="py-3 pl-4 text-right tabular-nums text-slate-500 whitespace-nowrap border-t border-slate-200">
                    {money(((quote.machine_cost || 0) + (quote.electricity_cost || 0)))}
                  </td>
                  <td className="py-3 pl-4 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap border-t border-slate-200">
                    {money((((quote.machine_cost || 0) + (quote.electricity_cost || 0)) * displayMultiplier))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {quote.dried_batches && quote.dried_batches.length > 0 && (
          <section className="mb-12">
            <p className={sectionLabel}>Filament Drying &amp; Preparation</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={th}>Filament</th>
                    <th className={thRight}>Drying Time (h)</th>
                    <th className={thRight}>Base</th>
                    <th className={thRight}>With Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.dried_batches.map((batch, index) => (
                    <tr key={batch.id || index} className="border-b border-slate-100">
                      <td className={td}>{batch.material}</td>
                      <td className={tdNum}>{batch.drying_time_hr?.toFixed(2) || "0.00"}</td>
                      <td className={tdNum}>{money(batch.cost ?? 0)}</td>
                      <td className={tdNumStrong}>{money(((batch.cost || 0) * displayMultiplier))}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} className="py-3 pr-4 text-right text-sm text-slate-500">
                      Subtotal
                    </td>
                    <td className="py-3 pl-4 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap border-t border-slate-200">
                      {money((quote.drying_cost * displayMultiplier))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {quote.materials && quote.materials.length > 0 && (
          <section className="mb-12">
            <p className={sectionLabel}>Additional Materials &amp; Hardware</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={th}>Item</th>
                    <th className={thRight}>Qty</th>
                    <th className={thRight}>Unit</th>
                    <th className={thRight}>Base</th>
                    <th className={thRight}>With Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.materials.map((material, index) => {
                    // Saved items have no total_cost; derive the line total from unit_cost*quantity
                    // so Base Cost / With Margin are non-zero and reconcile with the subtotal.
                    const lineTotal = (material.unit_cost || 0) * (material.quantity || 0)
                    return (
                      <tr key={index} className="border-b border-slate-100">
                        <td className={td}>{material.name}</td>
                        <td className={tdNum}>{material.quantity}</td>
                        <td className={tdNum}>{money(material.unit_cost ?? 0)}</td>
                        <td className={tdNum}>{money(lineTotal)}</td>
                        <td className={tdNumStrong}>{money((lineTotal * displayMultiplier))}</td>
                      </tr>
                    )
                  })}
                  <tr>
                    <td colSpan={4} className="py-3 pr-4 text-right text-sm text-slate-500">
                      Subtotal
                    </td>
                    <td className="py-3 pl-4 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap border-t border-slate-200">
                      {money((quote.materials_cost * displayMultiplier))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {quote.labor_items && quote.labor_items.length > 0 && (
          <section className="mb-12">
            <p className={sectionLabel}>Labor &amp; Post-Processing</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={th}>Action</th>
                    <th className={thRight}>Hours</th>
                    <th className={thRight}>Rate ({currencySymbol}/h)</th>
                    <th className={thRight}>Base</th>
                    <th className={thRight}>With Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.labor_items.map((labor, index) => {
                    // Saved items have no total_cost; derive the line total from hours*hourly_cost
                    // so Base Cost / With Margin are non-zero and reconcile with the subtotal.
                    const lineTotal = (labor.hours || 0) * (labor.hourly_cost || 0)
                    return (
                      <tr key={index} className="border-b border-slate-100">
                        <td className={td}>{labor.action}</td>
                        <td className={tdNum}>{labor.hours?.toFixed(2) || "0.00"}</td>
                        <td className={tdNum}>{money(labor.hourly_cost ?? 0)}</td>
                        <td className={tdNum}>{money(lineTotal)}</td>
                        <td className={tdNumStrong}>{money((lineTotal * displayMultiplier))}</td>
                      </tr>
                    )
                  })}
                  <tr>
                    <td colSpan={4} className="py-3 pr-4 text-right text-sm text-slate-500">
                      Subtotal
                    </td>
                    <td className="py-3 pl-4 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap border-t border-slate-200">
                      {money((quote.labor_cost * displayMultiplier))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {quote.packaging_items && quote.packaging_items.length > 0 && (
          <section className="mb-12">
            <p className={sectionLabel}>Packaging &amp; Shipping Materials</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={th}>Item</th>
                    <th className={thRight}>Qty</th>
                    <th className={thRight}>Unit</th>
                    <th className={thRight}>Base</th>
                    <th className={thRight}>With Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.packaging_items.map((pkg, index) => {
                    // Saved items have no total_cost; derive the line total from unit_cost*quantity
                    // so Base Cost / With Margin are non-zero and reconcile with the subtotal.
                    const lineTotal = (pkg.unit_cost || 0) * (pkg.quantity || 0)
                    return (
                      <tr key={index} className="border-b border-slate-100">
                        <td className={td}>{pkg.name}</td>
                        <td className={tdNum}>{pkg.quantity}</td>
                        <td className={tdNum}>{money(pkg.unit_cost ?? 0)}</td>
                        <td className={tdNum}>{money(lineTotal)}</td>
                        <td className={tdNumStrong}>{money((lineTotal * displayMultiplier))}</td>
                      </tr>
                    )
                  })}
                  {quote.distance_traveled_km > 0 && (
                    <tr className="border-b border-slate-100">
                      <td className={td}>Transportation fuel cost</td>
                      <td className={tdNum}>{quote.distance_traveled_km.toFixed(2)} km</td>
                      <td className={tdNum}>—</td>
                      <td className={tdNum}>{money(quote.fuel_cost ?? 0)}</td>
                      <td className={tdNumStrong}>{money(((quote.fuel_cost || 0) * displayMultiplier))}</td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={4} className="py-3 pr-4 text-right text-sm text-slate-500">
                      Subtotal
                    </td>
                    <td className="py-3 pl-4 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap border-t border-slate-200">
                      {money(((quote.packaging_cost + quote.fuel_cost) * displayMultiplier))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Summary */}
        <section className="mb-12">
          <p className={sectionLabel}>Summary</p>
          <div className="divide-y divide-slate-100">
            <div className="flex items-baseline justify-between gap-8 py-3">
              <span className="text-slate-500">Subtotal (with {quote.selected_margin}% margin)</span>
              <span className="tabular-nums text-slate-900 whitespace-nowrap">{money(priceWithMargin)}</span>
            </div>

            {quote.is_emergency && emergencyFeeCost > 0 && (
              <div className="flex items-baseline justify-between gap-8 py-3">
                <span className="text-red-600">Emergency Fee</span>
                <span className="tabular-nums text-slate-900 whitespace-nowrap">{money(emergencyFeeCost)}</span>
              </div>
            )}

            {vatApplies && (
              <div className="flex items-baseline justify-between gap-8 py-3">
                <span className="text-slate-500">VAT ({vatPercentLabel}%)</span>
                <span className="tabular-nums text-slate-900 whitespace-nowrap">{money(vatAmount)}</span>
              </div>
            )}
          </div>

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
          <p className={sectionLabel}>Notes</p>
          <ul className="text-sm text-slate-500 space-y-2 list-disc list-outside pl-4">
            <li>
              All costs include a {quote.selected_margin}% profit margin to cover business operations and overhead.
            </li>
            <li>
              Pricing reflects current material costs and may be subject to adjustment for significant market changes.
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
            {issuerContactLine(settings) ? ` at ${issuerContactLine(settings)}` : ""} with reference: {quote.quote_name}
          </p>
        </footer>
      </div>

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
