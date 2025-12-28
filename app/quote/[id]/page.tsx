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

  // Get the price with the selected margin from the stored value
  const marginPercentage = Number.parseFloat(quote.selected_margin || "0") / 100
  const marginMultiplier = marginPercentage > 0 ? 1 / (1 - marginPercentage) : 1

  // Calculate Labor and Packaging with margin
  const laborCost = quote.labor_cost || 0
  const packagingShippingCost = (quote.packaging_cost || 0) + (quote.fuel_cost || 0)

  const laborWithMargin = laborCost * marginMultiplier
  const packagingWithMargin = packagingShippingCost * marginMultiplier

  // Get the total with margin (without emergency fee)
  const totalLandedCost = quote.landed_cost || 0
  const priceWithMargin = totalLandedCost * marginMultiplier

  const printingAndMaterialsWithMargin = priceWithMargin - laborWithMargin - packagingWithMargin

  // Add emergency fee AFTER margin calculation
  const emergencyFeeCost = quote.is_emergency ? quote.emergency_fee || 0 : 0
  const priceWithMarginAndEmergency = priceWithMargin + emergencyFeeCost

  // Add VAT for business quotes (23%)
  const isBusinessQuote = quote.quote_type === "business"
  const vatAmount = isBusinessQuote ? priceWithMarginAndEmergency * 0.23 : 0
  const finalPrice = priceWithMarginAndEmergency + vatAmount

  console.log("[v0] Quote calculations:", {
    printingAndMaterialsWithMargin,
    laborCost,
    packagingShippingCost,
    totalLandedCost,
    selectedMargin: quote.selected_margin,
    marginPercentage,
    priceWithMargin,
    emergencyFeeCost,
    priceWithMarginAndEmergency,
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
            <tr className="bg-blue-100">
              <td className="py-4 px-4 font-medium text-gray-900">3D Printing & Materials</td>
              <td className="py-4 px-4 text-gray-700">Printing time, machine cost and material usage</td>
              <td className="py-4 px-4 text-right font-medium text-gray-900">
                {printingAndMaterialsWithMargin.toFixed(2)} €
              </td>
            </tr>

            <tr className="bg-blue-200">
              <td className="py-4 px-4 font-medium text-gray-900">Labor</td>
              <td className="py-4 px-4 text-gray-700">Assembly, post-processing, or design work</td>
              <td className="py-4 px-4 text-right font-medium text-gray-900">{laborWithMargin.toFixed(2)} €</td>
            </tr>

            <tr className="bg-blue-100">
              <td className="py-4 px-4 font-medium text-gray-900">Packaging, Shipping & Transport</td>
              <td className="py-4 px-4 text-gray-700">Packaging materials, courier, and transportation</td>
              <td className="py-4 px-4 text-right font-medium text-gray-900">{packagingWithMargin.toFixed(2)} €</td>
            </tr>

            {quote.is_emergency && emergencyFeeCost > 0 && (
              <tr className="bg-blue-200">
                <td className="py-4 px-4 font-medium text-gray-900">Emergency Fee</td>
                <td className="py-4 px-4 text-gray-700">Urgent order surcharge</td>
                <td className="py-4 px-4 text-right font-medium text-gray-900">{emergencyFeeCost.toFixed(2)} €</td>
              </tr>
            )}

            {/* VAT - Only for business quotes */}
            {isBusinessQuote && (
              <tr className="bg-blue-200">
                <td className="py-4 px-4 font-medium text-gray-900" colSpan={2}>
                  <div className="text-right">VAT (23%)</div>
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
