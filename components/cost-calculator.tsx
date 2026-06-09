"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  OWNER_A_KEY,
  OWNER_B_KEY,
  OWNER_A_LABEL,
  OWNER_B_LABEL,
  PROFIT_SPLIT_RATIO,
  EMERGENCY_SPLIT_RATIO,
} from "@/lib/business-config"
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
  // Field names aligned with the real `printers` table (scripts/schema.sql) and
  // with excel-calculator.tsx. The previous `cost`/`estimated_life_hours`/
  // `power_consumption_watts` names did not exist on the DB rows (select("*")),
  // so every machine/electricity figure evaluated to NaN.
  printer_cost: number
  additional_upfront_cost: number
  estimated_annual_maintenance: number
  estimated_life_years: number
  estimated_printer_uptime_percent: number
  average_power_consumption_watts: number
  owner?: string
}

type Filament = {
  id: string
  name: string
  price_per_kg: number
  brand?: string
  color?: string
  color_hex?: string | null
  requires_heating?: boolean
}

type GlobalSettings = {
  electricity_rate: number
  vat_rate: number
}

type FilamentEntry = {
  id: string
  filament: Filament | null
  weight: string // in grams
}

type Part = {
  id: string
  partName: string
  printer: Printer | null
  filaments: FilamentEntry[] // Changed from single filament to array
  printTime: string
  emergencyFee: string
}

type CalculatorProps = {
  quoteType: "personal" | "business"
  printers: Printer[]
  filaments: Filament[]
}

// Parse a user-entered numeric string into a finite number. Controlled number
// inputs store their raw string value, and clearing a field yields "" (and
// Number.parseFloat("") === NaN). Coercing to 0 here prevents a single empty
// field from poisoning landedCost / margins / the profit split with NaN, and
// from persisting NaN/null into the database on save.
const safeNum = (s: string | undefined | null): number => {
  const n = Number.parseFloat(s ?? "")
  return Number.isFinite(n) ? n : 0
}

// Per-part machine + electricity cost, derived from the printer's real DB
// columns. Centralised so calculate() (display) and saveQuote() (persistence)
// can never diverge. Guards both undefined operands and zero divisors.
const computePartMachineCosts = (printer: Printer | null, hours: number, electricityRate: number) => {
  const totalInvestment = (printer?.printer_cost || 0) + (printer?.additional_upfront_cost || 0)
  const lifeYears = printer?.estimated_life_years || 0
  const lifetimeCost = totalInvestment + (printer?.estimated_annual_maintenance || 0) * lifeYears
  const uptimeHoursPerYear = 8760 * (printer?.estimated_printer_uptime_percent || 0)
  const denom = uptimeHoursPerYear * lifeYears
  // Guard against zero/undefined life or uptime producing Infinity/NaN.
  const machineCostPerHour = denom > 0 ? lifetimeCost / denom : 0
  const machineCost = hours * machineCostPerHour
  const electricityCost = ((printer?.average_power_consumption_watts || 0) / 1000) * hours * electricityRate
  return { machineCost, electricityCost }
}

export function CostCalculator({ quoteType, printers, filaments }: CalculatorProps) {
  const [quoteName, setQuoteName] = useState("")
  const [parts, setParts] = useState<Part[]>([
    {
      id: "1",
      partName: "",
      printer: null,
      filaments: [{ id: "1", filament: null, weight: "" }],
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
        // global_settings stores electricity_cost_per_kwh; earlier code read a
        // non-existent `electricity_rate` column and always used the fallback.
        electricity_rate: data.electricity_cost_per_kwh ?? 0.15,
        // VAT is a flat 23% across the app (there is no settings column for it).
        vat_rate: 0.23,
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
        filaments: [{ id: Date.now().toString(), filament: filaments[0] || null, weight: "" }],
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

  const addFilamentToPart = (partId: string) => {
    setParts(
      parts.map((p) => {
        if (p.id === partId) {
          return {
            ...p,
            filaments: [...p.filaments, { id: Date.now().toString(), filament: filaments[0] || null, weight: "" }],
          }
        }
        return p
      }),
    )
  }

  const removeFilamentFromPart = (partId: string, filamentEntryId: string) => {
    setParts(
      parts.map((p) => {
        if (p.id === partId && p.filaments.length > 1) {
          return {
            ...p,
            filaments: p.filaments.filter((f) => f.id !== filamentEntryId),
          }
        }
        return p
      }),
    )
  }

  const updateFilamentInPart = (partId: string, filamentEntryId: string, field: "filament" | "weight", value: any) => {
    setParts(
      parts.map((p) => {
        if (p.id === partId) {
          return {
            ...p,
            filaments: p.filaments.map((f) => {
              if (f.id === filamentEntryId) {
                return { ...f, [field]: value }
              }
              return f
            }),
          }
        }
        return p
      }),
    )
  }

  const calculate = () => {
    let totalFilamentCost = 0
    let totalMachineCost = 0
    let totalElectricityCost = 0
    let totalDryerCost = 0
    let totalEmergencyFees = 0
    const partResults: any[] = []

    for (const part of parts) {
      // Skip parts that have no USABLE filament (a filament selected AND a
      // weight), matching saveQuote()'s filter below. Previously this only
      // checked filaments.length, so a part with a printer + print time but a
      // blank/unselected filament was counted on screen yet dropped on save —
      // making the displayed landed cost diverge from what got persisted.
      if (!part.printer || !part.printTime || !part.filaments.some((f) => f.filament && f.weight)) {
        continue
      }

      const hours = safeNum(part.printTime)
      const emergency = safeNum(part.emergencyFee)

      // Calculate filament cost from all filaments in this part
      let partFilamentCost = 0
      for (const filamentEntry of part.filaments) {
        if (filamentEntry.filament && filamentEntry.weight) {
          const weightInKg = safeNum(filamentEntry.weight) / 1000
          partFilamentCost += weightInKg * filamentEntry.filament.price_per_kg
        }
      }

      const { machineCost, electricityCost } = computePartMachineCosts(
        part.printer,
        hours,
        globalSettings.electricity_rate,
      )
      const dryerCost = 0 // Can be calculated based on dryer settings if needed

      totalFilamentCost += partFilamentCost
      totalMachineCost += machineCost
      totalElectricityCost += electricityCost
      totalDryerCost += dryerCost
      totalEmergencyFees += emergency

      partResults.push({
        partName: part.partName,
        printer: part.printer,
        filamentCost: partFilamentCost,
        machineCost,
        electricityCost,
        dryerCost,
        emergencyFee: emergency,
      })
    }

    // safeNum coerces a cleared ("") field to 0 instead of NaN, so blanking any
    // additional-cost input no longer turns the whole quote into $NaN.
    const materials = safeNum(materialsCost)
    const labor = safeNum(laborCost)
    const packaging = safeNum(packagingCost)
    const shipping = safeNum(shippingCost)

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

    // Attribute machine cost to each owner by the owner of the printer used on
    // each part, instead of dumping the whole total onto the first part's
    // owner. For single-owner quotes this collapses to the old behaviour; for
    // mixed-owner quotes the per-owner split is now correct.
    let ownerAMachineCost = 0
    let ownerBMachineCost = 0
    for (const p of partResults) {
      const partOwner = p?.printer?.owner || OWNER_B_KEY
      if (partOwner === OWNER_A_KEY) ownerAMachineCost += p.machineCost
      else ownerBMachineCost += p.machineCost
    }

    const totalCosts =
      totalFilamentCost + totalMachineCost + materials + labor + packaging + shipping + electricityCost + emergencyFees
    const profit = salePrice - totalCosts
    const ownerAProfit = profit * PROFIT_SPLIT_RATIO
    const ownerBProfit = profit * (1 - PROFIT_SPLIT_RATIO)
    const ownerAEmergency = emergencyFees * EMERGENCY_SPLIT_RATIO
    const ownerBEmergency = emergencyFees * (1 - EMERGENCY_SPLIT_RATIO)
    const vatCost = salePrice * vatRate
    // The customer pays the (VAT-exclusive) margin price PLUS VAT. Surfacing
    // this VAT-inclusive figure lets the two owner totals reconcile to what is
    // actually charged (salePrice * (1 + vatRate)).
    const clientPrice = salePrice + vatCost

    // Retained only as a display hint (owner of the first part). It no longer
    // drives the machine-cost allocation above.
    const owner = partResults[0]?.printer?.owner || OWNER_B_KEY

    // Owner A fronts labour, electricity and shipping (mirrors excel-calculator,
    // which assigns fuel/shipping to Owner A). Previously shipping was subtracted
    // from distributable profit but never reimbursed to either owner, so the two
    // totals fell short by exactly `shipping`. Owner B carries filament,
    // materials, packaging and the VAT pass-through.
    const ownerATotal =
      ownerAMachineCost + labor + electricityCost + shipping + ownerAProfit + ownerAEmergency
    const ownerBTotal =
      ownerBMachineCost + totalFilamentCost + materials + packaging + ownerBProfit + ownerBEmergency + vatCost

    return {
      owner,
      profit,
      vatCost,
      clientPrice,
      ownerA: {
        machineCost: ownerAMachineCost,
        labor,
        electricityCost,
        shipping,
        profitSplit: ownerAProfit,
        emergencySplit: ownerAEmergency,
        total: ownerATotal,
      },
      ownerB: {
        machineCost: ownerBMachineCost,
        filamentCost: totalFilamentCost,
        materials,
        packaging,
        profitSplit: ownerBProfit,
        emergencySplit: ownerBEmergency,
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

    // Insert quote parts - updated to handle multiple filaments.
    // This filter uses the SAME predicate as the calculate() loop guard, so the
    // qualifying parts here line up index-for-index with results.partResults.
    // We reuse the already-computed machine/electricity/filament costs from
    // results.partResults instead of recomputing them, guaranteeing the saved
    // numbers equal the numbers the user saw (and avoiding duplicated, drifting
    // cost math between the two paths).
    const partInserts = parts
      .filter((p) => p.printer && p.printTime && p.filaments.some((f) => f.filament && f.weight))
      .map((part, i) => {
        const pr = results.partResults?.[i]
        const hours = safeNum(part.printTime)
        const emergency = safeNum(part.emergencyFee)

        // Total filament weight + display names (cost comes from pr below).
        let totalWeight = 0
        const filamentNames: string[] = []

        for (const filamentEntry of part.filaments) {
          if (filamentEntry.filament && filamentEntry.weight) {
            totalWeight += safeNum(filamentEntry.weight)
            filamentNames.push(filamentEntry.filament.name)
          }
        }

        return {
          quote_header_id: header.id,
          part_name: part.partName || "Unnamed Part",
          printer_id: part.printer?.id,
          printer_name: part.printer?.name,
          printer_owner: part.printer?.owner || OWNER_B_KEY,
          filament_id: part.filaments[0]?.filament?.id, // Primary filament ID for backwards compatibility
          filament_name: filamentNames.join(", "), // Concatenated filament names
          filament_weight_grams: totalWeight,
          print_time_hours: hours,
          emergency_fee: emergency,
          filament_cost: pr?.filamentCost ?? 0,
          machine_cost: pr?.machineCost ?? 0,
          electricity_cost: pr?.electricityCost ?? 0,
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

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Filaments</Label>
                      <Button
                        onClick={() => addFilamentToPart(part.id)}
                        size="sm"
                        variant="outline"
                        className="text-blue-400 border-blue-400 hover:bg-blue-950"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Filament
                      </Button>
                    </div>

                    {part.filaments.map((filamentEntry, fIndex) => (
                      <div
                        key={filamentEntry.id}
                        className="flex items-end gap-2 p-2 bg-slate-800 rounded border border-slate-700"
                      >
                        <div className="flex-1">
                          <Label className="text-slate-400 text-xs">Filament {fIndex + 1}</Label>
                          <Select
                            value={filamentEntry.filament?.id}
                            onValueChange={(id) =>
                              updateFilamentInPart(
                                part.id,
                                filamentEntry.id,
                                "filament",
                                filaments.find((f) => f.id === id),
                              )
                            }
                          >
                            <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
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
                        <div className="w-24">
                          <Label className="text-slate-400 text-xs">Weight (g)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={filamentEntry.weight}
                            onChange={(e) => updateFilamentInPart(part.id, filamentEntry.id, "weight", e.target.value)}
                            className="bg-slate-900 border-slate-600 text-white"
                            placeholder="100"
                          />
                        </div>
                        {part.filaments.length > 1 && (
                          <Button
                            onClick={() => removeFilamentFromPart(part.id, filamentEntry.id)}
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-950 h-9"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
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
                  {results.totalEmergencyFees > 0 && (
                    <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                      <span className="text-slate-400">Emergency Fees</span>
                      <span className="text-white font-semibold">${results.totalEmergencyFees.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-600">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-slate-300 font-semibold">Landed Cost</span>
                    <span className="text-white text-xl font-bold">${results.landedCost.toFixed(2)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-900 rounded-lg text-center">
                      <div className="text-slate-400 text-sm">30% Margin</div>
                      <div className="text-green-400 font-bold">${results.margin30.toFixed(2)}</div>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-lg text-center">
                      <div className="text-slate-400 text-sm">40% Margin</div>
                      <div className="text-green-400 font-bold">${results.margin40.toFixed(2)}</div>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-lg text-center">
                      <div className="text-slate-400 text-sm">50% Margin</div>
                      <div className="text-green-400 font-bold">${results.margin50.toFixed(2)}</div>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-lg text-center">
                      <div className="text-slate-400 text-sm">60% Margin</div>
                      <div className="text-green-400 font-bold">${results.margin60.toFixed(2)}</div>
                    </div>
                  </div>
                </div>

                {results.profitSplits && (
                  <div className="pt-4 border-t border-slate-600">
                    <h3 className="text-white font-semibold mb-3">Profit Split (50% Margin)</h3>
                    {/* The customer is charged the VAT-inclusive price; the two
                        owner totals below sum to exactly this amount. */}
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-700">
                      <span className="text-slate-300 font-semibold">Client Pays (incl. VAT)</span>
                      <span className="text-white font-bold">
                        ${results.profitSplits.clientPrice.toFixed(2)}
                      </span>
                    </div>
                    <div className="space-y-3">
                      <div className="p-3 bg-purple-950 rounded-lg">
                        <div className="text-purple-300 text-sm mb-1">{OWNER_A_LABEL} Receives</div>
                        <div className="text-white font-bold">${results.profitSplits.ownerA.total.toFixed(2)}</div>
                      </div>
                      <div className="p-3 bg-blue-950 rounded-lg">
                        <div className="text-blue-300 text-sm mb-1">{OWNER_B_LABEL} Receives</div>
                        <div className="text-white font-bold">${results.profitSplits.ownerB.total.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                )}

                <Button onClick={saveQuote} disabled={isSaving} className="w-full bg-green-600 hover:bg-green-700">
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? "Saving..." : "Save Quote"}
                </Button>
              </>
            ) : (
              <div className="text-center text-slate-400 py-8">
                <Calculator className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Enter part details and click Calculate to see results</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
