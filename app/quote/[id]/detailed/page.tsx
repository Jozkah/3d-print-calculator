"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Download, Loader2 } from "lucide-react"

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
  total_cost: number
}

interface LaborItem {
  action: string
  hours: number
  hourly_cost: number
  total_cost: number
}

interface PackagingItem {
  name: string
  quantity: number
  unit_cost: number
  total_cost: number
}

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
  printed_parts: PrintedPart[]
  dried_batches: DriedBatch[]
  materials: Material[]
  labor_items: LaborItem[]
  packaging_items: PackagingItem[]
  distance_traveled_km: number
}

export default function DetailedQuotePage() {
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
      setLoading(false)
      return
    }

    if (data.printed_parts && data.printed_parts.length > 0) {
      const filamentIds = [...new Set(data.printed_parts.map((p: PrintedPart) => p.filament_id))]
      const { data: filaments } = await supabase.from("filaments").select("id, name").in("id", filamentIds)

      const filamentMap = new Map(filaments?.map((f) => [f.id, f.name]) || [])

      const totalGrams = data.printed_parts.reduce((sum: number, p: PrintedPart) => sum + (p.filament_grams || 0), 0)

      data.printed_parts = data.printed_parts.map((part: PrintedPart) => ({
        ...part,
        material: filamentMap.get(part.filament_id) || "Unknown",
        part_cost: totalGrams > 0 ? data.total_printing_cost * (part.filament_grams / totalGrams) : 0,
      }))
    }

    setQuote(data)
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

  const marginPercentage = Number.parseFloat(quote.selected_margin || "0") / 100
  const marginMultiplier = marginPercentage > 0 ? 1 / (1 - marginPercentage) : 1

  const totalLandedCost = quote.landed_cost || 0
  const priceWithMargin = totalLandedCost * marginMultiplier
  const emergencyFeeCost = quote.is_emergency ? quote.emergency_fee || 0 : 0
  const priceWithMarginAndEmergency = priceWithMargin + emergencyFeeCost

  const isBusinessQuote = quote.quote_type === "business"
  const vatAmount = isBusinessQuote ? priceWithMarginAndEmergency * 0.23 : 0
  const finalPrice = priceWithMarginAndEmergency + vatAmount

  return (
    <div className="min-h-screen bg-white">
      <div className="print:hidden fixed top-4 right-4 z-50">
        <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700">
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </Button>
      </div>

      <div className="max-w-6xl mx-auto p-8 print:p-12">
        <div className="border-b-2 border-gray-900 pb-6 mb-8">
          <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">Detailed Quotation for 3D Printed Parts</h1>
          <div className="text-center space-y-1">
            <p className="text-sm text-gray-600">
              Quote: <span className="font-semibold">{quote.quote_name}</span>
            </p>
            <p className="text-sm text-gray-600">Date: {new Date(quote.created_at).toLocaleDateString()}</p>
            <p className="text-sm text-gray-600">
              Type: <span className="font-semibold capitalize">{quote.quote_type}</span>
              {quote.is_emergency && <span className="ml-2 text-red-600 font-semibold">(EMERGENCY ORDER)</span>}
            </p>
          </div>
        </div>

        {quote.printed_parts && quote.printed_parts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-300">
              1. Printed Parts & Materials
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse mb-4">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 border-b">Part Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 border-b">Material</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">Weight (g)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">Print Time (h)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">Base Cost (€)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">With Margin (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.printed_parts.map((part, index) => (
                    <tr key={part.id || index} className={index % 2 === 0 ? "bg-blue-50" : "bg-white"}>
                      <td className="py-3 px-4 text-gray-900">{part.name || `Part ${index + 1}`}</td>
                      <td className="py-3 px-4 text-gray-700">{part.material}</td>
                      <td className="py-3 px-4 text-right text-gray-700">{Math.round(part.filament_grams || 0)}</td>
                      <td className="py-3 px-4 text-right text-gray-700">
                        {part.printing_time_hr?.toFixed(2) || "0.00"}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-700">{part.part_cost?.toFixed(2) || "0.00"}</td>
                      <td className="py-3 px-4 text-right font-medium text-gray-900">
                        {((part.part_cost || 0) * marginMultiplier).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-blue-200 font-semibold">
                    <td colSpan={5} className="py-3 px-4 text-right text-gray-900">
                      Subtotal:
                    </td>
                    <td className="py-3 px-4 text-right text-gray-900">
                      {(quote.total_printing_cost * marginMultiplier).toFixed(2)} €
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-300">
            2. Machine & Operating Costs
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse mb-4">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 border-b">Description</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">Base Cost (€)</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">With Margin (€)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-blue-50">
                  <td className="py-3 px-4 text-gray-900">Machine depreciation and maintenance cost</td>
                  <td className="py-3 px-4 text-right text-gray-700">{quote.machine_cost?.toFixed(2) || "0.00"}</td>
                  <td className="py-3 px-4 text-right font-medium text-gray-900">
                    {((quote.machine_cost || 0) * marginMultiplier).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {quote.dried_batches && quote.dried_batches.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-300">
              3. Filament Drying & Preparation
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse mb-4">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 border-b">Filament</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">Drying Time (h)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">Base Cost (€)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">With Margin (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.dried_batches.map((batch, index) => (
                    <tr key={batch.id || index} className={index % 2 === 0 ? "bg-blue-50" : "bg-white"}>
                      <td className="py-3 px-4 text-gray-900">{batch.material}</td>
                      <td className="py-3 px-4 text-right text-gray-700">
                        {batch.drying_time_hr?.toFixed(2) || "0.00"}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-700">{batch.cost?.toFixed(2) || "0.00"}</td>
                      <td className="py-3 px-4 text-right font-medium text-gray-900">
                        {((batch.cost || 0) * marginMultiplier).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-blue-200 font-semibold">
                    <td colSpan={3} className="py-3 px-4 text-right text-gray-900">
                      Subtotal:
                    </td>
                    <td className="py-3 px-4 text-right text-gray-900">
                      {(quote.drying_cost * marginMultiplier).toFixed(2)} €
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {quote.materials && quote.materials.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-300">
              4. Additional Materials & Hardware
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse mb-4">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 border-b">Item</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">Quantity</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">Unit Cost (€)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">Base Cost (€)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">With Margin (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.materials.map((material, index) => (
                    <tr key={index} className={index % 2 === 0 ? "bg-blue-50" : "bg-white"}>
                      <td className="py-3 px-4 text-gray-900">{material.name}</td>
                      <td className="py-3 px-4 text-right text-gray-700">{material.quantity}</td>
                      <td className="py-3 px-4 text-right text-gray-700">{material.unit_cost?.toFixed(2) || "0.00"}</td>
                      <td className="py-3 px-4 text-right text-gray-700">
                        {material.total_cost?.toFixed(2) || "0.00"}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-gray-900">
                        {((material.total_cost || 0) * marginMultiplier).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-blue-200 font-semibold">
                    <td colSpan={4} className="py-3 px-4 text-right text-gray-900">
                      Subtotal:
                    </td>
                    <td className="py-3 px-4 text-right text-gray-900">
                      {(quote.materials_cost * marginMultiplier).toFixed(2)} €
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {quote.labor_items && quote.labor_items.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-300">
              5. Labor & Post-Processing
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse mb-4">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 border-b">Action</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">Hours</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">Rate (€/h)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">Base Cost (€)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">With Margin (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.labor_items.map((labor, index) => (
                    <tr key={index} className={index % 2 === 0 ? "bg-blue-50" : "bg-white"}>
                      <td className="py-3 px-4 text-gray-900">{labor.action}</td>
                      <td className="py-3 px-4 text-right text-gray-700">{labor.hours?.toFixed(2) || "0.00"}</td>
                      <td className="py-3 px-4 text-right text-gray-700">{labor.hourly_cost?.toFixed(2) || "0.00"}</td>
                      <td className="py-3 px-4 text-right text-gray-700">{labor.total_cost?.toFixed(2) || "0.00"}</td>
                      <td className="py-3 px-4 text-right font-medium text-gray-900">
                        {((labor.total_cost || 0) * marginMultiplier).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-blue-200 font-semibold">
                    <td colSpan={4} className="py-3 px-4 text-right text-gray-900">
                      Subtotal:
                    </td>
                    <td className="py-3 px-4 text-right text-gray-900">
                      {(quote.labor_cost * marginMultiplier).toFixed(2)} €
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {quote.packaging_items && quote.packaging_items.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-300">
              6. Packaging & Shipping Materials
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse mb-4">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 border-b">Item</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">Quantity</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">Unit Cost (€)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">Base Cost (€)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 border-b">With Margin (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.packaging_items.map((pkg, index) => (
                    <tr key={index} className={index % 2 === 0 ? "bg-blue-50" : "bg-white"}>
                      <td className="py-3 px-4 text-gray-900">{pkg.name}</td>
                      <td className="py-3 px-4 text-right text-gray-700">{pkg.quantity}</td>
                      <td className="py-3 px-4 text-right text-gray-700">{pkg.unit_cost?.toFixed(2) || "0.00"}</td>
                      <td className="py-3 px-4 text-right text-gray-700">{pkg.total_cost?.toFixed(2) || "0.00"}</td>
                      <td className="py-3 px-4 text-right font-medium text-gray-900">
                        {((pkg.total_cost || 0) * marginMultiplier).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {quote.distance_traveled_km > 0 && (
                    <tr className="bg-white">
                      <td className="py-3 px-4 text-gray-900">Transportation fuel cost</td>
                      <td className="py-3 px-4 text-right text-gray-700">{quote.distance_traveled_km.toFixed(2)} km</td>
                      <td className="py-3 px-4 text-right text-gray-700">-</td>
                      <td className="py-3 px-4 text-right text-gray-700">{quote.fuel_cost?.toFixed(2) || "0.00"}</td>
                      <td className="py-3 px-4 text-right font-medium text-gray-900">
                        {((quote.fuel_cost || 0) * marginMultiplier).toFixed(2)}
                      </td>
                    </tr>
                  )}
                  <tr className="bg-blue-200 font-semibold">
                    <td colSpan={4} className="py-3 px-4 text-right text-gray-900">
                      Subtotal:
                    </td>
                    <td className="py-3 px-4 text-right text-gray-900">
                      {((quote.packaging_cost + quote.fuel_cost) * marginMultiplier).toFixed(2)} €
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mb-8 border-t-2 border-gray-900 pt-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quote Summary</h2>
          <div className="bg-blue-50 p-6 rounded-lg">
            <div className="space-y-3">
              <div className="flex justify-between text-gray-700">
                <span>Subtotal (with {quote.selected_margin}% margin):</span>
                <span className="font-semibold">{priceWithMargin.toFixed(2)} €</span>
              </div>

              {quote.is_emergency && emergencyFeeCost > 0 && (
                <div className="flex justify-between text-red-700">
                  <span>Emergency Fee:</span>
                  <span className="font-semibold">{emergencyFeeCost.toFixed(2)} €</span>
                </div>
              )}

              {isBusinessQuote && (
                <div className="flex justify-between text-gray-700">
                  <span>VAT (23%):</span>
                  <span className="font-semibold">{vatAmount.toFixed(2)} €</span>
                </div>
              )}

              <div className="flex justify-between text-gray-900 text-2xl font-bold border-t-2 border-gray-300 pt-3">
                <span>Total:</span>
                <span>{finalPrice.toFixed(2)} €</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-2">Notes:</h3>
          <ul className="text-sm text-gray-700 space-y-2 list-disc list-inside">
            <li>
              All costs include a {quote.selected_margin}% profit margin to cover business operations and overhead.
            </li>
            <li>
              Pricing reflects current material costs and may be subject to adjustment for significant market changes.
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

        <div className="mt-12 pt-6 border-t border-gray-300 text-center text-xs text-gray-600">
          <p className="font-semibold">Thank you for your business</p>
          <p className="mt-2">
            For questions about this quotation, please contact us with reference: {quote.quote_name}
          </p>
        </div>
      </div>

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
