"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Download, Loader2 } from "lucide-react"

interface Quote {
  id: string
  quote_name: string
  mode: string
  total_printing_cost: number
  machine_cost: number
  drying_cost: number
  materials_cost: number
  labor_cost: number
  packaging_cost: number
  fuel_cost: number
  emergency_fee_cost: number
  total_landed_cost: number
  selected_margin: number
  final_client_price: number
  vat_amount: number
  is_emergency: boolean
  created_at: string
}

export default function QuotePage() {
  const params = useParams()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadQuote()
  }, [params.id])

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

  const printingAndMaterialsCost =
    (quote.total_printing_cost || 0) +
    (quote.machine_cost || 0) +
    (quote.drying_cost || 0) +
    (quote.materials_cost || 0)

  const packagingShippingCost = (quote.packaging_cost || 0) + (quote.fuel_cost || 0)

  const isBusinessQuote = quote.mode === "business"

  const totalLandedCost =
    printingAndMaterialsCost +
    (quote.labor_cost || 0) +
    packagingShippingCost +
    (quote.is_emergency ? quote.emergency_fee_cost || 0 : 0)

  const marginMultiplier = 1 + (quote.selected_margin || 0) / 100
  const priceWithMargin = totalLandedCost * marginMultiplier

  // Add VAT for business quotes
  const vatAmount = isBusinessQuote ? priceWithMargin * 0.23 : 0
  const finalPrice = priceWithMargin + vatAmount

  console.log("[v0] Quote calculations:", {
    totalLandedCost,
    selectedMargin: quote.selected_margin,
    marginMultiplier,
    priceWithMargin,
    vatAmount,
    finalPrice,
  })

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
        <div className="border-b-2 border-gray-900 pb-4 mb-8">
          <h1 className="text-2xl font-bold text-center text-gray-900">Detailed Quotation for 3D Printed Parts</h1>
          <p className="text-center text-sm text-gray-600 mt-2">Quote: {quote.quote_name}</p>
          <p className="text-center text-sm text-gray-600">Date: {new Date(quote.created_at).toLocaleDateString()}</p>
        </div>

        {/* Cost Breakdown Table */}
        <table className="w-full border-collapse mb-8">
          <thead>
            <tr className="border-t border-b border-gray-900">
              <th className="text-left py-3 px-4 font-semibold text-gray-900">Category</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-900">Description</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-900">Total (€)</th>
            </tr>
          </thead>
          <tbody>
            {/* 3D Printing & Materials */}
            <tr className="bg-blue-100">
              <td className="py-4 px-4 font-medium text-gray-900">3D Printing & Materials</td>
              <td className="py-4 px-4 text-gray-700">Printing time, machine cost and material usage</td>
              <td className="py-4 px-4 text-right font-medium text-gray-900">
                {(printingAndMaterialsCost * marginMultiplier).toFixed(2)} €
              </td>
            </tr>

            {/* Labor */}
            <tr className="bg-blue-200">
              <td className="py-4 px-4 font-medium text-gray-900">Labor</td>
              <td className="py-4 px-4 text-gray-700">Assembly, post-processing, or design work</td>
              <td className="py-4 px-4 text-right font-medium text-gray-900">
                {((quote.labor_cost || 0) * marginMultiplier).toFixed(2)} €
              </td>
            </tr>

            {/* Packaging, Shipping & Transport */}
            <tr className="bg-blue-100">
              <td className="py-4 px-4 font-medium text-gray-900">Packaging, Shipping & Transport</td>
              <td className="py-4 px-4 text-gray-700">Packaging materials, courier, and transportation</td>
              <td className="py-4 px-4 text-right font-medium text-gray-900">
                {(packagingShippingCost * marginMultiplier).toFixed(2)} €
              </td>
            </tr>

            {/* Emergency Fee */}
            {quote.is_emergency && quote.emergency_fee_cost > 0 && (
              <tr className="bg-blue-200">
                <td className="py-4 px-4 font-medium text-gray-900">
                  Emergency Fee
                  <div className="text-xs text-gray-600 font-normal">(if applicable)</div>
                </td>
                <td className="py-4 px-4 text-gray-700">Urgent order surcharge</td>
                <td className="py-4 px-4 text-right font-medium text-gray-900">
                  {((quote.emergency_fee_cost || 0) * marginMultiplier).toFixed(2)} €
                </td>
              </tr>
            )}

            {/* VAT - Only for business quotes */}
            {isBusinessQuote && (
              <tr className="bg-blue-200">
                <td className="py-4 px-4 font-medium text-gray-900" colSpan={2}>
                  <div className="text-right">VAT</div>
                </td>
                <td className="py-4 px-4 text-right font-medium text-gray-900">{vatAmount.toFixed(2)} €</td>
              </tr>
            )}

            {/* Total */}
            <tr className="bg-blue-300 border-t-2 border-gray-900">
              <td className="py-4 px-4 font-bold text-gray-900" colSpan={2}>
                <div className="text-right text-lg">Total:</div>
              </td>
              <td className="py-4 px-4 text-right font-bold text-gray-900 text-lg">{finalPrice.toFixed(2)} €</td>
            </tr>
          </tbody>
        </table>

        {/* Order Contents & Details Section */}
        <div className="mt-12">
          <div className="border-t border-b border-gray-900 py-3 mb-4">
            <h2 className="text-center font-semibold text-gray-900">Order Contents & Details</h2>
          </div>

          <div className="bg-blue-50 p-6 rounded">
            <p className="text-sm text-gray-700 leading-relaxed">
              This quotation includes all costs associated with the 3D printing service, including materials, machine
              time, labor, packaging, and delivery.
              {isBusinessQuote && " VAT at 23% is included in the final price."}
            </p>

            {quote.is_emergency && (
              <p className="text-sm text-gray-700 mt-3 leading-relaxed">
                <strong>Emergency Order:</strong> This quote includes an emergency fee surcharge for expedited
                processing.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-300 text-center text-xs text-gray-600">
          <p>Thank you for your business</p>
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
            margin: 1cm;
            size: A4;
          }
        }
      `}</style>
    </div>
  )
}
