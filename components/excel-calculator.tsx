"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Save } from "lucide-react"
import { useToast } from "@/components/ui/use-toast" // Assuming toast is available
import { DialogCustom } from "@/components/ui/dialog-custom" // Import DialogCustom

type Printer = {
  id: string
  name: string
  owner: string | null
  printer_cost: number
  estimated_life_years: number
  average_power_consumption_watts: number
  additional_upfront_cost: number
  estimated_annual_maintenance: number
  estimated_printer_uptime_percent: number
}

type Filament = {
  id: string
  name: string
  price_per_kg: number
  requires_heating: boolean
  heating_time_hours: number
}

type GlobalSettings = {
  id: string
  electricity_cost_per_kwh: number
  fuel_cost_per_liter: number
  car_fuel_consumption_per_100km: number
  emergency_fee_fixed: number
  labor_hourly_rate: number
}

type PrintedPart = {
  id: string
  name: string
  filament_id: string
  printer_id: string
  filament_grams: number
  printing_time_hr: number
}

type DriedBatch = {
  id: string
  material: string
  drying_time_hr: number
  cost: number
}

type Material = {
  id: string
  name: string
  quantity: number
  unit_cost: number
}

type Labor = {
  id: string
  action: string
  hours: number
  hourly_cost: number
}

type Packaging = {
  id: string
  name: string
  quantity: number
  unit_cost: number
}

type ExcelCalculatorProps = {
  printers: Printer[]
  filaments: Filament[]
  globalSettings: GlobalSettings
  mode: "personal" | "business"
}

export function ExcelCalculator({
  printers: initialPrinters,
  filaments: initialFilaments,
  globalSettings: initialGlobalSettings,
  mode,
}: ExcelCalculatorProps) {
  const { toast } = useToast() // Initialize toast
  const supabase = createClient() // Declare supabase client here

  const [printedParts, setPrintedParts] = useState<PrintedPart[]>([])
  const [driedBatches, setDriedBatches] = useState<DriedBatch[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [labor, setLabor] = useState<Labor[]>([])
  const [packaging, setPackaging] = useState<Packaging[]>([])
  const [clientName, setClientName] = useState("") // Changed from quoteName to clientName for consistency with original code
  const [isEmergency, setIsEmergency] = useState(false)
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(initialGlobalSettings)
  const [printers, setPrinters] = useState<Printer[]>(initialPrinters)
  const [filaments, setFilaments] = useState<Filament[]>(initialFilaments)
  const [distanceTraveledKm, setDistanceTraveledKm] = useState(0)

  // ADDED STATE FOR MARGIN SELECTION
  const [selectedMargin, setSelectedMargin] = useState<30 | 40 | 50 | 60>(50)

  // ADDED STATE FOR REAL-TIME UPDATES
  useEffect(() => {
    // Subscribe to global settings changes
    const globalSettingsChannel = supabase
      .channel("global-settings-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "global_settings",
        },
        () => {
          // Refetch global settings when they change
          supabase
            .from("global_settings")
            .select("*")
            .single()
            .then(({ data }) => {
              if (data) setGlobalSettings(data)
            })
        },
      )
      .subscribe()

    // Subscribe to printers changes
    const printersChannel = supabase
      .channel("printers-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "printers",
        },
        () => {
          // Refetch printers when they change
          supabase
            .from("printers")
            .select("*")
            .then(({ data }) => {
              if (data) setPrinters(data)
            })
        },
      )
      .subscribe()

    // Subscribe to filaments changes
    const filamentsChannel = supabase
      .channel("filaments-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "filaments",
        },
        () => {
          // Refetch filaments when they change
          supabase
            .from("filaments")
            .select("*")
            .then(({ data }) => {
              if (data) setFilaments(data)
            })
        },
      )
      .subscribe()

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeChannel(globalSettingsChannel)
      supabase.removeChannel(printersChannel)
      supabase.removeChannel(filamentsChannel)
    }
  }, [])

  useEffect(() => {
    // Create a map of heating requirements from printed parts
    const heatingRequirements: { [key: string]: number } = {}

    printedParts.forEach((part) => {
      if (!part.filament_id || !part.printing_time_hr) return

      const filament = filaments.find((f) => f.id === part.filament_id)
      if (filament?.requires_heating) {
        // Use filament name as key and accumulate printing time
        if (!heatingRequirements[filament.name]) {
          heatingRequirements[filament.name] = 0
        }
        heatingRequirements[filament.name] += part.printing_time_hr
      }
    })

    // Update driedBatches - remove old HEATING entries and add new ones
    setDriedBatches((current) => {
      // Keep non-HEATING batches
      const nonHeatingBatches = current.filter((batch) => batch.material !== "HEATING")

      // Add HEATING entries for each filament that requires heating
      const heatingBatches: DriedBatch[] = Object.entries(heatingRequirements).map(([filamentName, hours]) => ({
        id: `heating_${filamentName}_${Date.now()}`,
        material: "HEATING",
        drying_time_hr: hours,
        cost: 0, // Initialize cost to 0, it will be calculated later if needed
      }))

      return [...nonHeatingBatches, ...heatingBatches]
    })
  }, [printedParts, filaments])

  const totalPrintingCost = printedParts.reduce((sum, part) => {
    if (!part.filament_grams || !part.filament_id) return sum
    const filament = filaments.find((f) => f.id === part.filament_id)
    if (!filament) return sum
    // Excel formula: HLOOKUP price * grams / 1000
    return sum + (filament.price_per_kg * part.filament_grams) / 1000
  }, 0)

  const totalDryingCost = driedBatches.reduce((sum, batch) => {
    if (!batch.drying_time_hr || !globalSettings) return sum

    // Calculate Dryer Cost per hour using the exact Excel formula
    const dryerCost = 90 // Standard dryer cost from Excel
    const estimatedLife = 3 // years
    const estimatedDryerUptime = 0.1 // 10% uptime
    const dryerUptimeHoursPerYear = 8760 * estimatedDryerUptime
    const dryerCapitalCostPerHour = dryerCost / (dryerUptimeHoursPerYear * estimatedLife)

    // Get the electrical cost per hour (same as printer electrical cost)
    const electricalCostPerHour = (150 / 1000) * globalSettings.electricity_cost_per_kwh // Using 150W average

    const costBufferFactor = 1.3
    const totalDryerCostPerHour = (dryerCapitalCostPerHour + electricalCostPerHour) * costBufferFactor

    if (batch.material === "HEATING") {
      // For HEATING, multiply the total dryer cost per hour by 2
      return sum + batch.drying_time_hr * totalDryerCostPerHour * 2
    }
    // Normal drying uses the standard dryer cost per hour
    return sum + batch.drying_time_hr * totalDryerCostPerHour
  }, 0)

  const machineCost = (() => {
    if (!globalSettings) return 0

    let totalMachineCost = 0
    printedParts.forEach((part) => {
      if (!part.printing_time_hr || !part.printer_id) return
      const printer = printers.find((p) => p.id === part.printer_id)
      if (!printer) return

      // Calculate printer cost per hour based on Excel formula
      const totalInvestment = printer.printer_cost + printer.additional_upfront_cost
      const lifetimeCost = totalInvestment + printer.estimated_annual_maintenance * printer.estimated_life_years
      const estimatedUptimeHoursPerYear = 8760 * printer.estimated_printer_uptime_percent
      const printerCapitalCostPerHour = lifetimeCost / (estimatedUptimeHoursPerYear * printer.estimated_life_years)

      const electricalCostPerHour =
        (printer.average_power_consumption_watts / 1000) * globalSettings.electricity_cost_per_kwh
      const costBufferFactor = 1.3

      const totalPrinterCostPerHour = (printerCapitalCostPerHour + electricalCostPerHour) * costBufferFactor

      totalMachineCost += part.printing_time_hr * totalPrinterCostPerHour
    })

    return totalMachineCost + totalDryingCost
  })()

  const totalMaterialsCost = materials.reduce((sum, m) => sum + m.quantity * m.unit_cost, 0)
  const totalLaborCost = labor.reduce((sum, l) => sum + l.hours * l.hourly_cost, 0)
  const totalPackagingCost = packaging.reduce((sum, p) => sum + p.quantity * p.unit_cost, 0)

  const fuelCost = (() => {
    if (!globalSettings) return 0
    return (
      (distanceTraveledKm / 100) * globalSettings.car_fuel_consumption_per_100km * globalSettings.fuel_cost_per_liter
    )
  })()

  const emergencyFee = isEmergency && globalSettings ? globalSettings.emergency_fee_fixed : 0

  const electricityCost = (() => {
    if (!globalSettings) return 0
    let total = 0
    printedParts.forEach((part) => {
      if (part.printing_time_hr > 0 && part.printer_id) {
        const printer = printers.find((p) => p.id === part.printer_id)
        if (printer) {
          total +=
            part.printing_time_hr *
            (printer.average_power_consumption_watts / 1000) *
            globalSettings.electricity_cost_per_kwh
        }
      }
    })
    return total
  })()

  const totalLandedCost =
    totalMaterialsCost + fuelCost + totalPrintingCost + machineCost + totalLaborCost + totalPackagingCost + emergencyFee

  const margin30 = isEmergency && globalSettings ? totalLandedCost - emergencyFee : totalLandedCost / (1 - 0.3)
  const margin40 = isEmergency && globalSettings ? totalLandedCost - emergencyFee : totalLandedCost / (1 - 0.4)
  const margin50 = isEmergency && globalSettings ? totalLandedCost - emergencyFee : totalLandedCost / (1 - 0.5)
  const margin60 = isEmergency && globalSettings ? totalLandedCost - emergencyFee : totalLandedCost / (1 - 0.6)

  const selectedMarginValue =
    selectedMargin === 30 ? margin30 : selectedMargin === 40 ? margin40 : selectedMargin === 50 ? margin50 : margin60

  const vatRate = 0.23
  const vatAmountFromLandedCost = mode === "business" ? totalLandedCost * vatRate : 0
  const vatAmountFromSellingPrice = mode === "business" ? selectedMarginValue * vatRate : 0

  const margin30WithVAT = mode === "business" ? margin30 * (1 + vatRate) : margin30
  const margin40WithVAT = mode === "business" ? margin40 * (1 + vatRate) : margin40
  const margin50WithVAT = mode === "business" ? margin50 * (1 + vatRate) : margin50
  const margin60WithVAT = mode === "business" ? margin60 * (1 + vatRate) : margin60

  const finalClientPrice = mode === "business" ? selectedMarginValue * (1 + vatRate) : selectedMarginValue

  // Business profit split calculations
  let ownerAReceives = 0
  let ownerBReceives = 0

  if (mode === "business") {
    const ownerPrinter = printedParts.length > 0 ? printers.find((p) => p.id === printedParts[0].printer_id) : null
    const owner = ownerPrinter?.owner || "Owner B"

    const totalProfit = selectedMarginValue - totalLandedCost
    const halfProfit = totalProfit / 2
    const halfEmergency = emergencyFee / 2

    if (owner === "Owner A") {
      ownerAReceives = machineCost + totalLaborCost + fuelCost + halfProfit + halfEmergency
      ownerBReceives =
        totalPrintingCost +
        totalMaterialsCost +
        totalPackagingCost +
        halfProfit +
        halfEmergency +
        vatAmountFromSellingPrice
    } else {
      ownerAReceives = totalLaborCost + fuelCost + halfProfit + halfEmergency + electricityCost
      ownerBReceives =
        machineCost +
        totalPrintingCost +
        totalMaterialsCost +
        totalPackagingCost +
        halfProfit +
        halfEmergency +
        vatAmountFromSellingPrice -
        electricityCost // Subtract electricity cost from Owner B's share since Owner A receives it
    }
  }

  // ADDED STATE FOR SAVE DIALOG
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveDialogMessage, setSaveDialogMessage] = useState("")

  // ADDED STATE FOR ERROR DIALOG
  const [showErrorDialog, setShowErrorDialog] = useState(false)
  const [errorDialogTitle, setErrorDialogTitle] = useState("")
  const [errorDialogMessage, setErrorDialogMessage] = useState("")

  const handleSaveQuote = async () => {
    console.log("[v0] handleSaveQuote called")
    console.log("[v0] Client name:", clientName)
    console.log("[v0] Selected margin:", selectedMargin)

    if (!clientName.trim()) {
      console.log("[v0] Client name is empty, showing error")
      setErrorDialogTitle("Client Name Required")
      setErrorDialogMessage("Please enter a client name before saving the quote.")
      setShowErrorDialog(true)
      return
    }

    try {
      console.log("[v0] Starting quote save process...")

      const driedBatchesWithCost = driedBatches.map((batch) => {
        const dryerCost = 90
        const estimatedLife = 3
        const estimatedDryerUptime = 0.1
        const dryerUptimeHoursPerYear = 8760 * estimatedDryerUptime
        const dryerCapitalCostPerHour = dryerCost / (dryerUptimeHoursPerYear * estimatedLife)

        const electricalCostPerHour = globalSettings ? (150 / 1000) * globalSettings.electricity_cost_per_kwh : 0

        const costBufferFactor = 1.3
        const totalDryerCostPerHour = (dryerCapitalCostPerHour + electricalCostPerHour) * costBufferFactor

        const cost =
          batch.material === "HEATING"
            ? batch.drying_time_hr * totalDryerCostPerHour * 2
            : batch.drying_time_hr * totalDryerCostPerHour

        return {
          ...batch,
          cost: cost,
        }
      })

      const quoteData = {
        quote_name: clientName, // Changed from quoteName to clientName
        quote_type: mode,
        printed_parts: printedParts,
        dried_batches: driedBatchesWithCost, // Save batches with cost included
        materials: materials,
        labor_items: labor,
        packaging_items: packaging,
        distance_traveled_km: distanceTraveledKm,
        is_emergency: isEmergency,
        total_printing_cost: totalPrintingCost,
        machine_cost: machineCost,
        drying_cost: totalDryingCost,
        materials_cost: totalMaterialsCost,
        labor_cost: totalLaborCost,
        packaging_cost: totalPackagingCost,
        fuel_cost: fuelCost,
        emergency_fee: emergencyFee,
        electricity_cost: electricityCost,
        landed_cost: totalLandedCost,
        margin_30: margin30,
        margin_40: margin40,
        margin_50: margin50,
        margin_60: margin60,
        selected_margin: selectedMargin, // This stores the percentage (30, 40, 50, or 60)
        ownerA_receives: mode === "business" ? ownerAReceives : null,
        ownerB_receives: mode === "business" ? ownerBReceives : null,
      }

      console.log("[v0] Quote data prepared:", quoteData)
      console.log("[v0] Inserting into database...")

      const { error } = await supabase.from("quotes").insert([quoteData])

      if (error) {
        console.log("[v0] Database error:", error)
        throw error
      }

      console.log("[v0] Quote saved successfully to database")
      console.log("[v0] Setting dialog message and showing dialog")

      // CHANGED: Show custom success dialog instead of toast
      setSaveDialogMessage(`Quote "${clientName}" has been saved successfully!`)
      setShowSaveDialog(true)

      console.log("[v0] Dialog state set to:", true)
      console.log("[v0] Dialog message:", `Quote "${clientName}" has been saved successfully!`)

      setClientName("") // Changed from quoteName to clientName
    } catch (error: any) {
      console.error("[v0] Error saving quote:", error)
      toast({
        title: "Error",
        description: `Error saving quote: ${error.message}`,
        variant: "destructive",
      })
    }
  }

  if (!globalSettings) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-blue-600">Loading calculator...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* ADDED: Error dialog for validation failures */}
      <DialogCustom
        isOpen={showErrorDialog}
        onClose={() => setShowErrorDialog(false)}
        title={errorDialogTitle}
        message={errorDialogMessage}
        onConfirm={() => setShowErrorDialog(false)}
        confirmText="OK"
        variant="danger"
        showCancel={false}
      />

      {/* ADDED: Save success dialog */}
      <DialogCustom
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        title="Quote Saved Successfully"
        message={saveDialogMessage}
        onConfirm={() => setShowSaveDialog(false)}
        confirmText="OK"
        variant="success"
        showCancel={false}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Quote Details */}
        <Card className="p-6 bg-white border-2 border-blue-300">
          <h2 className="text-xl font-bold text-blue-900 mb-4">Quote Details</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="clientName" className="text-blue-900">
                Client Name
              </Label>
              <Input
                id="clientName"
                value={clientName} // Changed from quoteName to clientName
                onChange={(e) => setClientName(e.target.value)} // Changed from quoteName to clientName
                className="border-blue-200 bg-white"
                placeholder="e.g., Client Name - Project"
              />
            </div>
            <div>
              <Label htmlFor="distance" className="text-blue-900">
                Distance Traveled (km)
              </Label>
              <Input
                id="distance"
                type="number"
                inputMode="numeric"
                step="0.1"
                value={distanceTraveledKm || ""}
                onChange={(e) => {
                  const value = e.target.value
                  setDistanceTraveledKm(value === "" ? 0 : Number.parseFloat(value) || 0)
                }}
                className="border-blue-200 bg-white"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2 mt-4">
            <Checkbox
              id="emergency"
              checked={isEmergency}
              onCheckedChange={(checked) => setIsEmergency(checked as boolean)}
            />
            <Label htmlFor="emergency" className="font-semibold text-blue-900">
              Emergency Order (+€{globalSettings.emergency_fee_fixed.toFixed(2)})
            </Label>
          </div>
        </Card>

        {/* Printed Parts Table */}
        <Card className="p-6 bg-white border-2 border-blue-300">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-blue-900">Printed Parts (Filament Input)</h2>
            <Button
              onClick={() =>
                setPrintedParts([
                  ...printedParts,
                  {
                    id: Date.now().toString(),
                    name: "",
                    filament_id: "",
                    printer_id: "",
                    filament_grams: 0,
                    printing_time_hr: 0,
                  },
                ])
              }
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Part
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-blue-100 border-b-2 border-blue-300">
                  <th className="p-3 text-left text-blue-900 font-semibold">Part Name</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Printer</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Filament</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Weight (g)</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Print Time (hr)</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Cost (€)</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {printedParts.map((part, index) => {
                  const filament = filaments.find((f) => f.id === part.filament_id)
                  const cost = filament ? (filament.price_per_kg * part.filament_grams) / 1000 : 0
                  return (
                    <tr key={part.id} className="border-b border-blue-200">
                      <td className="p-2">
                        <Input
                          value={part.name}
                          onChange={(e) => {
                            const updated = [...printedParts]
                            updated[index].name = e.target.value
                            setPrintedParts(updated)
                          }}
                          className="border-blue-200 bg-white"
                          placeholder="Part name"
                        />
                      </td>
                      <td className="p-2">
                        <Select
                          value={part.printer_id}
                          onValueChange={(value) => {
                            const updated = [...printedParts]
                            updated[index].printer_id = value
                            setPrintedParts(updated)
                          }}
                        >
                          <SelectTrigger className="border-blue-200 bg-white">
                            <SelectValue placeholder="Select printer" />
                          </SelectTrigger>
                          <SelectContent>
                            {printers.map((printer) => (
                              <SelectItem key={printer.id} value={printer.id}>
                                {printer.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Select
                          value={part.filament_id}
                          onValueChange={(value) => {
                            const updated = [...printedParts]
                            updated[index].filament_id = value
                            setPrintedParts(updated)
                          }}
                        >
                          <SelectTrigger className="border-blue-200 bg-white">
                            <SelectValue placeholder="Select filament" />
                          </SelectTrigger>
                          <SelectContent>
                            {filaments.map((filament) => (
                              <SelectItem key={filament.id} value={filament.id}>
                                {filament.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          inputMode="numeric" // Added inputMode
                          step="0.1"
                          value={part.filament_grams || ""}
                          onChange={(e) => {
                            const updated = [...printedParts]
                            const value = e.target.value
                            updated[index].filament_grams = value === "" ? 0 : Number.parseFloat(value) || 0
                            setPrintedParts(updated)
                          }}
                          className="border-blue-200 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          inputMode="numeric" // Added inputMode
                          step="0.1"
                          value={part.printing_time_hr || ""}
                          onChange={(e) => {
                            const updated = [...printedParts]
                            const value = e.target.value
                            updated[index].printing_time_hr = value === "" ? 0 : Number.parseFloat(value) || 0
                            setPrintedParts(updated)
                          }}
                          className="border-blue-200 bg-white"
                        />
                      </td>
                      <td className="p-2 text-blue-900 font-semibold">€{cost.toFixed(2)}</td>
                      <td className="p-2">
                        <Button
                          onClick={() => setPrintedParts(printedParts.filter((_, i) => i !== index))}
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-right">
            <span className="text-blue-900 font-bold">Total Printing Cost: €{totalPrintingCost.toFixed(2)}</span>
          </div>
        </Card>

        <Card className="p-6 bg-white border-2 border-blue-300">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-blue-900">Dried Batches</h2>
            <Button
              onClick={() =>
                setDriedBatches([
                  ...driedBatches,
                  { id: Date.now().toString(), material: "", drying_time_hr: 0, cost: 0 },
                ])
              }
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Batch
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-blue-100 border-b-2 border-blue-300">
                  <th className="p-3 text-left text-blue-900 font-semibold">Material</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Drying Time (hr)</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Cost (€)</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {driedBatches.map((batch, index) => {
                  const dryerCost = 90
                  const estimatedLife = 3
                  const estimatedDryerUptime = 0.1
                  const dryerUptimeHoursPerYear = 8760 * estimatedDryerUptime
                  const dryerCapitalCostPerHour = dryerCost / (dryerUptimeHoursPerYear * estimatedLife)

                  const electricalCostPerHour = globalSettings
                    ? (150 / 1000) * globalSettings.electricity_cost_per_kwh
                    : 0

                  const costBufferFactor = 1.3
                  const totalDryerCostPerHour = (dryerCapitalCostPerHour + electricalCostPerHour) * costBufferFactor

                  const cost =
                    batch.material === "HEATING"
                      ? batch.drying_time_hr * totalDryerCostPerHour * 2
                      : batch.drying_time_hr * totalDryerCostPerHour

                  return (
                    <tr key={batch.id} className="border-b border-blue-200">
                      <td className="p-2">
                        <Select
                          value={batch.material}
                          onValueChange={(value) => {
                            const updated = [...driedBatches]
                            updated[index].material = value
                            setDriedBatches(updated)
                          }}
                        >
                          <SelectTrigger className="border-blue-200 bg-white">
                            <SelectValue placeholder="Select material" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="HEATING">HEATING</SelectItem>
                            {filaments.map((filament) => (
                              <SelectItem key={filament.id} value={filament.name}>
                                {filament.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          step="0.1"
                          value={batch.drying_time_hr || ""}
                          onChange={(e) => {
                            const updated = [...driedBatches]
                            updated[index].drying_time_hr = Number.parseFloat(e.target.value) || 0
                            setDriedBatches(updated)
                          }}
                          className="border-blue-200 bg-white"
                        />
                      </td>
                      <td className="p-2 text-blue-900 font-semibold">€{cost.toFixed(2)}</td>
                      <td className="p-2">
                        <Button
                          onClick={() => setDriedBatches(driedBatches.filter((_, i) => i !== index))}
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-right">
            <span className="text-blue-900 font-bold">Total Drying Cost: €{totalDryingCost.toFixed(2)}</span>
          </div>
        </Card>

        {/* Materials Table */}
        <Card className="p-6 bg-white border-2 border-blue-300">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-blue-900">Materials (Hardware, etc.)</h2>
            <Button
              onClick={() =>
                setMaterials([...materials, { id: Date.now().toString(), name: "", quantity: 0, unit_cost: 0 }])
              }
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Material
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-blue-100 border-b-2 border-blue-300">
                  <th className="p-3 text-left text-blue-900 font-semibold">Name</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Quantity</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Unit Cost (€)</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Total Cost (€)</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {materials.map((material, index) => {
                  const cost = material.quantity * material.unit_cost
                  return (
                    <tr key={material.id} className="border-b border-blue-200">
                      <td className="p-2">
                        <Input
                          value={material.name}
                          onChange={(e) => {
                            const updated = [...materials]
                            updated[index].name = e.target.value
                            setMaterials(updated)
                          }}
                          className="border-blue-200 bg-white"
                          placeholder="Material name"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          inputMode="numeric" // Added inputMode
                          step="0.1"
                          value={material.quantity || ""}
                          onChange={(e) => {
                            const updated = [...materials]
                            const value = e.target.value
                            updated[index].quantity = value === "" ? 0 : Number.parseFloat(value) || 0
                            setMaterials(updated)
                          }}
                          className="border-blue-200 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          inputMode="numeric" // Added inputMode
                          step="0.01"
                          value={material.unit_cost || ""}
                          onChange={(e) => {
                            const updated = [...materials]
                            const value = e.target.value
                            updated[index].unit_cost = value === "" ? 0 : Number.parseFloat(value) || 0
                            setMaterials(updated)
                          }}
                          className="border-blue-200 bg-white"
                        />
                      </td>
                      <td className="p-2 text-blue-900 font-semibold">€{cost.toFixed(2)}</td>
                      <td className="p-2">
                        <Button
                          onClick={() => setMaterials(materials.filter((_, i) => i !== index))}
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-right">
            <span className="text-blue-900 font-bold">Total Materials Cost: €{totalMaterialsCost.toFixed(2)}</span>
          </div>
        </Card>

        {/* Labor Table */}
        <Card className="p-6 bg-white border-2 border-blue-300">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-blue-900">Labor</h2>
            <Button
              onClick={() => setLabor([...labor, { id: Date.now().toString(), action: "", hours: 0, hourly_cost: 0 }])}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Labor
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-blue-100 border-b-2 border-blue-300">
                  <th className="p-3 text-left text-blue-900 font-semibold">Action</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Hours</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Hourly Cost (€)</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Total Cost (€)</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {labor.map((laborItem, index) => {
                  const cost = laborItem.hours * laborItem.hourly_cost
                  return (
                    <tr key={laborItem.id} className="border-b border-blue-200">
                      <td className="p-2">
                        <Input
                          value={laborItem.action}
                          onChange={(e) => {
                            const updated = [...labor]
                            updated[index].action = e.target.value
                            setLabor(updated)
                          }}
                          className="border-blue-200 bg-white"
                          placeholder="Labor action"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          inputMode="numeric" // Added inputMode
                          step="0.1"
                          value={laborItem.hours || ""}
                          onChange={(e) => {
                            const updated = [...labor]
                            const value = e.target.value
                            updated[index].hours = value === "" ? 0 : Number.parseFloat(value) || 0
                            setLabor(updated)
                          }}
                          className="border-blue-200 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          inputMode="numeric" // Added inputMode
                          step="0.01"
                          value={laborItem.hourly_cost || ""}
                          onChange={(e) => {
                            const updated = [...labor]
                            const value = e.target.value
                            updated[index].hourly_cost = value === "" ? 0 : Number.parseFloat(value) || 0
                            setLabor(updated)
                          }}
                          className="border-blue-200 bg-white"
                        />
                      </td>
                      <td className="p-2 text-blue-900 font-semibold">€{cost.toFixed(2)}</td>
                      <td className="p-2">
                        <Button
                          onClick={() => setLabor(labor.filter((_, i) => i !== index))}
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-right">
            <span className="text-blue-900 font-bold">Total Labor Cost: €{totalLaborCost.toFixed(2)}</span>
          </div>
        </Card>

        {/* Packaging & Shipping Table */}
        <Card className="p-6 bg-white border-2 border-blue-300">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-blue-900">Packaging & Shipping</h2>
            <Button
              onClick={() =>
                setPackaging([...packaging, { id: Date.now().toString(), name: "", quantity: 0, unit_cost: 0 }])
              }
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-blue-100 border-b-2 border-blue-300">
                  <th className="p-3 text-left text-blue-900 font-semibold">Name</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Quantity</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Unit Cost (€)</th>
                  <th className="p-3 text-left text-blue-900 font-semibold">Total Cost (€)</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {packaging.map((item, index) => {
                  const cost = item.quantity * item.unit_cost
                  return (
                    <tr key={item.id} className="border-b border-blue-200">
                      <td className="p-2">
                        <Input
                          value={item.name}
                          onChange={(e) => {
                            const updated = [...packaging]
                            updated[index].name = e.target.value
                            setPackaging(updated)
                          }}
                          className="border-blue-200 bg-white"
                          placeholder="Item name"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          inputMode="numeric" // Added inputMode
                          step="0.1"
                          value={item.quantity || ""}
                          onChange={(e) => {
                            const updated = [...packaging]
                            const value = e.target.value
                            updated[index].quantity = value === "" ? 0 : Number.parseFloat(value) || 0
                            setPackaging(updated)
                          }}
                          className="border-blue-200 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          inputMode="numeric" // Added inputMode
                          step="0.01"
                          value={item.unit_cost || ""}
                          onChange={(e) => {
                            const updated = [...packaging]
                            const value = e.target.value
                            updated[index].unit_cost = value === "" ? 0 : Number.parseFloat(value) || 0
                            setPackaging(updated)
                          }}
                          className="border-blue-200 bg-white"
                        />
                      </td>
                      <td className="p-2 text-blue-900 font-semibold">€{cost.toFixed(2)}</td>
                      <td className="p-2">
                        <Button
                          onClick={() => setPackaging(packaging.filter((_, i) => i !== index))}
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-right">
            <span className="text-blue-900 font-bold">Total Packaging Cost: €{totalPackagingCost.toFixed(2)}</span>
          </div>
        </Card>

        {/* Cost Summary */}
        <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-400">
          <h2 className="text-2xl font-bold text-blue-900 mb-6">Quote Summary</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-blue-300">
                <span className="text-blue-700 font-medium">Total Printing Cost:</span>
                <span className="text-blue-900 font-bold">€{totalPrintingCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-blue-300">
                <span className="text-blue-700 font-medium">Added Machine Cost:</span>
                <span className="text-blue-900 font-bold">€{(machineCost - totalDryingCost).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-blue-300">
                <span className="text-blue-700 font-medium">Electricity Cost:</span>
                <span className="text-blue-900 font-bold">€{(electricityCost + totalDryingCost).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-blue-300">
                <span className="text-blue-700 font-medium">Total Materials Cost:</span>
                <span className="text-blue-900 font-bold">€{totalMaterialsCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-blue-300">
                <span className="text-blue-700 font-medium">Total Labor Cost:</span>
                <span className="text-blue-900 font-bold">€{totalLaborCost.toFixed(2)}</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-blue-300">
                <span className="text-blue-700 font-medium">Total Packaging Cost:</span>
                <span className="text-blue-900 font-bold">€{totalPackagingCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-blue-300">
                <span className="text-blue-700 font-medium">Added Fuel Cost:</span>
                <span className="text-blue-900 font-bold">€{fuelCost.toFixed(2)}</span>
              </div>
              {isEmergency && (
                <div className="flex justify-between items-center pb-2 border-b border-blue-300">
                  <span className="text-blue-700 font-medium">Emergency Fee:</span>
                  <span className="text-blue-900 font-bold">€{emergencyFee.toFixed(2)}</span>
                </div>
              )}
              {mode === "business" && (
                <div className="flex justify-between items-center pb-2">
                  <span className="text-blue-700 font-medium">VAT (23%):</span>
                  <span className="text-blue-900 font-bold">€{vatAmountFromLandedCost.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pb-2 pt-2 border-t-2 border-blue-400">
                <span className="text-blue-900 font-bold text-lg">Total Landed Cost:</span>
                <span className="text-blue-900 font-bold text-xl">€{totalLandedCost.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t-2 border-blue-400">
            <h3 className="text-xl font-bold text-blue-900 mb-4">Profit Margins (Click to Select)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div
                className={`p-4 rounded-lg border-2 text-center cursor-pointer hover:shadow-lg transition-shadow ${
                  selectedMargin === 30
                    ? "bg-blue-100 border-blue-500 ring-2 ring-blue-500"
                    : "bg-white border-blue-300"
                }`}
                onClick={() => setSelectedMargin(30)}
              >
                <div className="text-blue-700 text-sm font-medium mb-1">30% Margin</div>
                <div className="text-blue-900 text-xl font-bold">€{margin30WithVAT.toFixed(2)}</div>
              </div>
              <div
                className={`p-4 rounded-lg border-2 text-center cursor-pointer hover:shadow-lg transition-shadow ${
                  selectedMargin === 40
                    ? "bg-blue-100 border-blue-500 ring-2 ring-blue-500"
                    : "bg-white border-blue-300"
                }`}
                onClick={() => setSelectedMargin(40)}
              >
                <div className="text-blue-700 text-sm font-medium mb-1">40% Margin</div>
                <div className="text-blue-900 text-xl font-bold">€{margin40WithVAT.toFixed(2)}</div>
              </div>
              <div
                className={`p-4 rounded-lg border-2 text-center cursor-pointer hover:shadow-lg transition-shadow ${
                  selectedMargin === 50
                    ? "bg-blue-100 border-blue-500 ring-2 ring-blue-500"
                    : "bg-white border-blue-300"
                }`}
                onClick={() => setSelectedMargin(50)}
              >
                <div className="text-blue-700 text-sm font-medium mb-1">50% Margin</div>
                <div className="text-blue-900 text-xl font-bold">€{margin50WithVAT.toFixed(2)}</div>
              </div>
              <div
                className={`p-4 rounded-lg border-2 text-center cursor-pointer hover:shadow-lg transition-shadow ${
                  selectedMargin === 60
                    ? "bg-blue-100 border-blue-500 ring-2 ring-blue-500"
                    : "bg-white border-blue-300"
                }`}
                onClick={() => setSelectedMargin(60)}
              >
                <div className="text-blue-700 text-sm font-medium mb-1">60% Margin</div>
                <div className="text-blue-900 text-xl font-bold">€{margin60WithVAT.toFixed(2)}</div>
              </div>
            </div>

            <div className="mt-6 p-6 bg-blue-50 rounded-lg border-2 border-blue-400">
              <div className="flex justify-between items-center">
                <div className="text-blue-700 font-semibold">Final Client Price ({selectedMargin}% Margin)</div>
                <div className="text-blue-900 text-3xl font-bold">€{finalClientPrice.toFixed(2)}</div>
              </div>
            </div>

            {mode === "business" && (
              <div className="mt-8 pt-6 border-t-2 border-blue-400">
                <h3 className="text-xl font-bold text-blue-900 mb-4">
                  Business Profit Split ({selectedMargin}% Margin)
                </h3>
                <div className="mb-4 bg-blue-50 p-3 rounded border-2 border-blue-300">
                  <div className="text-blue-900 font-semibold">
                    VAT (23% of Selling Price): €{vatAmountFromSellingPrice.toFixed(2)}
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-300">
                    <div className="text-purple-900 font-semibold mb-2">Owner A Receives:</div>
                    <div className="text-purple-900 text-2xl font-bold">€{ownerAReceives.toFixed(2)}</div>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-300">
                    <div className="text-blue-900 font-semibold mb-2">Owner B Receives (includes VAT):</div>
                    <div className="text-blue-900 text-2xl font-bold">€{ownerBReceives.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 flex justify-center">
            <Button onClick={handleSaveQuote} size="lg" className="bg-green-600 hover:bg-green-700">
              <Save className="w-5 h-5 mr-2" />
              Save Quote to History
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
