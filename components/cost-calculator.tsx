"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calculator, Save, Plus, Trash2, Package } from "lucide-react"
import { useRouter } from "next/navigation"

type Printer = {
  id: string
  name: string
  cost: number
  estimated_life_hours: number
  power_consumption_watts: number
  owner?: string
}

type Filament = {
  id: string
  name: string
  price_per_kg: number
}

type GlobalSettings = {
  electricity_rate: number
  vat_rate: number
}

type Part = {
  id: string
  partName: string
  printer: Printer | null
  filament: Filament | null
  filamentWeight: string
  printTime: string
  emergencyFee: string
}

type CalculatorProps = {
  quoteType: "personal" | "business"
  printers: Printer[]
  filaments: Filament[]
}

export function CostCalculator({ quoteType, printers, filaments }: CalculatorProps) {
  const [quoteName, setQuoteName] = useState("")
  const [parts, setParts] = useState<Part[]>([
    {
      id: "1",
      partName: "",
      printer: null,
      filament: null,
      filamentWeight: "",
      printTime: "",
      emergencyFee: "0",
    },
  ])

  const [materialsCost, setMaterialsCost] = useState("0")
  const [laborCost, setLaborCost] = useState("0")
  const [packagingCost, setPackagingCost] = useState("0")
  const [shippingCost, setShippingCost] = useState("0")

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({ electricity_rate: 0.15, vat_rate: 0.23 })
  const [results, setResults] = useState<any>(null)
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    loadGlobalSettings()
  }, [])

  const loadGlobalSettings = async () => {
    const supabase = createClient()
    const { data } = await supabase.from("global_settings").select("*").single()
    if (data) {
      setGlobalSettings({
        electricity_rate: data.electricity_rate || 0.15,
        vat_rate: data.vat_rate || 0.23,
      })
    }
  }

  const addPart = () => {
    setParts([
      ...parts,
      {
        id: Date.now().toString(),
        partName: "",
        printer: printers[0] || null,
        filament: filaments[0] || null,
        filamentWeight: "",
        printTime: "",
        emergencyFee: "0",
      },
    ])
  }

  const removePart = (id: string) => {
    if (parts.length > 1) {
      setParts(parts.filter((p) => p.id !== id))
    }
  }

  const updatePart = (id: string, field: string, value: any) => {
    setParts(parts.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
  }

  const calculate = () => {
    let totalFilamentCost = 0
    let totalMachineCost = 0
    let totalElectricityCost = 0
    let totalDryerCost = 0
    let totalEmergencyFees = 0
    const partResults: any[] = []

    for (const part of parts) {
      if (!part.printer || !part.filament || !part.filamentWeight || !part.printTime) {
        continue
      }

      const weightInKg = Number.parseFloat(part.filamentWeight) / 1000
      const hours = Number.parseFloat(part.printTime)
      const emergency = Number.parseFloat(part.emergencyFee)

      const filamentCost = weightInKg * part.filament.price_per_kg
      const machineCostPerHour = part.printer.cost / part.printer.estimated_life_hours
      const machineCost = hours * machineCostPerHour
      const electricityCost = (part.printer.power_consumption_watts / 1000) * hours * globalSettings.electricity_rate
      const dryerCost = 0 // Can be calculated based on dryer settings if needed

      totalFilamentCost += filamentCost
      totalMachineCost += machineCost
      totalElectricityCost += electricityCost
      totalDryerCost += dryerCost
      totalEmergencyFees += emergency

      partResults.push({
        partName: part.partName,
        printer: part.printer,
        filamentCost,
        machineCost,
        electricityCost,
        dryerCost,
        emergencyFee: emergency,
      })
    }

    const materials = Number.parseFloat(materialsCost)
    const labor = Number.parseFloat(laborCost)
    const packaging = Number.parseFloat(packagingCost)
    const shipping = Number.parseFloat(shippingCost)

    const totalPrintingCost = totalFilamentCost + totalMachineCost + totalElectricityCost + totalDryerCost
    const landedCost = totalPrintingCost + materials + labor + packaging + shipping + totalEmergencyFees

    // Calculate profit margins
    const margin30 = landedCost / 0.7
    const margin40 = landedCost / 0.6
    const margin50 = landedCost / 0.5
    const margin60 = landedCost / 0.4

    let profitSplits = null
    if (quoteType === "business") {
      profitSplits = calculateProfitSplits(
        partResults,
        materials,
        labor,
        packaging,
        shipping,
        totalEmergencyFees,
        totalElectricityCost,
        globalSettings.vat_rate,
        margin50,
      )
    }

    setResults({
      parts: partResults,
      totalFilamentCost,
      totalMachineCost,
      totalElectricityCost,
      totalDryerCost,
      totalEmergencyFees,
      materials,
      labor,
      packaging,
      shipping,
      totalPrintingCost,
      landedCost,
      margin30,
      margin40,
      margin50,
      margin60,
      profitSplits,
    })
  }

  const calculateProfitSplits = (
    partResults: any[],
    materials: number,
    labor: number,
    packaging: number,
    shipping: number,
    emergencyFees: number,
    electricityCost: number,
    vatRate: number,
    salePrice: number,
  ) => {
    const totalMachineCost = partResults.reduce((sum, p) => sum + p.machineCost, 0)
    const totalFilamentCost = partResults.reduce((sum, p) => sum + p.filamentCost, 0)
    const totalCosts =
      totalFilamentCost + totalMachineCost + materials + labor + packaging + shipping + electricityCost + emergencyFees
    const profit = salePrice - totalCosts
    const profitSplit = profit * 0.5
    const emergencySplit = emergencyFees * 0.5
    const vatCost = salePrice * vatRate

    // Determine owner based on first part (or majority owner if needed)
    const owner = partResults[0]?.printer?.owner || "Owner B"

    let ownerATotal = 0
    let ownerBTotal = 0

    if (owner === "Owner A") {
      // Owner A owns printer
      ownerATotal = totalMachineCost + labor + electricityCost + profitSplit + emergencySplit
      ownerBTotal = totalFilamentCost + materials + packaging + profitSplit + emergencySplit + vatCost
    } else {
      // Owner B owns printer
      ownerATotal = labor + electricityCost + profitSplit + emergencySplit
      ownerBTotal =
        totalMachineCost + totalFilamentCost + materials + packaging + profitSplit + emergencySplit + vatCost
    }

    return {
      owner,
      profit,
      profitSplit,
      emergencySplit,
      vatCost,
      ownerA: {
        machineCost: owner === "Owner A" ? totalMachineCost : 0,
        labor,
        electricityCost,
        profitSplit,
        emergencySplit,
        total: ownerATotal,
      },
      ownerB: {
        machineCost: owner === "Owner B" ? totalMachineCost : 0,
        filamentCost: totalFilamentCost,
        materials,
        packaging,
        profitSplit,
        emergencySplit,
        vatCost,
        total: ownerBTotal,
      },
    }
  }

  const saveQuote = async () => {
    if (!results) return

    setIsSaving(true)
    const supabase = createClient()

    // Insert quote header
    const { data: header, error: headerError } = await supabase
      .from("quote_headers")
      .insert({
        quote_type: quoteType,
        quote_name: quoteName || `Quote ${new Date().toLocaleDateString()}`,
        materials_cost: results.materials,
        labor_cost: results.labor,
        packaging_cost: results.packaging,
        shipping_cost: results.shipping,
      })
      .select()
      .single()

    if (headerError || !header) {
      console.error("Error saving quote header:", headerError)
      setIsSaving(false)
      return
    }

    // Insert quote parts
    const partInserts = parts
      .filter((p) => p.printer && p.filament && p.filamentWeight && p.printTime)
      .map((part) => {
        const weightInKg = Number.parseFloat(part.filamentWeight) / 1000
        const hours = Number.parseFloat(part.printTime)
        const emergency = Number.parseFloat(part.emergencyFee)

        const filamentCost = weightInKg * (part.filament?.price_per_kg || 0)
        const machineCostPerHour = (part.printer?.cost || 0) / (part.printer?.estimated_life_hours || 1)
        const machineCost = hours * machineCostPerHour
        const electricityCost =
          ((part.printer?.power_consumption_watts || 0) / 1000) * hours * globalSettings.electricity_rate

        return {
          quote_header_id: header.id,
          part_name: part.partName || "Unnamed Part",
          printer_id: part.printer?.id,
          printer_name: part.printer?.name,
          printer_owner: part.printer?.owner || "Owner B",
          filament_id: part.filament?.id,
          filament_name: part.filament?.name,
          filament_weight_grams: Number.parseFloat(part.filamentWeight),
          print_time_hours: hours,
          emergency_fee: emergency,
          filament_cost: filamentCost,
          machine_cost: machineCost,
          electricity_cost: electricityCost,
          dryer_cost: 0,
        }
      })

    const { error: partsError } = await supabase.from("quote_parts").insert(partInserts)

    setIsSaving(false)

    if (!partsError) {
      alert("Quote saved successfully!")
      router.push("/history")
    } else {
      console.error("Error saving parts:", partsError)
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Quote Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="quoteName" className="text-slate-300">
                Quote Name
              </Label>
              <Input
                id="quoteName"
                value={quoteName}
                onChange={(e) => setQuoteName(e.target.value)}
                className="bg-slate-900 border-slate-700 text-white"
                placeholder="Enter quote name"
              />
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white">Parts</CardTitle>
              <Button onClick={addPart} size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-1" />
                Add Part
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {parts.map((part, index) => (
                <div key={part.id} className="p-4 bg-slate-900 rounded-lg space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-semibold">Part {index + 1}</span>
                    {parts.length > 1 && (
                      <Button
                        onClick={() => removePart(part.id)}
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-300 hover:bg-red-950"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div>
                    <Label className="text-slate-300">Part Name</Label>
                    <Input
                      value={part.partName}
                      onChange={(e) => updatePart(part.id, "partName", e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                      placeholder="Enter part name"
                    />
                  </div>

                  <div>
                    <Label className="text-slate-300">Printer</Label>
                    <Select
                      value={part.printer?.id}
                      onValueChange={(id) =>
                        updatePart(
                          part.id,
                          "printer",
                          printers.find((p) => p.id === id),
                        )
                      }
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="Select printer" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        {printers.map((printer) => (
                          <SelectItem key={printer.id} value={printer.id} className="text-white">
                            {printer.name} {printer.owner && `(${printer.owner})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-slate-300">Filament</Label>
                    <Select
                      value={part.filament?.id}
                      onValueChange={(id) =>
                        updatePart(
                          part.id,
                          "filament",
                          filaments.find((f) => f.id === id),
                        )
                      }
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="Select filament" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        {filaments.map((filament) => (
                          <SelectItem key={filament.id} value={filament.id} className="text-white">
                            {filament.name} - ${filament.price_per_kg}/kg
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-slate-300">Filament Weight (g)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={part.filamentWeight}
                        onChange={(e) => updatePart(part.id, "filamentWeight", e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white"
                        placeholder="100"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Print Time (hrs)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={part.printTime}
                        onChange={(e) => updatePart(part.id, "printTime", e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white"
                        placeholder="5.5"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-slate-300">Emergency Fee ($)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={part.emergencyFee}
                      onChange={(e) => updatePart(part.id, "emergencyFee", e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Package className="w-5 h-5" />
                Additional Costs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="materials" className="text-slate-300">
                  Materials Cost ($)
                </Label>
                <Input
                  id="materials"
                  type="number"
                  min="0"
                  step="0.01"
                  value={materialsCost}
                  onChange={(e) => setMaterialsCost(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white"
                  placeholder="0"
                />
              </div>

              <div>
                <Label htmlFor="labor" className="text-slate-300">
                  Labor Cost ($)
                </Label>
                <Input
                  id="labor"
                  type="number"
                  min="0"
                  step="0.01"
                  value={laborCost}
                  onChange={(e) => setLaborCost(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white"
                  placeholder="0"
                />
              </div>

              <div>
                <Label htmlFor="packaging" className="text-slate-300">
                  Packaging Cost ($)
                </Label>
                <Input
                  id="packaging"
                  type="number"
                  min="0"
                  step="0.01"
                  value={packagingCost}
                  onChange={(e) => setPackagingCost(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white"
                  placeholder="0"
                />
              </div>

              <div>
                <Label htmlFor="shipping" className="text-slate-300">
                  Shipping Cost ($)
                </Label>
                <Input
                  id="shipping"
                  type="number"
                  min="0"
                  step="0.01"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white"
                  placeholder="0"
                />
              </div>
            </CardContent>
          </Card>

          <Button onClick={calculate} className="w-full bg-blue-600 hover:bg-blue-700">
            <Calculator className="w-4 h-4 mr-2" />
            Calculate Quote
          </Button>
        </div>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {results ? (
              <>
                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                    <span className="text-slate-400">Filament Cost</span>
                    <span className="text-white font-semibold">${results.totalFilamentCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                    <span className="text-slate-400">Machine Cost</span>
                    <span className="text-white font-semibold">${results.totalMachineCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                    <span className="text-slate-400">Electricity Cost</span>
                    <span className="text-white font-semibold">${results.totalElectricityCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                    <span className="text-slate-400">Materials</span>
                    <span className="text-white font-semibold">${results.materials.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                    <span className="text-slate-400">Labor</span>
                    <span className="text-white font-semibold">${results.labor.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                    <span className="text-slate-400">Packaging</span>
                    <span className="text-white font-semibold">${results.packaging.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                    <span className="text-slate-400">Shipping</span>
                    <span className="text-white font-semibold">${results.shipping.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b-2 border-slate-600">
                    <span className="text-slate-300 font-semibold">Landed Cost</span>
                    <span className="text-white font-bold text-lg">${results.landedCost.toFixed(2)}</span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-700">
                  <h3 className="text-lg font-semibold text-white mb-3">Profit Margins</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">30% Margin</span>
                      <span className="text-green-400 font-semibold">${results.margin30.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">40% Margin</span>
                      <span className="text-green-400 font-semibold">${results.margin40.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">50% Margin</span>
                      <span className="text-green-400 font-semibold">${results.margin50.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">60% Margin</span>
                      <span className="text-green-400 font-semibold">${results.margin60.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {quoteType === "business" && results.profitSplits && (
                  <div className="mt-6 pt-4 border-t border-slate-700">
                    <h3 className="text-lg font-semibold text-white mb-3">
                      Profit Split (Owner: {results.profitSplits.owner})
                    </h3>
                    <div className="space-y-4">
                      <div className="bg-slate-900 p-4 rounded-lg">
                        <h4 className="text-blue-400 font-semibold mb-2">Owner A</h4>
                        <div className="space-y-1 text-sm">
                          {results.profitSplits.ownerA.machineCost > 0 && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Machine Cost</span>
                              <span className="text-white">${results.profitSplits.ownerA.machineCost.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-slate-400">Labor</span>
                            <span className="text-white">${results.profitSplits.ownerA.labor.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Electricity</span>
                            <span className="text-white">${results.profitSplits.ownerA.electricityCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Profit (50%)</span>
                            <span className="text-white">${results.profitSplits.ownerA.profitSplit.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Emergency (50%)</span>
                            <span className="text-white">${results.profitSplits.ownerA.emergencySplit.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-bold pt-2 border-t border-slate-700">
                            <span className="text-blue-300">Total</span>
                            <span className="text-blue-300">${results.profitSplits.ownerA.total.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-900 p-4 rounded-lg">
                        <h4 className="text-green-400 font-semibold mb-2">Owner B</h4>
                        <div className="space-y-1 text-sm">
                          {results.profitSplits.ownerB.machineCost > 0 && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">Machine Cost</span>
                              <span className="text-white">${results.profitSplits.ownerB.machineCost.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-slate-400">Filament</span>
                            <span className="text-white">${results.profitSplits.ownerB.filamentCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Materials</span>
                            <span className="text-white">${results.profitSplits.ownerB.materials.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Packaging</span>
                            <span className="text-white">${results.profitSplits.ownerB.packaging.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Profit (50%)</span>
                            <span className="text-white">${results.profitSplits.ownerB.profitSplit.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Emergency (50%)</span>
                            <span className="text-white">${results.profitSplits.ownerB.emergencySplit.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">VAT</span>
                            <span className="text-white">${results.profitSplits.ownerB.vatCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-bold pt-2 border-t border-slate-700">
                            <span className="text-green-300">Total</span>
                            <span className="text-green-300">${results.profitSplits.ownerB.total.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <Button onClick={saveQuote} className="w-full mt-6 bg-green-600 hover:bg-green-700" disabled={isSaving}>
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? "Saving..." : "Save Quote"}
                </Button>
              </>
            ) : (
              <div className="text-center py-12">
                <Calculator className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">Enter details and click Calculate to see results</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
