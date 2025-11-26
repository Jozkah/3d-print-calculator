"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trash2, ChevronDown, ChevronUp } from "lucide-react"
import { useRouter } from "next/navigation"

type Quote = {
  id: string
  quote_type: string
  part_name: string
  printer_name: string
  filament_name: string
  material_weight_grams: number
  print_time_hours: number
  labor_cost: number
  packaging_cost: number
  emergency_fee: number
  material_cost: number
  machine_cost: number
  total_printing_cost: number
  landed_cost: number
  margin_30: number
  margin_40: number
  margin_50: number
  margin_60: number
  created_at: string
}

export function QuoteHistory({ quotes: initialQuotes }: { quotes: Quote[] }) {
  const [quotes, setQuotes] = useState(initialQuotes)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const router = useRouter()

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this quote?")) return

    const supabase = createClient()
    const { error } = await supabase.from("quotes").delete().eq("id", id)

    if (!error) {
      setQuotes(quotes.filter((q) => q.id !== id))
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  if (quotes.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="bg-white border-2 border-blue-300">
          <CardContent className="py-12">
            <div className="text-center">
              <p className="text-blue-900 text-lg mb-4">No quotes saved yet</p>
              <p className="text-blue-600">Create a quote using the Personal or Business calculator</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="text-blue-900">Total quotes: {quotes.length}</p>
      </div>

      <div className="space-y-4">
        {quotes.map((quote) => (
          <Card key={quote.id} className="bg-white border-2 border-blue-300">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <CardTitle className="text-blue-900 text-xl">{quote.part_name}</CardTitle>
                    <Badge
                      variant="outline"
                      className={
                        quote.quote_type === "personal"
                          ? "border-blue-500 text-blue-600"
                          : "border-green-500 text-green-600"
                      }
                    >
                      {quote.quote_type}
                    </Badge>
                  </div>
                  <div className="text-sm text-blue-600 space-y-1">
                    <p>
                      Printer: {quote.printer_name} | Filament: {quote.filament_name}
                    </p>
                    <p>
                      Created: {new Date(quote.created_at).toLocaleDateString()} at{" "}
                      {new Date(quote.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => toggleExpand(quote.id)}
                    size="sm"
                    variant="outline"
                    className="border-blue-300 text-blue-900"
                  >
                    {expandedId === quote.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                  <Button
                    onClick={() => handleDelete(quote.id)}
                    size="sm"
                    variant="outline"
                    className="border-red-300 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            {expandedId === quote.id && (
              <CardContent className="border-t-2 border-blue-200">
                <div className="grid md:grid-cols-2 gap-6 pt-4">
                  <div>
                    <h3 className="text-sm font-semibold text-blue-900 mb-3">Input Details</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-blue-600">Material Weight</span>
                        <span className="text-blue-900">{quote.material_weight_grams}g</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-600">Print Time</span>
                        <span className="text-blue-900">{quote.print_time_hours}h</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-600">Labor Cost</span>
                        <span className="text-blue-900">€{quote.labor_cost.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-600">Packaging Cost</span>
                        <span className="text-blue-900">€{quote.packaging_cost.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-600">Emergency Fee</span>
                        <span className="text-blue-900">€{quote.emergency_fee.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-blue-900 mb-3">Cost Breakdown</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-blue-600">Material Cost</span>
                        <span className="text-blue-900">€{quote.material_cost.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-600">Machine Cost</span>
                        <span className="text-blue-900">€{quote.machine_cost.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-600">Total Printing Cost</span>
                        <span className="text-blue-900">€{quote.total_printing_cost.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t-2 border-blue-200 pt-2">
                        <span className="text-blue-600 font-semibold">Landed Cost</span>
                        <span className="text-blue-900 font-semibold">€{quote.landed_cost.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t-2 border-blue-200">
                  <h3 className="text-sm font-semibold text-blue-900 mb-3">Profit Margins</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <div className="text-xs text-blue-600 mb-1">30% Margin</div>
                      <div className="text-lg font-semibold text-green-600">€{quote.margin_30.toFixed(2)}</div>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <div className="text-xs text-blue-600 mb-1">40% Margin</div>
                      <div className="text-lg font-semibold text-green-600">€{quote.margin_40.toFixed(2)}</div>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <div className="text-xs text-blue-600 mb-1">50% Margin</div>
                      <div className="text-lg font-semibold text-green-600">€{quote.margin_50.toFixed(2)}</div>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <div className="text-xs text-blue-600 mb-1">60% Margin</div>
                      <div className="text-lg font-semibold text-green-600">€{quote.margin_60.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
