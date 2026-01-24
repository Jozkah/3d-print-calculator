"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, ChevronsUpDown, Check, X, Copy } from "lucide-react" // Import X for close icon
import { useToast } from "@/components/ui/use-toast" // Assuming toast is available
import { DialogCustom } from "@/components/ui/dialog-custom" // Import DialogCustom
import { cn } from "@/lib/utils" // Assuming cn utility is available
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider, // Import TooltipProvider
} from "@/components/ui/tooltip"

// Placeholder for LaserMaterial type if it's defined elsewhere
type LaserMaterial = {
  id: string
  name: string
  price_per_sqm: number
  // Add other relevant properties for laser materials
}

// Placeholder for LaserCalculator component if it's defined elsewhere
const LaserCalculator = ({
  type,
  materials,
  globalSettings,
  mode,
}: { type: string; materials: LaserMaterial[]; globalSettings: GlobalSettings; mode: "personal" | "business" }) => {
  // This is a placeholder. The actual implementation of LaserCalculator
  // would go here, taking its specific props and rendering its UI.
  // For now, it just displays the type and a message.
  return (
    <div className="p-6 border-2 border-dashed border-gray-400 rounded-lg">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Laser Calculator ({type})</h2>
      <p className="text-gray-600">
        This section will display the calculator for {type}. It will use the provided materials and global settings.
      </p>
      {/* Render actual Laser Calculator UI here */}
    </div>
  )
}

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
  material_type?: string // Added for filtering
}

type Filament = {
  id: string
  name: string
  price_per_kg: number
  requires_heating: boolean
  heating_time_hours: number
  material_type?: string
  brand?: string
  color?: string
  color_hex?: string | null
}

type Client = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
}

type GlobalSettings = {
  id: string
  electricity_cost_per_kwh: number
  fuel_cost_per_liter: number
  car_fuel_consumption_per_100km: number
  emergency_fee_fixed: number
  labor_hourly_rate: number
}

type FilamentEntry = {
  id: string
  filament_id: string
  grams: number
}

type PrintedPart = {
  id: string
  name: string
  printer_id: string
  filaments: FilamentEntry[] // Changed from single filament_id and filament_grams
  printing_time_hr: number
  // Legacy fields for backwards compatibility
  filament_id?: string
  filament_grams?: number
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
  filaments: Filament[]
  printers: Printer[]
  globalSettings: GlobalSettings | null
  mode: "personal" | "business"
  selectedMargin?: number
  // Keeping laserMaterials from original code, though it's not used in the main part of this component.
  // If it's intended for the LaserCalculator component, it should be passed down.
  laserMaterials?: LaserMaterial[]
  editingQuoteId?: string
  clients?: Client[]
}

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandItem } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ClientSelector } from "@/components/client-selector"

export function ExcelCalculator({
  printers: initialPrinters,
  filaments: initialFilaments,
  laserMaterials: initialLaserMaterials = [],
  globalSettings: initialGlobalSettings,
  mode = "business", // Default to business mode
  selectedMargin: propSelectedMargin, // Renamed to avoid conflict with state
  laserMode, // This prop was in the original code but not used. Keeping it for now.
  editingQuoteId, // New prop for loading existing quote
  clients: initialClients = [],
}: ExcelCalculatorProps) {
  const { toast } = useToast() // Initialize toast
  const supabase = createClient() // Declare supabase client here

  // ADDED STATE FOR CALCULATION TYPE SELECTION
  const [calculatorType, setCalculatorType] = useState<
    "3d-print" | "laser-engraving" | "laser-cutting" | "stickers" | "cnc"
  >("3d-print")

  const [printedParts, setPrintedParts] = useState<PrintedPart[]>([
    {
      id: "1",
      name: "",
      printer_id: "",
      filaments: [],
      printing_time_hr: 0,
    },
  ])

  const [driedBatches, setDriedBatches] = useState<DriedBatch[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [labor, setLabor] = useState<Labor[]>([])
  const [packaging, setPackaging] = useState<Packaging[]>([])
  const [clientName, setClientName] = useState("") // Changed from quoteName to clientName for consistency with original code
  const [clientId, setClientId] = useState<string | null>(null)
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [isEmergency, setIsEmergency] = useState(false)
  const [vatEnabled, setVatEnabled] = useState(true)
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(initialGlobalSettings)
  const [printers, setPrinters] = useState<Printer[]>(initialPrinters)
  const [filaments, setFilaments] = useState<Filament[]>(initialFilaments)
  const [distanceTraveledKm, setDistanceTraveledKm] = useState(0)

  // ADDED STATE FOR MARGIN SELECTION
  const [selectedMargin, setSelectedMargin] = useState<number>(propSelectedMargin || 50)
  const [customMargin, setCustomMargin] = useState<number>(65)

  // Add state for margin input mode toggle
  const [marginInputMode, setMarginInputMode] = useState<"percentage" | "targetPrice">("percentage")
  const [targetPrice, setTargetPrice] = useState<number>(0)
  // </CHANGE>

  const [isEditingQuote, setIsEditingQuote] = useState(false)
  const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(null)

  const [isSavingDraft, setIsSavingDraft] = useState(false)

  const availableFilaments = filaments.filter((f) => {
    if (calculatorType === "3d-print") {
      return !f.material_type || f.material_type === "filament"
    }
    // If not 3d-print, consider any material type as available
    return true
  })

  const h2sPrinter = printers.find((p) => p.name.toLowerCase().includes("h2s"))

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
    const loadQuoteForEditing = async () => {
      if (!editingQuoteId) {
        console.log("[v0] No editingQuoteId provided, skipping load")
        return
      }

      console.log("[v0] Loading quote for editing:", editingQuoteId)

      try {
        const { data: quote, error } = await supabase.from("quotes").select("*").eq("id", editingQuoteId).single()

        if (error) {
          console.error("[v0] Error loading quote:", error)
          toast({
            title: "Error",
            description: "Failed to load quote for editing",
            variant: "destructive",
          })
          return
        }

        if (!quote) {
          console.error("[v0] Quote not found")
          toast({
            title: "Error",
            description: "Quote not found",
            variant: "destructive",
          })
          return
        }

        console.log("[v0] Quote loaded successfully:", quote)
        console.log("[v0] Restoring printed parts:", quote.printed_parts)
        console.log("[v0] Restoring dried batches:", quote.dried_batches)

        // Load all quote data into state
        setCalculatorType(quote.calculator_type || "3d-print") // Load calculator type
        setClientName(quote.quote_name || "")
        setIsEmergency(quote.is_emergency || false)
        setDistanceTraveledKm(quote.distance_traveled_km || 0)
        setSelectedMargin(quote.selected_margin_percentage || quote.selected_margin || 50)
        setVatEnabled(quote.vat_enabled !== undefined ? quote.vat_enabled : true) // Load VAT enabled state

        // Correctly handle legacy and new filament data
        const restoredPrintedParts: PrintedPart[] = (Array.isArray(quote.printed_parts) ? quote.printed_parts : []).map(
          (part: any) => {
            // If legacy fields exist, convert them to the new structure
            if (part.filament_id && part.filament_grams !== undefined) {
              return {
                ...part,
                filaments: [{ id: Date.now().toString(), filament_id: part.filament_id, grams: part.filament_grams }],
                filament_id: undefined, // Remove legacy fields
                filament_grams: undefined,
              }
            }
            return part as PrintedPart
          },
        )
        setPrintedParts(restoredPrintedParts)
        setDriedBatches(Array.isArray(quote.dried_batches) ? quote.dried_batches : [])
        setMaterials(Array.isArray(quote.materials) ? quote.materials : [])
        setLabor(Array.isArray(quote.labor_items) ? quote.labor_items : [])
        setPackaging(Array.isArray(quote.packaging_items) ? quote.packaging_items : [])

        setIsEditingQuote(true)
        setCurrentQuoteId(editingQuoteId)

        console.log("[v0] State updated successfully")

        toast({
          title: "Quote Loaded",
          description: `Editing ${quote.is_draft ? "draft" : "quote"}: ${quote.quote_name}`,
        })
      } catch (err) {
        console.error("[v0] Unexpected error loading quote:", err)
        toast({
          title: "Error",
          description: "An unexpected error occurred",
          variant: "destructive",
        })
      }
    }

    loadQuoteForEditing()
  }, [editingQuoteId]) // Keep minimal dependencies to avoid re-runs

  useEffect(() => {
    // Create a map of heating requirements from printed parts
    const heatingRequirements: { [key: string]: number } = {}

    printedParts.forEach((part) => {
      if (!part.filaments || part.filaments.length === 0 || !part.printing_time_hr) return

      // Check if ANY filament in this part requires heating
      const requiresHeating = part.filaments.some((filamentEntry) => {
        if (!filamentEntry.filament_id) return false
        const filament = filaments.find((f) => f.id === filamentEntry.filament_id)
        return filament?.requires_heating
      })

      // If any filament requires heating, add the part's print time ONCE
      if (requiresHeating) {
        // Group by all filament names that require heating in this part
        const heatingFilamentNames = part.filaments
          .map((filamentEntry) => {
            const filament = filaments.find((f) => f.id === filamentEntry.filament_id)
            return filament?.requires_heating ? filament.name : null
          })
          .filter((name): name is string => name !== null)

        // Use the first heating filament name as the key (since heating is shared)
        if (heatingFilamentNames.length > 0) {
          const key = heatingFilamentNames[0]
          if (!heatingRequirements[key]) {
            heatingRequirements[key] = 0
          }
          heatingRequirements[key] += part.printing_time_hr
        }
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
    if (!part.filaments || part.filaments.length === 0 || !globalSettings) return sum

    let partFilamentCost = 0
    let partElectricityCost = 0

    part.filaments.forEach((filamentEntry) => {
      const filament = filaments.find((f) => f.id === filamentEntry.filament_id)
      if (!filament) return

      if (calculatorType !== "3d-print") {
        // Assuming filament.price_per_kg is used for material cost in non-3D print scenarios
        // This might need adjustment based on actual use case for non-3D print materials
        const materialCost = filament.price_per_kg // Placeholder, might need adjustment
        partElectricityCost += part.printing_time_hr * globalSettings.electricity_cost_per_kwh
        // Assuming the '11' is a factor for non-3D print material cost calculation
        partFilamentCost += (materialCost + partElectricityCost) * 11
      } else {
        // For 3D print, calculate cost based on grams
        partFilamentCost += (filament.price_per_kg * filamentEntry.grams) / 1000
      }
    })
    return sum + partFilamentCost
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

  const { machineCost, ownerAMachineCost, ownerBMachineCost } = (() => {
    if (!globalSettings) return { machineCost: 0, ownerAMachineCost: 0, ownerBMachineCost: 0 }

    let totalMachineCost = 0
    let ownerAMachine = 0
    let ownerBMachine = 0

    printedParts.forEach((part) => {
      if (!part.printing_time_hr || !part.printer_id) return
      const printer = printers.find((p) => p.id === part.printer_id)
      if (!printer) return

      // Calculate printer cost per hour based on Excel formula
      const totalInvestment = printer.printer_cost + printer.additional_upfront_cost
      const lifetimeCost = totalInvestment + printer.estimated_annual_maintenance * printer.estimated_life_years
      const estimatedUptimeHoursPerYear = 8760 * printer.estimated_printer_uptime_percent
      const printerCapitalCostPerHour = lifetimeCost / (estimatedUptimeHoursPerYear * printer.estimated_life_years)

      // Apply buffer factor only to capital cost
      const costBufferFactor = 1.3
      const totalPrinterCostPerHour = printerCapitalCostPerHour * costBufferFactor

      const partMachineCost = part.printing_time_hr * totalPrinterCostPerHour
      totalMachineCost += partMachineCost

      // Distribute machine cost based on printer owner
      const ownerLower = printer.owner?.toLowerCase() || "ownerB"
      if (ownerLower === "ownerA") {
        ownerAMachine += partMachineCost
      } else {
        ownerBMachine += partMachineCost
      }
    })

    return { machineCost: totalMachineCost, ownerAMachineCost: ownerAMachine, ownerBMachineCost: ownerBMachine }
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

  const totalGramage = printedParts.reduce((sum, part) => {
    return sum + (part.filaments?.reduce((subSum, fEntry) => subSum + (fEntry.grams || 0), 0) || 0)
  }, 0)

  const { electricityCost, ownerAElectricityCost, ownerBElectricityCost } = (() => {
    if (!globalSettings) return { electricityCost: 0, ownerAElectricityCost: 0, ownerBElectricityCost: 0 }

    let totalElectricity = 0
    let ownerAElectricity = 0
    let ownerBElectricity = 0

    printedParts.forEach((part) => {
      if (!part.printing_time_hr || !part.printer_id || !part.filaments) return
      const printer = printers.find((p) => p.id === part.printer_id)
      if (!printer) return

      const electricalCostPerHour =
        (printer.average_power_consumption_watts / 1000) * globalSettings.electricity_cost_per_kwh
      const costBufferFactor = 1.3
      const partElectricityCost = electricalCostPerHour * costBufferFactor * part.printing_time_hr

      totalElectricity += partElectricityCost

      // Distribute electricity cost based on printer owner
      const ownerLower = printer.owner?.toLowerCase() || "ownerB"
      if (ownerLower === "ownerA") {
        ownerAElectricity += partElectricityCost
      } else {
        ownerBElectricity += partElectricityCost
      }
    })

    return {
      electricityCost: totalElectricity,
      ownerAElectricityCost: ownerAElectricity,
      ownerBElectricityCost: ownerBElectricity,
    }
  })()

  // Landed cost calculation should account for all direct costs before margin
  const totalLandedCost =
    totalPrintingCost + // Filament cost only
    machineCost + // Machine capital cost only (with buffer)
    electricityCost + // Electricity cost only (with buffer)
    totalDryingCost + // Drying electricity is included in totalDryingCost calculation
    totalMaterialsCost +
    totalLaborCost +
    totalPackagingCost +
    fuelCost

  // Margin calculations
  const margin30 = totalLandedCost / (1 - 0.3) + emergencyFee
  const margin40 = totalLandedCost / (1 - 0.4) + emergencyFee
  const margin50 = totalLandedCost / (1 - 0.5) + emergencyFee
  const margin60 = totalLandedCost / (1 - 0.6) + emergencyFee // Added margin60 calculation
  const customMarginValue = totalLandedCost / (1 - customMargin / 100) + emergencyFee

  const selectedMarginValue =
    selectedMargin === 30
      ? margin30
      : selectedMargin === 40
        ? margin40
        : selectedMargin === 50
          ? margin50
          : selectedMargin === 60
            ? margin60
            : // Added case for margin60
              totalLandedCost / (1 - selectedMargin / 100) + emergencyFee

  const vatRate = 0.23
  const vatAmountFromLandedCost = mode === "business" && vatEnabled ? totalLandedCost * vatRate : 0
  const vatAmountFromSellingPrice = mode === "business" && vatEnabled ? selectedMarginValue * vatRate : 0

  // Calculations with VAT included
  const margin30WithVAT = mode === "business" && vatEnabled ? margin30 * (1 + vatRate) : margin30
  const margin40WithVAT = mode === "business" && vatEnabled ? margin40 * (1 + vatRate) : margin40
  const margin50WithVAT = mode === "business" && vatEnabled ? margin50 * (1 + vatRate) : margin50
  const margin60WithVAT = mode === "business" && vatEnabled ? margin60 * (1 + vatRate) : margin60
  const customMarginWithVAT = mode === "business" && vatEnabled ? customMarginValue * (1 + vatRate) : customMarginValue

  const finalClientPrice =
    marginInputMode === "targetPrice" && targetPrice > 0
      ? targetPrice
      : mode === "business" && vatEnabled
        ? selectedMarginValue * (1 + vatRate)
        : selectedMarginValue
  // </CHANGE>

  useEffect(() => {
    if (marginInputMode === "targetPrice" && targetPrice > 0) {
      const priceBeforeEmergency = Math.max(0, targetPrice - emergencyFee)
      const totalLandedCostValue = vatEnabled ? totalLandedCost : totalLandedCost - vatAmountFromLandedCost

      if (totalLandedCostValue > 0 && priceBeforeEmergency > totalLandedCostValue) {
        // Calculate what margin % is needed: priceBeforeEmergency = cost / (1 - margin/100)
        // Solving for margin: margin = (1 - cost/priceBeforeEmergency) * 100
        const calculatedMargin = (1 - totalLandedCostValue / priceBeforeEmergency) * 100
        const roundedMargin = Math.max(0, Math.round(calculatedMargin * 10) / 10)
        setCustomMargin(roundedMargin)
        setSelectedMargin(roundedMargin)
      } else if (priceBeforeEmergency <= totalLandedCostValue) {
        // Target price must be greater than landed cost + emergency fee
        setCustomMargin(0)
        setSelectedMargin(0)
      }
      // </CHANGE>
    }
  }, [marginInputMode, targetPrice, totalLandedCost, vatEnabled, vatAmountFromLandedCost, emergencyFee])
  // </CHANGE>

  // Business profit split calculations
  // Determine printer owner for profit split - this is no longer used for the main split
  // since we now split machine costs by actual printer ownership
  let selectedPrinterOwner: string | null = null
  if (printedParts.length > 0 && printers.length > 0) {
    const firstPrinterId = printedParts[0].printer_id
    if (firstPrinterId) {
      const ownerPrinter = printers.find((p) => p.id === firstPrinterId)
      if (ownerPrinter && ownerPrinter.owner) {
        selectedPrinterOwner = ownerPrinter.owner.toLowerCase()
      }
    }
  }
  // Default to 'ownerB' if no owner is found or no printed parts
  if (!selectedPrinterOwner) {
    selectedPrinterOwner = "ownerB"
  }

  const totalProfit = selectedMarginValue - totalLandedCost
  const halfProfit = totalProfit / 2
  const halfEmergency = emergencyFee / 2

  // Owner B gets his machine costs + filament + materials + packaging + half profit + VAT
  // Owner A receives his share of machine costs + ALL electricity + ALL drying + labor + fuel + half profit + half emergency fee
  const ownerAReceives =
    ownerAMachineCost +
    electricityCost + // ALL electricity goes to Owner A, not just ownerAElectricityCost
    totalLaborCost +
    fuelCost +
    totalDryingCost + // ALL drying cost goes to Owner A
    halfProfit +
    halfEmergency

  const ownerBReceives =
    ownerBMachineCost +
    totalPrintingCost + // Filament cost
    totalMaterialsCost +
    totalPackagingCost +
    halfProfit +
    halfEmergency +
    vatAmountFromSellingPrice

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

      // Prepare printed_parts data, handling potential legacy fields and ensuring correct structure
      const preparedPrintedParts = printedParts.map((part) => {
        // If the new 'filaments' array is empty or missing, and legacy fields exist, populate 'filaments'
        if ((!part.filaments || part.filaments.length === 0) && part.filament_id && part.filament_grams !== undefined) {
          return {
            ...part,
            filaments: [{ id: Date.now().toString(), filament_id: part.filament_id, grams: part.filament_grams }],
            // Optionally clear legacy fields after migration for cleaner data, but keep them if needed for schema
            // filament_id: undefined,
            // filament_grams: undefined,
          }
        }
        // Ensure legacy fields are undefined if the new structure is primary and complete
        // This might depend on your backend schema handling. If schema expects them, keep them or map appropriately.
        const { filament_id, filament_grams, ...restOfPart } = part
        return {
          ...restOfPart,
          // Make sure to explicitly set filament_id and filament_grams to undefined if they are not meant to be persisted
          // or if your schema has been updated to only use 'filaments' array.
          // For now, we'll keep them in case the backend schema hasn't been fully updated.
          // If they are truly legacy and unused, they should be removed.
          // filament_id: undefined,
          // filament_grams: undefined,
        }
      })

      const quoteData = {
        quote_type: mode, // Should be 'personal' or 'business'
        quote_name: clientName,
        client_id: clientId,
        quote_type_mode: calculatorType, // Should be '3d-print', 'laser-engraving', etc.
        printed_parts: preparedPrintedParts,
        dried_batches: driedBatchesWithCost, // Save batches with cost included
        materials: materials,
        labor_items: labor,
        packaging_items: packaging,
        distance_traveled_km: distanceTraveledKm,
        is_emergency: isEmergency,
        total_printing_cost: totalPrintingCost,
        machine_cost: machineCost, // This is the total machine cost, not per owner
        ownerA_machine_cost: ownerAMachineCost, // Store per owner machine cost
        ownerB_machine_cost: ownerBMachineCost, // Store per owner machine cost
        drying_cost: totalDryingCost,
        materials_cost: totalMaterialsCost,
        labor_cost: totalLaborCost,
        packaging_cost: totalPackagingCost,
        fuel_cost: fuelCost,
        emergency_fee: emergencyFee,
        electricity_cost: electricityCost, // This is the total electricity cost, not per owner
        ownerA_electricity_cost: ownerAElectricityCost, // Store per owner electricity cost
        ownerB_electricity_cost: ownerBElectricityCost, // Store per owner electricity cost
        landed_cost: totalLandedCost, // This should be calculated without emergency fee before applying margin
        margin_30: margin30,
        margin_40: margin40,
        margin_50: margin50,
        margin_60: margin60,
        custom_margin_value: customMargin, // Store the custom margin percentage
        selected_margin_percentage: selectedMargin, // This stores the percentage (30, 40, 50, or 60)
        ownerA_receives: mode === "business" ? ownerAReceives : null,
        ownerB_receives: mode === "business" ? ownerBReceives : null,
        is_draft: false, // Mark as finalized when saved
        vat_enabled: vatEnabled, // Save VAT enabled state
      }

      console.log("[v0] Quote data prepared:", quoteData)

      if (isEditingQuote && currentQuoteId) {
        console.log("[v0] Updating existing quote:", currentQuoteId)
        const { error } = await supabase.from("quotes").update(quoteData).eq("id", currentQuoteId)

        if (error) {
          console.log("[v0] Database error:", error)
          throw error
        }

        console.log("[v0] Quote updated successfully")
        setSaveDialogMessage(`Quote "${clientName}" has been updated successfully!`)
      } else {
        console.log("[v0] Inserting new quote...")
        const { error } = await supabase.from("quotes").insert([quoteData])

        if (error) {
          console.log("[v0] Database error:", error)
          throw error
        }

        console.log("[v0] Quote saved successfully")
        setSaveDialogMessage(`Quote "${clientName}" has been saved successfully!`)
      }

      setShowSaveDialog(true)
      setClientName("") // Changed from quoteName to clientName

      setIsEditingQuote(false)
      setCurrentQuoteId(null)
    } catch (error: any) {
      console.error("[v0] Error saving quote:", error)
      toast({
        title: "Error",
        description: `Error saving quote: ${error.message}`,
        variant: "destructive",
      })
    }
  }

  const handleSaveAsDraft = async () => {
    console.log("[v0] handleSaveAsDraft called")

    if (!clientName.trim()) {
      console.log("[v0] Client name is empty, showing error")
      toast({
        title: "Client Name Required",
        description: "Please enter a client name before saving the draft.",
        variant: "destructive",
      })
      return
    }

    if (isSavingDraft) {
      console.log("[v0] Already saving, ignoring duplicate click")
      return
    }

    setIsSavingDraft(true)

    try {
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
        return { ...batch, cost }
      })

      // Prepare printed_parts data for saving
      const preparedPrintedParts = printedParts.map((part) => {
        if ((!part.filaments || part.filaments.length === 0) && part.filament_id && part.filament_grams !== undefined) {
          return {
            ...part,
            filaments: [{ id: Date.now().toString(), filament_id: part.filament_id, grams: part.filament_grams }],
            // filament_id: undefined, // Clear legacy fields if schema is updated
            // filament_grams: undefined,
          }
        }
        const { filament_id, filament_grams, ...restOfPart } = part
        return {
          ...restOfPart,
          // filament_id: undefined,
          // filament_grams: undefined,
        }
      })

      const quoteData = {
        quote_type: calculatorType, // Save the selected calculator type
        quote_name: clientName,
        client_id: clientId,
        quote_type_mode: mode,
        printed_parts: preparedPrintedParts,
        dried_batches: driedBatchesWithCost,
        materials: materials,
        labor_items: labor,
        packaging_items: packaging,
        distance_traveled_km: distanceTraveledKm,
        is_emergency: isEmergency,
        total_printing_cost: totalPrintingCost,
        machine_cost: machineCost, // Total machine cost
        ownerA_machine_cost: ownerAMachineCost, // Per owner machine cost
        ownerB_machine_cost: ownerBMachineCost, // Per owner machine cost
        drying_cost: totalDryingCost,
        materials_cost: totalMaterialsCost,
        labor_cost: totalLaborCost,
        packaging_cost: totalPackagingCost,
        fuel_cost: fuelCost,
        emergency_fee: emergencyFee,
        electricity_cost: electricityCost, // Total electricity cost
        ownerA_electricity_cost: ownerAElectricityCost, // Per owner electricity cost
        ownerB_electricity_cost: ownerBElectricityCost, // Per owner electricity cost
        landed_cost: totalLandedCost, // This should be calculated without emergency fee before applying margin
        margin_30: margin30,
        margin_40: margin40,
        margin_50: margin50,
        margin_60: margin60,
        custom_margin_value: customMargin,
        selected_margin_percentage: selectedMargin,
        ownerA_receives: mode === "business" ? ownerAReceives : null,
        ownerB_receives: mode === "business" ? ownerBReceives : null,
        is_draft: true, // Mark as draft
        vat_enabled: vatEnabled, // Save VAT enabled state
      }

      if (isEditingQuote && currentQuoteId) {
        console.log("[v0] Updating existing draft:", currentQuoteId)
        const { error } = await supabase.from("quotes").update(quoteData).eq("id", currentQuoteId)

        if (error) throw error

        toast({
          title: "Success",
          description: `Draft "${clientName}" has been updated!`,
        })
      } else {
        console.log("[v0] Creating new draft")
        const { error } = await supabase.from("quotes").insert([quoteData])

        if (error) throw error

        toast({
          title: "Success",
          description: `Draft "${clientName}" has been saved!`,
        })
      }
    } catch (error: any) {
      console.error("[v0] Error saving draft:", error)
      toast({
        title: "Error",
        description: `Error saving draft: ${error.message}`,
        variant: "destructive",
      })
    } finally {
      setIsSavingDraft(false)
    }
  }

  if (!globalSettings) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-blue-600">Loading calculator...</div>
      </div>
    )
  }

  // Dynamically set labels based on calculator type
  const partsLabel =
    calculatorType === "laser-engraving"
      ? "Laser Engraved Items"
      : calculatorType === "laser-cutting"
        ? "Laser Cut Items"
        : calculatorType === "stickers"
          ? "Printed Stickers"
          : calculatorType === "cnc" // Added CNC label
            ? "CNC Milled Parts"
            : "Printed Parts (Filament Input)"

  const batchesLabel = calculatorType !== "3d-print" ? "Processing Batches" : "Dried Batches"

  // ADDED FUNCTIONS FOR FILAMENT MANAGEMENT
  const addFilamentToPart = (partIndex: number) => {
    const updated = [...printedParts]
    updated[partIndex].filaments.push({
      id: Date.now().toString(),
      filament_id: "",
      grams: 0,
    })
    setPrintedParts(updated)
  }

  const removeFilamentFromPart = (partIndex: number, filamentIndex: number) => {
    const updated = [...printedParts]
    updated[partIndex].filaments = updated[partIndex].filaments.filter((_, i) => i !== filamentIndex)
    setPrintedParts(updated)
  }

  const duplicatePrintedPart = (index: number) => {
    const partToDuplicate = printedParts[index]
    const duplicatedPart: PrintedPart = {
      ...partToDuplicate,
      id: Date.now().toString(),
      name: partToDuplicate.name ? `${partToDuplicate.name} (copy)` : "",
      filaments: partToDuplicate.filaments.map((f) => ({ ...f, id: Date.now().toString() + Math.random() })),
    }
    const updated = [...printedParts]
    updated.splice(index + 1, 0, duplicatedPart)
    setPrintedParts(updated)
  }

  const updateFilamentInPart = (
    partIndex: number,
    filamentIndex: number,
    field: "filament_id" | "grams",
    value: string | number,
  ) => {
    const updated = [...printedParts]
    if (field === "filament_id") {
      updated[partIndex].filaments[filamentIndex].filament_id = value as string
    } else {
      updated[partIndex].filaments[filamentIndex].grams = value as number
    }
    setPrintedParts(updated)
  }

  const getTotalGrams = (part: PrintedPart): number => {
    return part.filaments.reduce((sum, f) => sum + (f.grams || 0), 0)
  }

  const getPartFilamentCost = (part: PrintedPart): number => {
    return part.filaments.reduce((sum, f) => {
      const filament = filaments.find((fil) => fil.id === f.filament_id)
      if (filament) {
        return sum + (filament.price_per_kg * f.grams) / 1000
      }
      return sum
    }, 0)
  }

  const removePrintedPart = (index: number) => {
    setPrintedParts(printedParts.filter((_, i) => i !== index))
  }

  const addPrintedPart = () => {
    setPrintedParts([
      ...printedParts,
      {
        id: Date.now().toString(),
        name: "",
        printer_id: "",
        filaments: [],
        printing_time_hr: 0,
      },
    ])
  }

  // Helper function to update fields in printedParts
  const updatePartField = (index: number, field: keyof PrintedPart, value: any) => {
    setPrintedParts((prevParts) => prevParts.map((part, i) => (i === index ? { ...part, [field]: value } : part)))
  }

  return (
    // Wrap the entire component in TooltipProvider
    <TooltipProvider>
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
          {/* ADDED: CNC Milling button to calculator type selector */}
          {mode === "business" && (
            <div className="mb-6 -mx-4 px-4 overflow-x-auto">
              <div className="flex gap-2 min-w-max pb-2">
                <Button
                  variant={calculatorType === "3d-print" ? "default" : "outline"}
                  onClick={() => setCalculatorType("3d-print")}
                  className="whitespace-nowrap min-w-[120px]"
                >
                  3D Printing
                </Button>
                <Button
                  variant={calculatorType === "laser-engraving" ? "default" : "outline"}
                  onClick={() => setCalculatorType("laser-engraving")}
                  className="whitespace-nowrap min-w-[120px]"
                >
                  Laser Engraving
                </Button>
                <Button
                  variant={calculatorType === "laser-cutting" ? "default" : "outline"}
                  onClick={() => setCalculatorType("laser-cutting")}
                  className="whitespace-nowrap min-w-[120px]"
                >
                  Laser Cutting
                </Button>
                <Button
                  variant={calculatorType === "stickers" ? "default" : "outline"}
                  onClick={() => setCalculatorType("stickers")}
                  className="whitespace-nowrap min-w-[120px]"
                >
                  Stickers
                </Button>
                {/* Added CNC Milling button */}
                <Button
                  variant={calculatorType === "cnc" ? "default" : "outline"}
                  onClick={() => setCalculatorType("cnc")}
                  className="whitespace-nowrap min-w-[120px]"
                >
                  CNC Milling
                </Button>
              </div>
            </div>
          )}

          {/* Quote Details */}
          <Card className="p-6 bg-white border-2 border-blue-300">
            <h2 className="text-xl font-bold text-blue-900 mb-2">Quote Details</h2>
            {/* Changed to stack on mobile for better readability */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="clientName" className="text-blue-900">
                  Client Name
                </Label>
                <ClientSelector
                  value={clientName}
                  onChange={(name, id) => {
                    setClientName(name)
                    setClientId(id || null)
                  }}
                  clients={clients}
                  onClientsUpdate={async () => {
                    const { data } = await supabase.from("clients").select("*").order("name")
                    if (data) {
                      setClients(data)
                    }
                  }}
                  placeholder="Select or add client..."
                  className="bg-white"
                />
              </div>
              <div>
                <Label htmlFor="distance" className="text-blue-900">
                  Distance Traveled (km)
                </Label>
                <Input
                  id="distance"
                  type="number"
                  min="0" // Added min="0"
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
            <div className="flex flex-col gap-4 mt-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="emergency"
                  checked={isEmergency}
                  onCheckedChange={(checked) => setIsEmergency(checked as boolean)}
                />
                <Label htmlFor="emergency" className="font-semibold text-blue-900">
                  Emergency Order (+€{globalSettings.emergency_fee_fixed.toFixed(2)})
                </Label>
              </div>
              {mode === "business" && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="vatEnabled"
                    checked={vatEnabled}
                    onCheckedChange={(checked) => setVatEnabled(checked as boolean)}
                  />
                  <Label htmlFor="vatEnabled" className="font-semibold text-blue-900">
                    Include VAT (23%)
                  </Label>
                </div>
              )}
            </div>
          </Card>

          {/* Printed Parts Table */}
          <Card className="p-6 bg-white border-2 border-blue-300">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-blue-900">{partsLabel}</h3>
              <div className="flex gap-2">
                <Button onClick={addPrintedPart} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Part
                </Button>
              </div>
            </div>
            {/* Made table scroll horizontally on mobile with better mobile layout */}
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-blue-100 border-b-2 border-blue-300">
                    <th className="p-3 text-left text-blue-900 font-semibold min-w-[120px]">Part Name</th>
                    {calculatorType === "3d-print" && (
                      <th className="p-3 text-left text-blue-900 font-semibold min-w-[120px]">Printer</th>
                    )}
                    <th className="p-3 text-left text-blue-900 font-semibold min-w-[120px]">
                      {calculatorType === "3d-print" ? "Filament" : "Material"}
                    </th>
                    <th className="p-3 text-left text-blue-900 font-semibold min-w-[100px]">Print Time (hr)</th>
                    <th className="p-3 text-left text-blue-900 font-semibold min-w-[100px]">Cost (€)</th>
                    {/* Line 1214: Center the Actions header */}
                    <th className="p-3 text-center text-blue-900 font-semibold min-w-[80px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {printedParts.map((part, index) => {
                    let partCost = 0
                    // Calculate cost for the part based on its filaments
                    if (part.filaments && part.filaments.length > 0 && globalSettings) {
                      part.filaments.forEach((filamentEntry) => {
                        const filament = filaments.find((f) => f.id === filamentEntry.filament_id)
                        if (filament) {
                          if (calculatorType !== "3d-print") {
                            // Assuming filament.price_per_kg is used for material cost in non-3D print scenarios
                            const materialCost = filament.price_per_kg
                            const electricityCost = part.printing_time_hr * globalSettings.electricity_cost_per_kwh
                            // Assuming the '11' is a factor for non-3D print material cost calculation
                            partCost += (materialCost + electricityCost) * 11
                          } else {
                            // For 3D print, calculate cost based on grams
                            partCost += (filament.price_per_kg * filamentEntry.grams) / 1000
                          }
                        }
                      })
                    }

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
                        {calculatorType === "3d-print" && (
                          <td className="p-2">
                            <Select
                              value={part.printer_id === "" ? undefined : part.printer_id}
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
                        )}
                        {/* Update filament cell to show individual filament entries with weight and remove button */}
                        <td className="p-2">
                          <div className="space-y-2">
                            {/* List existing filaments with weight and remove button */}
                            {part.filaments && part.filaments.length > 0 && (
                              <div className="space-y-1">
                                {part.filaments
                                  .filter((f) => f.filament_id) // Only show filaments with valid filament_id
                                  .map((filamentEntry, filamentIndex) => {
                                    const filament = filaments.find((f) => f.id === filamentEntry.filament_id)
                                    const originalIndex = part.filaments.indexOf(filamentEntry) // Use original index for update
                                    return (
                                      <div
                                        key={filamentEntry.id}
                                        className="flex items-center gap-1 text-xs bg-blue-50 rounded p-1"
                                      >
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span className="flex-1 truncate text-blue-800 cursor-help">
                                                {filament?.name || "Unknown"}
                                              </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-xs">
                                              <div className="flex gap-3">
                                                <div className="space-y-1 text-sm">
                                                  <div className="font-semibold">{filament?.name}</div>
                                                  {filament?.brand && (
                                                    <div className="text-xs">Brand: {filament.brand}</div>
                                                  )}
                                                  {filament?.color && (
                                                    <div className="text-xs">Color: {filament.color}</div>
                                                  )}
                                                  {filament?.price_per_kg != null && (
                                                    <div className="text-xs">
                                                      Price: €{filament.price_per_kg.toFixed(2)}/kg
                                                    </div>
                                                  )}
                                                  {filament?.requires_heating != null && (
                                                    <div className="text-xs">
                                                      Heating: {filament.requires_heating ? "Required" : "Not required"}
                                                    </div>
                                                  )}
                                                </div>
                                                {filament?.color_hex && (
                                                  <div
                                                    className="w-12 h-12 rounded border border-gray-400 flex-shrink-0"
                                                    style={{ backgroundColor: filament.color_hex }}
                                                    title={filament.color_hex}
                                                  />
                                                )}
                                              </div>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                        {calculatorType === "3d-print" && (
                                          <Input
                                            type="number"
                                            min="0"
                                            inputMode="numeric"
                                            step="0.1"
                                            value={filamentEntry.grams || ""}
                                            onChange={(e) => {
                                              const updated = [...printedParts]
                                              const value = e.target.value
                                              updated[index].filaments[originalIndex].grams =
                                                value === "" ? 0 : Number.parseFloat(value) || 0
                                              setPrintedParts(updated)
                                            }}
                                            className="w-16 h-6 text-xs border-blue-200 bg-white px-1"
                                            placeholder="g"
                                          />
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                          onClick={() => {
                                            removeFilamentFromPart(index, originalIndex)
                                          }}
                                        >
                                          <X className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    )
                                  })}
                              </div>
                            )}
                            {/* Add filament dropdown */}
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full h-7 text-xs justify-between border-blue-200 bg-white"
                                >
                                  <span className="flex items-center gap-1">
                                    <Plus className="h-3 w-3" />
                                    Add {calculatorType === "3d-print" ? "Filament" : "Material"}
                                  </span>
                                  <ChevronsUpDown className="h-3 w-3 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[300px] p-0" align="start">
                                <Command>
                                  <CommandInput
                                    placeholder={`Search ${calculatorType === "3d-print" ? "filaments" : "materials"}...`}
                                    className="h-9"
                                  />
                                  <CommandList>
                                    <CommandEmpty>
                                      No {calculatorType === "3d-print" ? "filament" : "material"} found.
                                    </CommandEmpty>
                                    <CommandGroup>
                                      {availableFilaments.map((filament) => {
                                        const isSelected = part.filaments?.some(
                                          (entry) => entry.filament_id === filament.id,
                                        )
                                        return (
                                          <CommandItem
                                            key={filament.id}
                                            value={`${filament.id}-${filament.name}`}
                                            onSelect={() => {
                                              const updated = [...printedParts]
                                              if (!isSelected) {
                                                // Add filament
                                                updated[index].filaments.push({
                                                  id: Date.now().toString(),
                                                  filament_id: filament.id,
                                                  grams: 0,
                                                })
                                                if (calculatorType !== "3d-print" && h2sPrinter) {
                                                  updated[index].printer_id = h2sPrinter.id
                                                }
                                              }
                                              // Note: Removal is now done via the X button, not by clicking again
                                              setPrintedParts(updated)
                                            }}
                                            disabled={isSelected}
                                            className={isSelected ? "opacity-50" : ""}
                                          >
                                            {filament.name}
                                            {isSelected && <Check className="ml-auto h-4 w-4" />}
                                          </CommandItem>
                                        )
                                      })}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min="0" // Added min="0"
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
                        <td className="p-2 text-blue-900 font-semibold">€{partCost.toFixed(2)}</td>
                        {/* CHANGE: Added duplicate button next to delete button */}
                        <td className="p-2">
                          {/* Line 1438: Center the action buttons */}
                          <div className="flex justify-center gap-1">
                            <Button
                              onClick={() => duplicatePrintedPart(index)}
                              size="sm"
                              variant="ghost"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="Duplicate part"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              onClick={() => removePrintedPart(index)}
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Delete part"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
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

          {/* Dried Batches / Processing Batches Table */}
          {/* This section is now shown for all calculator types, with dynamic label */}
          <Card className="p-6 bg-white border-2 border-blue-300">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-blue-900">{batchesLabel}</h2>
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
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between border-blue-200 bg-white"
                              >
                                {batch.material || "Select material"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[300px] p-0">
                              <Command>
                                <CommandInput placeholder="Search materials..." className="h-9" />
                                <CommandList>
                                  <CommandEmpty>No material found.</CommandEmpty>
                                  <CommandGroup>
                                    <CommandItem
                                      value="HEATING"
                                      onSelect={() => {
                                        const updated = [...driedBatches]
                                        updated[index].material = "HEATING"
                                        setDriedBatches(updated)
                                      }}
                                    >
                                      HEATING
                                      <Check
                                        className={cn(
                                          "ml-auto h-4 w-4",
                                          batch.material === "HEATING" ? "opacity-100" : "opacity-0",
                                        )}
                                      />
                                    </CommandItem>
                                    {/* Displaying all filaments as materials for non-3D print scenarios */}
                                    {filaments.map((filament) => (
                                      <CommandItem
                                        key={filament.id}
                                        value={`${filament.id}-${filament.name}`}
                                        onSelect={() => {
                                          const updated = [...driedBatches]
                                          updated[index].material = filament.name
                                          setDriedBatches(updated)
                                        }}
                                      >
                                        {filament.name}
                                        <Check
                                          className={cn(
                                            "ml-auto h-4 w-4",
                                            batch.material === filament.name ? "opacity-100" : "opacity-0",
                                          )}
                                        />
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min="0" // Added min="0"
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
                            min="0" // Added min="0"
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
                            min="0" // Added min="0"
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
                onClick={() =>
                  setLabor([...labor, { id: Date.now().toString(), action: "", hours: 0, hourly_cost: 0 }])
                }
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
                            min="0" // Added min="0"
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
                            min="0" // Added min="0"
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
                            min="0" // Added min="0"
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
                            min="0" // Added min="0"
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
              <span className="text-blue-900 font-bold">
                Total Packaging & Shipping Cost: €{totalPackagingCost.toFixed(2)}
              </span>
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
                  {/* Adjusted to show only printer capital and electricity, excluding drying cost from this line */}
                  <span className="text-blue-900 font-bold">€{machineCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-blue-300">
                  <span className="text-blue-700 font-medium">Electricity Cost (Printers & Dryer):</span>
                  {/* Combined printer and drying electricity */}
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
                  <span className="text-blue-700 font-medium">Total Packaging & Shipping Cost:</span>
                  <span className="text-blue-900 font-bold">€{totalPackagingCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-blue-300">
                  <span className="text-blue-700 font-medium">Additional Transportation Cost:</span>
                  <span className="text-blue-900 font-bold">€{fuelCost.toFixed(2)}</span>
                </div>
                {isEmergency && emergencyFee > 0 && (
                  <div className="flex justify-between items-center pb-2 border-b border-blue-300">
                    <span className="text-blue-700 font-medium">Emergency Fee:</span>
                    <span className="text-blue-900 font-bold">€{emergencyFee.toFixed(2)}</span>
                  </div>
                )}
                {/* CHANGE: Update VAT display to show only when enabled */}
                {mode === "business" && (
                  <div className="text-blue-700 text-sm mb-4">
                    {vatEnabled
                      ? `VAT (23% of Selling Price): €${vatAmountFromSellingPrice.toFixed(2)}`
                      : "VAT: Disabled"}
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
              {/* Improved mobile grid layout for profit margins */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                <div
                  className={`p-3 sm:p-4 rounded-lg border-2 text-center cursor-pointer hover:shadow-lg transition-shadow ${
                    selectedMargin === 30
                      ? "bg-blue-100 border-blue-500 ring-2 ring-blue-500"
                      : "bg-white border-blue-300"
                  }`}
                  onClick={() => {
                    setSelectedMargin(30)
                    setMarginInputMode("percentage")
                    setTargetPrice(0) // Reset target price when switching modes
                  }}
                >
                  <div className="text-blue-700 text-xs sm:text-sm font-medium mb-1">30% Margin</div>
                  <div className="text-blue-900 text-lg sm:text-xl font-bold">€{margin30WithVAT.toFixed(2)}</div>
                </div>
                <div
                  className={`p-3 sm:p-4 rounded-lg border-2 text-center cursor-pointer hover:shadow-lg transition-shadow ${
                    selectedMargin === 40
                      ? "bg-blue-100 border-blue-500 ring-2 ring-blue-500"
                      : "bg-white border-blue-300"
                  }`}
                  onClick={() => {
                    setSelectedMargin(40)
                    setMarginInputMode("percentage")
                    setTargetPrice(0) // Reset target price when switching modes
                  }}
                >
                  <div className="text-blue-700 text-xs sm:text-sm font-medium mb-1">40% Margin</div>
                  <div className="text-blue-900 text-lg sm:text-xl font-bold">€{margin40WithVAT.toFixed(2)}</div>
                </div>
                <div
                  className={`p-3 sm:p-4 rounded-lg border-2 text-center cursor-pointer hover:shadow-lg transition-shadow ${
                    selectedMargin === 50
                      ? "bg-blue-100 border-blue-500 ring-2 ring-blue-500"
                      : "bg-white border-blue-300"
                  }`}
                  onClick={() => {
                    setSelectedMargin(50)
                    setMarginInputMode("percentage")
                    setTargetPrice(0) // Reset target price when switching modes
                  }}
                >
                  <div className="text-blue-700 text-xs sm:text-sm font-medium mb-1">50% Margin</div>
                  <div className="text-blue-900 text-lg sm:text-xl font-bold">€{margin50WithVAT.toFixed(2)}</div>
                </div>
                {/* START UPDATED CODE for custom margin input */}
                <div
                  className={`p-3 sm:p-4 rounded-lg border-2 hover:shadow-lg transition-shadow ${
                    selectedMargin === customMargin || marginInputMode === "targetPrice"
                      ? "bg-blue-100 border-blue-500 ring-2 ring-blue-500"
                      : "bg-white border-blue-300"
                  }`}
                >
                  {/* Toggle between % and € mode */}
                  <div className="flex items-center justify-center gap-1 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        console.log("[v0] Switching to percentage mode")
                        setMarginInputMode("percentage")
                        setTargetPrice(0)
                      }}
                      className={`px-2 py-0.5 text-xs rounded transition-colors ${
                        marginInputMode === "percentage"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                      }`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        console.log("[v0] Switching to target price mode")
                        setMarginInputMode("targetPrice")
                      }}
                      className={`px-2 py-0.5 text-xs rounded transition-colors ${
                        marginInputMode === "targetPrice"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                      }`}
                    >
                      €
                    </button>
                  </div>

                  {/* Show either percentage input or target price input based on mode */}
                  {marginInputMode === "percentage" ? (
                    <>
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="99"
                          step="1"
                          value={customMargin}
                          onChange={(e) => {
                            const val = Math.min(99, Math.max(0, Number(e.target.value) || 0))
                            setCustomMargin(val)
                            setSelectedMargin(val)
                            setMarginInputMode("percentage") // Ensure we are in percentage mode
                            setTargetPrice(0) // Reset target price when manual percentage input changes
                          }}
                          className="w-12 text-center border border-blue-300 rounded px-1 py-0.5 text-blue-700 font-medium"
                        />
                        <span className="text-blue-700 text-xs sm:text-sm font-medium">% Margin</span>
                      </div>
                      <div className="text-blue-900 text-lg sm:text-xl font-bold mt-1">
                        €{customMarginWithVAT.toFixed(2)}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-blue-700 text-xs sm:text-sm font-medium">Target</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={targetPrice === 0 ? "" : targetPrice}
                          onChange={(e) => {
                            const target = Math.max(0, Number(e.target.value) || 0)
                            setTargetPrice(target)
                            setMarginInputMode("targetPrice")
                            if (target > totalLandedCost) {
                              const calculatedMargin = ((target - totalLandedCost) / totalLandedCost) * 100
                              setCustomMargin(Number(calculatedMargin.toFixed(2)))
                              setSelectedMargin(Number(calculatedMargin.toFixed(2)))
                            }
                          }}
                          placeholder={`> ${totalLandedCost.toFixed(2)}`}
                          className="w-20 text-center border border-blue-300 rounded px-1 py-0.5 text-blue-700 font-medium"
                        />
                        <span className="text-blue-700 text-xs sm:text-sm font-medium">€</span>
                      </div>
                      <div className="text-blue-900 text-xs sm:text-sm font-medium mt-1">
                        = {customMargin.toFixed(2)}% margin
                      </div>
                    </>
                  )}
                </div>
                {/* END UPDATED CODE */}
              </div>

              <div className="mt-6 p-4 sm:p-6 bg-blue-50 rounded-lg border-2 border-blue-400">
                {/* Final Price Section */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="text-blue-700 font-semibold text-sm sm:text-base">
                    Final Client Price ({selectedMargin}% Margin)
                  </div>
                  <div className="text-blue-900 text-2xl sm:text-3xl font-bold">€{finalClientPrice.toFixed(2)}</div>
                </div>
              </div>

              {isEmergency && emergencyFee > 0 && (
                <div className="mt-4 p-3 sm:p-4 bg-red-50 rounded-lg border-2 border-red-300">
                  <div className="flex items-center gap-2 text-red-700">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="font-semibold text-sm sm:text-base">
                      A value of €{emergencyFee.toFixed(2)} was added due to this order being marked as an emergency.
                    </span>
                  </div>
                </div>
              )}

              {mode === "business" && (
                <div className="mt-8 pt-6 border-t-2 border-blue-400">
                  <h3 className="text-xl font-bold text-blue-900 mb-4">
                    Business Profit Split ({selectedMargin}% Margin)
                  </h3>
                  <div className="mb-4 bg-blue-50 p-3 rounded border-2 border-blue-300">
                    {/* Updated Business Profit Split section with Tooltips */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-300 cursor-help">
                          <div className="text-purple-900 font-semibold mb-2">Owner A Receives:</div>
                          <div className="text-purple-900 text-2xl font-bold">€{ownerAReceives.toFixed(2)}</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-purple-900 text-white p-3 max-w-xs">
                        <div className="text-sm space-y-1">
                          <div className="font-semibold border-b border-purple-700 pb-1 mb-2">Owner A's Breakdown:</div>
                          <div className="flex justify-between gap-4">
                            <span>Machine Cost (Owner A's):</span>
                            <span>€{ownerAMachineCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span>Electricity (All):</span>
                            <span>€{electricityCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span>Drying Cost (All):</span>
                            <span>€{totalDryingCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span>Labor:</span>
                            <span>€{totalLaborCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span>Fuel:</span>
                            <span>€{fuelCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span>Half Profit:</span>
                            <span>€{halfProfit.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span>Half Emergency:</span>
                            <span>€{halfEmergency.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4 font-bold border-t border-purple-700 pt-1 mt-2">
                            <span>Total:</span>
                            <span>€{ownerAReceives.toFixed(2)}</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-300 cursor-help">
                          <div className="text-blue-900 font-semibold mb-2">
                            Owner B Receives{vatEnabled ? " (includes VAT)" : ""}:
                          </div>
                          <div className="text-blue-900 text-2xl font-bold">€{ownerBReceives.toFixed(2)}</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-blue-900 text-white p-3 max-w-xs">
                        <div className="text-sm space-y-1">
                          <div className="font-semibold border-b border-blue-700 pb-1 mb-2">Owner B's Breakdown:</div>
                          <div className="flex justify-between gap-4">
                            <span>Machine Cost (Owner B's):</span>
                            <span>€{ownerBMachineCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span>Filament Cost:</span>
                            <span>€{totalPrintingCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span>Materials:</span>
                            <span>€{totalMaterialsCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span>Packaging:</span>
                            <span>€{totalPackagingCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span>Half Profit:</span>
                            <span>€{halfProfit.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span>Half Emergency:</span>
                            <span>€{halfEmergency.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span>VAT (23%):</span>
                            <span>€{vatAmountFromSellingPrice.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4 font-bold border-t border-blue-700 pt-1 mt-2">
                            <span>Total:</span>
                            <span>€{ownerBReceives.toFixed(2)}</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 flex justify-center gap-2 sm:gap-4">
              <Button onClick={handleSaveQuote} className="flex-1 bg-green-600 hover:bg-green-700 text-white" size="lg">
                {isEditingQuote ? "Update Quote" : "Save Quote"}
              </Button>
              <Button
                onClick={handleSaveAsDraft}
                variant="default"
                className="flex-1"
                size="lg"
                disabled={isSavingDraft}
              >
                {isSavingDraft ? "Saving..." : isEditingQuote ? "Update Draft" : "Save as Draft"}
              </Button>
            </div>
          </Card>

          {/* Placeholder for Laser Calculator */}
          {/* This section remains as a placeholder as the LaserCalculator component itself is not provided */}
          {/* The logic has been adjusted to dynamically render labels and buttons based on calculatorType */}
          {/* If the LaserCalculator component is intended to be interactive, its implementation would be needed here */}
          {/* For now, it acts as a static display */}
          {/* Removed conditional rendering for the 3D print specific section. */}
          {/* All parts of the UI that were previously within the 3D print block are now always rendered, */}
          {/* with labels and button text dynamically changing based on the selected calculatorType. */}

          {/* If you were to implement the LaserCalculator component, you would uncomment and use this section: */}
          {/*
        calculatorType !== "3d-print" && (
          <LaserCalculator
            type={calculatorType}
            materials={initialLaserMaterials} // Assuming laserMaterials are relevant here
            globalSettings={initialGlobalSettings}
            mode={mode}
          />
        )
        */}
        </div>
      </div>
    </TooltipProvider>
  )
}
