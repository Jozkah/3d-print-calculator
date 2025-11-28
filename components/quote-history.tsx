"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trash2, ChevronDown, ChevronUp, Share2, Download } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { DialogCustom } from "@/components/ui/dialog-custom"

type Quote = {
  id: string
  quote_type: string
  quote_name: string
  printed_parts: any[]
  dried_batches: any[]
  materials: any[]
  labor_items: any[]
  packaging_items: any[]
  distance_traveled_km: number
  is_emergency: boolean
  total_printing_cost: number
  machine_cost: number
  drying_cost: number
  materials_cost: number
  labor_cost: number
  packaging_cost: number
  fuel_cost: number
  emergency_fee: number
  electricity_cost: number
  landed_cost: number
  margin_30: number
  margin_40: number
  margin_50: number
  margin_60: number
  selected_margin: number
  ownerA_receives: number
  ownerB_receives: number
  created_at: string
}

const safeFixed = (value: any, decimals = 2) => {
  return (value ?? 0).toFixed(decimals)
}

function QuoteHistory({ quotes: initialQuotes }: { quotes: Quote[] }) {
  const [quotes, setQuotes] = useState(initialQuotes)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [printers, setPrinters] = useState<any[]>([])
  const [filaments, setFilaments] = useState<any[]>([])
  const { toast } = useToast()
  const router = useRouter()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [quoteToDelete, setQuoteToDelete] = useState<string | null>(null)

  const handleDownload = (id: string) => {
    // Placeholder for download logic
    console.log(`Download quote with id: ${id}`)
  }

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data: printersData } = await supabase.from("printers").select("*")
      const { data: filamentsData } = await supabase.from("filaments").select("*")
      if (printersData) setPrinters(printersData)
      if (filamentsData) setFilaments(filamentsData)
    }
    loadData()
  }, [])

  const handleDelete = async (id: string) => {
    setQuoteToDelete(id)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!quoteToDelete) return

    const supabase = createClient()
    const { error } = await supabase.from("quotes").delete().eq("id", quoteToDelete)

    if (!error) {
      setQuotes(quotes.filter((q) => q.id !== quoteToDelete))
      toast({
        title: "Success",
        description: "Quote deleted successfully",
      })
    } else {
      toast({
        title: "Error",
        description: "Failed to delete quote",
        variant: "destructive",
      })
    }

    setQuoteToDelete(null)
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const getPrinterName = (printerId: string) => {
    const printer = printers.find((p) => p.id === printerId)
    return printer?.name || "N/A"
  }

  const getFilamentName = (filamentId: string) => {
    const filament = filaments.find((f) => f.id === filamentId)
    return filament?.name || "N/A"
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
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="text-blue-900">Total quotes: {quotes.length}</p>
      </div>

      <div className="space-y-4">
        {quotes.map((quote) => {
          const totalParts = (quote.printed_parts || []).length
          const totalMaterials = (quote.materials || []).length
          const totalLabor = (quote.labor_items || []).length
          const totalPackaging = (quote.packaging_items || []).length
          const totalDriedBatches = (quote.dried_batches || []).length

          return (
            <Card key={quote.id} className="bg-white border-2 border-blue-300">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <CardTitle className="text-blue-900 text-xl">{quote.quote_name || "Unnamed Quote"}</CardTitle>
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
                      {quote.is_emergency && (
                        <Badge variant="outline" className="border-red-500 text-red-600">
                          Emergency
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-blue-600 space-y-1">
                      <p>
                        {totalParts} part{totalParts !== 1 ? "s" : ""} | {totalMaterials} material
                        {totalMaterials !== 1 ? "s" : ""} | {totalLabor} labor item{totalLabor !== 1 ? "s" : ""} |{" "}
                        {totalPackaging} packaging item{totalPackaging !== 1 ? "s" : ""}
                      </p>
                      <p>
                        Created: {new Date(quote.created_at).toLocaleDateString()} at{" "}
                        {new Date(quote.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        const url = `${window.location.origin}/quote/${quote.id}`
                        navigator.clipboard
                          .writeText(url)
                          .then(() => {
                            toast({
                              title: "Link Copied!",
                              description: "Shareable quote link copied to clipboard",
                            })
                          })
                          .catch((err) => {
                            toast({
                              title: "Error",
                              description: "Failed to copy link to clipboard",
                              variant: "destructive",
                            })
                          })
                      }}
                      size="sm"
                      variant="outline"
                      className="border-blue-300 text-blue-600 hover:text-blue-700"
                    >
                      <Share2 className="w-4 h-4" />
                    </Button>

                    {/* Updated PDF download to use router navigation instead of window.open */}
                    <Button
                      onClick={() => handleDownload(quote.id)}
                      size="sm"
                      variant="outline"
                      className="border-blue-300 text-blue-600 hover:text-blue-700"
                    >
                      <Download className="w-4 h-4" />
                    </Button>

                    <Button
                      onClick={() => toggleExpand(quote.id)}
                      size="sm"
                      variant="outline"
                      className="border-blue-300 text-blue-900"
                    >
                      {expandedId === quote.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
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
                  {quote.printed_parts && quote.printed_parts.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-blue-900 mb-3">Printed Parts</h3>
                      <div className="overflow-x-auto -mx-4 sm:mx-0">
                        <div className="inline-block min-w-full align-middle">
                          <table className="w-full text-sm border-2 border-blue-300">
                            <thead className="bg-blue-600 text-white">
                              <tr>
                                <th className="border border-blue-400 px-3 py-2 text-left">Part Name</th>
                                <th className="border border-blue-400 px-3 py-2 text-left">Printer</th>
                                <th className="border border-blue-400 px-3 py-2 text-left">Filament</th>
                                <th className="border border-blue-400 px-3 py-2 text-right">Weight (g)</th>
                                <th className="border border-blue-400 px-3 py-2 text-right">Time (h)</th>
                                <th className="border border-blue-400 px-3 py-2 text-right">Cost</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white">
                              {quote.printed_parts.map((part: any, index: number) => {
                                const filament = filaments.find((f) => f.id === part.filament_id)
                                const cost = filament ? (filament.price_per_kg * (part.filament_grams || 0)) / 1000 : 0

                                return (
                                  <tr key={index}>
                                    <td className="border border-blue-300 px-3 py-2">{part.name || "N/A"}</td>
                                    <td className="border border-blue-300 px-3 py-2">
                                      {getPrinterName(part.printer_id)}
                                    </td>
                                    <td className="border border-blue-300 px-3 py-2">
                                      {getFilamentName(part.filament_id)}
                                    </td>
                                    <td className="border border-blue-300 px-3 py-2 text-right">
                                      {part.filament_grams || 0}
                                    </td>
                                    <td className="border border-blue-300 px-3 py-2 text-right">
                                      {part.printing_time_hr || 0}
                                    </td>
                                    <td className="border border-blue-300 px-3 py-2 text-right">€{safeFixed(cost)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {quote.dried_batches && quote.dried_batches.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-blue-900 mb-3">Dried Batches</h3>
                      <div className="overflow-x-auto -mx-4 sm:mx-0">
                        <div className="inline-block min-w-full align-middle">
                          <table className="w-full text-sm border-2 border-blue-300">
                            <thead className="bg-blue-600 text-white">
                              <tr>
                                <th className="border border-blue-400 px-3 py-2 text-left">Filament</th>
                                <th className="border border-blue-400 px-3 py-2 text-right">Hours</th>
                                <th className="border border-blue-400 px-3 py-2 text-right">Cost</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white">
                              {quote.dried_batches.map((batch: any, index: number) => (
                                <tr key={index}>
                                  <td className="border border-blue-300 px-3 py-2">{batch.material || "N/A"}</td>
                                  <td className="border border-blue-300 px-3 py-2 text-right">
                                    {batch.drying_time_hr || 0}
                                  </td>
                                  <td className="border border-blue-300 px-3 py-2 text-right">
                                    €{safeFixed(batch.cost)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {quote.materials && quote.materials.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-blue-900 mb-2">Materials</h3>
                        <div className="bg-blue-50 p-3 rounded border border-blue-200 space-y-2">
                          {quote.materials.map((item: any, index: number) => (
                            <div key={index} className="flex justify-between text-sm">
                              <span className="text-blue-600">{item.description || "N/A"}</span>
                              <span className="text-blue-900">€{safeFixed(item.cost)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {quote.labor_items && quote.labor_items.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-blue-900 mb-2">Labor</h3>
                        <div className="bg-blue-50 p-3 rounded border border-blue-200 space-y-2">
                          {quote.labor_items.map((item: any, index: number) => (
                            <div key={index} className="flex justify-between text-sm">
                              <span className="text-blue-600">{item.description || "N/A"}</span>
                              <span className="text-blue-900">€{safeFixed(item.cost)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {quote.packaging_items && quote.packaging_items.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-blue-900 mb-2">Packaging</h3>
                        <div className="bg-blue-50 p-3 rounded border border-blue-200 space-y-2">
                          {quote.packaging_items.map((item: any, index: number) => (
                            <div key={index} className="flex justify-between text-sm">
                              <span className="text-blue-600">{item.description || "N/A"}</span>
                              <span className="text-blue-900">€{safeFixed(item.cost)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4 sm:gap-6 pt-4 border-t-2 border-blue-200">
                    <div>
                      <h3 className="text-sm font-semibold text-blue-900 mb-3">Cost Breakdown</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-blue-600">Total Printing Cost</span>
                          <span className="text-blue-900">€{safeFixed(quote.total_printing_cost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-600">Machine Cost</span>
                          <span className="text-blue-900">€{safeFixed(quote.machine_cost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-600">Materials Cost</span>
                          <span className="text-blue-900">€{safeFixed(quote.materials_cost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-600">Labor Cost</span>
                          <span className="text-blue-900">€{safeFixed(quote.labor_cost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-600">Packaging & Shipping Cost</span>
                          <span className="text-blue-900">€{safeFixed(quote.packaging_cost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-600">Transportation Cost</span>
                          <span className="text-blue-900">€{safeFixed(quote.fuel_cost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-600">Electricity Cost</span>
                          <span className="text-blue-900">
                            €{safeFixed((quote.electricity_cost || 0) + (quote.drying_cost || 0))}
                          </span>
                        </div>
                        {quote.is_emergency && (
                          <div className="flex justify-between">
                            <span className="text-blue-600">Emergency Fee</span>
                            <span className="text-blue-900">€{safeFixed(quote.emergency_fee)}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t-2 border-blue-200 pt-2">
                          <span className="text-blue-600 font-semibold">Total Landed Cost</span>
                          <span className="text-blue-900 font-semibold">€{safeFixed(quote.landed_cost)}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-blue-900 mb-3">Profit Margins</h3>
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        <div
                          className={`p-3 rounded-lg border-2 ${
                            Number(quote.selected_margin) === 30
                              ? "bg-blue-600 border-blue-700 shadow-lg"
                              : "bg-blue-50 border-blue-200"
                          }`}
                        >
                          <div
                            className={`text-xs mb-1 ${Number(quote.selected_margin) === 30 ? "text-blue-100" : "text-blue-600"}`}
                          >
                            30% Margin
                          </div>
                          <div
                            className={`text-lg font-semibold ${Number(quote.selected_margin) === 30 ? "text-white" : "text-green-600"}`}
                          >
                            €{safeFixed(quote.margin_30)}
                          </div>
                        </div>
                        <div
                          className={`p-3 rounded-lg border-2 ${
                            Number(quote.selected_margin) === 40
                              ? "bg-blue-600 border-blue-700 shadow-lg"
                              : "bg-blue-50 border-blue-200"
                          }`}
                        >
                          <div
                            className={`text-xs mb-1 ${Number(quote.selected_margin) === 40 ? "text-blue-100" : "text-blue-600"}`}
                          >
                            40% Margin
                          </div>
                          <div
                            className={`text-lg font-semibold ${Number(quote.selected_margin) === 40 ? "text-white" : "text-green-600"}`}
                          >
                            €{safeFixed(quote.margin_40)}
                          </div>
                        </div>
                        <div
                          className={`p-3 rounded-lg border-2 ${
                            Number(quote.selected_margin) === 50
                              ? "bg-blue-600 border-blue-700 shadow-lg"
                              : "bg-blue-50 border-blue-200"
                          }`}
                        >
                          <div
                            className={`text-xs mb-1 ${Number(quote.selected_margin) === 50 ? "text-blue-100" : "text-blue-600"}`}
                          >
                            50% Margin
                          </div>
                          <div
                            className={`text-lg font-semibold ${Number(quote.selected_margin) === 50 ? "text-white" : "text-green-600"}`}
                          >
                            €{safeFixed(quote.margin_50)}
                          </div>
                        </div>
                        <div
                          className={`p-3 rounded-lg border-2 ${
                            Number(quote.selected_margin) === 60
                              ? "bg-blue-600 border-blue-700 shadow-lg"
                              : "bg-blue-50 border-blue-200"
                          }`}
                        >
                          <div
                            className={`text-xs mb-1 ${Number(quote.selected_margin) === 60 ? "text-blue-100" : "text-blue-600"}`}
                          >
                            60% Margin
                          </div>
                          <div
                            className={`text-lg font-semibold ${Number(quote.selected_margin) === 60 ? "text-white" : "text-green-600"}`}
                          >
                            €{safeFixed(quote.margin_60)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {quote.quote_type === "business" && (quote.ownerA_receives || quote.ownerB_receives) && (
                    <div className="mt-6 pt-4 border-t-2 border-blue-200">
                      <h3 className="text-sm font-semibold text-blue-900 mb-3">Profit Split</h3>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-300">
                          <div className="text-sm text-blue-600 mb-1">Owner A Receives</div>
                          <div className="text-2xl font-bold text-blue-900">€{safeFixed(quote.ownerA_receives)}</div>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg border-2 border-green-300">
                          <div className="text-sm text-green-600 mb-1">Owner B Receives</div>
                          <div className="text-2xl font-bold text-green-900">€{safeFixed(quote.ownerB_receives)}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      <DialogCustom
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false)
          setQuoteToDelete(null)
        }}
        onConfirm={confirmDelete}
        title="Delete Quote"
        description="Are you sure you want to delete this quote? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  )
}

export { QuoteHistory }
