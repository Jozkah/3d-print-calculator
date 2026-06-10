"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Download, Loader2 } from "lucide-react"

interface Quote {
  id: string
  quote_name: string
  quote_type: string
  total_printing_cost: number
  machine_cost: number
  drying_cost: number
  materials_cost: number
  labor_cost: number
  packaging_cost: number
  fuel_cost: number
  emergency_fee: number
  landed_cost: number
  selected_margin: string
  is_emergency: boolean
  created_at: string
  // Authoritative total stored for target-price quotes (operator's exact entered total,
  // already inclusive of emergency fee and VAT). null when the quote used margin mode.
  final_price?: number | null
}

export default function QuotePage() {
  const params = useParams()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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

  async function loadQuote() {
    const supabase = createClient()
    const { data, error } = await supabase.from("quotes").select("*").eq("id", params.id).single()

    if (error) {
      console.error("Error loading quote:", error)
    } else {
      setQuote(data)
    }
    setLoading(false)
  }

  function handlePrint() {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-gray-600">Quote not found</p>
      </div>
    )
  }

  // Get the price with the selected margin from the stored value
  const marginPercentage = Number.parseFloat(quote.selected_margin || "0") / 100
  const marginMultiplier = marginPercentage > 0 ? 1 / (1 - marginPercentage) : 1

  const totalLandedCost = quote.landed_cost || 0
  const emergencyFeeCost = quote.is_emergency ? quote.emergency_fee || 0 : 0
  const isBusinessQuote = quote.quote_type === "business"

  // For target-price quotes the Total is the stored (authoritative) final_price.
  // Scale the breakdown by an effective multiplier derived from that total so the
  // lines reconcile to it (the rounded selected_margin drifts by a rounding cent).
  // Margin-mode quotes keep marginMultiplier exactly.
  const targetExVat =
    quote.final_price != null ? (isBusinessQuote ? quote.final_price / 1.23 : quote.final_price) : null
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
  const recomputedVat = isBusinessQuote ? priceWithMarginAndEmergency * 0.23 : 0
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
      ? isBusinessQuote
        ? quote.final_price - quote.final_price / 1.23
        : 0
      : recomputedVat

  return (
    <div className="min-h-screen bg-white">
      {/* Print button - hidden when printing */}
      <div className="print:hidden fixed top-4 right-4 z-50">
        <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700">
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </Button>
      </div>

      {/* Quotation Document */}
      <div className="max-w-4xl mx-auto p-8 print:p-12">
        {/* Header */}
        <div className="border-b-2 border-gray-900 pb-4 mb-4">
          <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">Quotation for 3D Printed Parts</h1>
          <div className="text-center space-y-1">
            <p className="text-sm text-gray-600">
              Quote: <span className="font-semibold">{quote.quote_name}</span>
            </p>
            <p className="text-sm text-gray-600">Date: {new Date(quote.created_at).toLocaleDateString()}</p>
            {quote.is_emergency && (
              <p className="text-sm text-red-600 font-semibold">(EMERGENCY ORDER)</p>
            )}
          </div>
        </div>

        {/* Cost Breakdown Table */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-3 pb-2 border-b border-gray-300">Cost Breakdown</h2>
          <table className="w-full border-collapse mb-4">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left py-2 px-4 font-semibold text-gray-900 border-b">Category</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-900 border-b">Description</th>
                <th className="text-right py-2 px-4 font-semibold text-gray-900 border-b">Total (€)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-blue-50">
                <td className="py-2 px-4 font-medium text-gray-900">3D Printing & Materials</td>
                <td className="py-2 px-4 text-gray-700">Printing time, machine cost and material usage</td>
                <td className="py-2 px-4 text-right font-medium text-gray-900">
                  {printingAndMaterialsWithMargin.toFixed(2)} €
                </td>
              </tr>

              <tr className="bg-white">
                <td className="py-2 px-4 font-medium text-gray-900">Labor</td>
                <td className="py-2 px-4 text-gray-700">Assembly, post-processing, or design work</td>
                <td className="py-2 px-4 text-right font-medium text-gray-900">{laborWithMargin.toFixed(2)} €</td>
              </tr>

              <tr className="bg-blue-50">
                <td className="py-2 px-4 font-medium text-gray-900">Packaging, Shipping & Transport</td>
                <td className="py-2 px-4 text-gray-700">Packaging materials, courier, and transportation</td>
                <td className="py-2 px-4 text-right font-medium text-gray-900">{packagingWithMargin.toFixed(2)} €</td>
              </tr>

              {quote.is_emergency && emergencyFeeCost > 0 && (
                <tr className="bg-white">
                  <td className="py-2 px-4 font-medium text-gray-900">Emergency Fee</td>
                  <td className="py-2 px-4 text-gray-700">Urgent order surcharge</td>
                  <td className="py-2 px-4 text-right font-medium text-gray-900">{emergencyFeeCost.toFixed(2)} €</td>
                </tr>
              )}

              {/* VAT - Only for business quotes */}
              {isBusinessQuote && (
                <tr className="bg-blue-50">
                  <td className="py-2 px-4 font-medium text-gray-900">VAT (23%)</td>
                  <td className="py-2 px-4 text-gray-700"></td>
                  <td className="py-2 px-4 text-right font-medium text-gray-900">{vatAmount.toFixed(2)} €</td>
                </tr>
              )}

              {/* Total */}
              <tr className="bg-blue-200 border-t-2 border-gray-300 font-semibold">
                <td className="py-2 px-4 text-gray-900 text-lg">Total:</td>
                <td className="py-2 px-4 text-gray-700"></td>
                <td className="py-2 px-4 text-right text-gray-900 text-lg">{finalPrice.toFixed(2)} €</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Quote Summary */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-3 pb-2 border-b border-gray-300">Quote Summary</h2>
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex justify-between text-gray-900 text-2xl font-bold">
              <span>Total:</span>
              <span>{finalPrice.toFixed(2)} €</span>
            </div>
          </div>
        </div>

        {/* Order Contents & Details Section */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-2">Notes:</h3>
          <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
            <li>
              This quotation includes all costs associated with the 3D printing service, including materials, machine
              time, labor, packaging, and delivery.
            </li>
            <li>
              All costs include a {quote.selected_margin}% profit margin to cover business operations and overhead.
            </li>
            {isBusinessQuote && (
              <li>VAT at 23% is included in the final price as per legal requirements for business transactions.</li>
            )}
            {quote.is_emergency && (
              <li className="text-red-700 font-semibold">
                Emergency order surcharge applied for expedited processing and priority handling.
              </li>
            )}
            <li>This quotation is valid for 30 days from the date of issue.</li>
          </ul>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-300 text-center text-xs text-gray-600">
          <p className="font-semibold">Thank you for your business</p>
          <p className="mt-2">
            For questions about this quotation, please contact us with reference: {quote.quote_name}
          </p>
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          
          @page {
            margin: 0.5cm;
            size: A4;
          }
          
          /* Prevent page breaks */
          * {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          /* Keep sections together */
          div, table, tr, td, th {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          /* Remove default browser headers and footers */
          @page {
            margin-top: 0.5cm;
            margin-bottom: 0.5cm;
          }
        }
        
        /* Hide default browser print headers/footers (limited browser support) */
        @media print {
          html, body {
            height: 100%;
          }
        }
      `}</style>
    </div>
  )
}
