"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Save } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

type GlobalSettings = {
  id: string
  electricity_cost_per_kwh: number
  fuel_cost_per_liter: number
  car_fuel_consumption_per_100km: number
  labor_hourly_rate: number
  material_efficiency_factor: number
  cost_buffer_factor: number
  emergency_fee_fixed: number
  double_heating_cost: boolean
}

export function GlobalSettingsForm({ settings }: { settings: GlobalSettings | null }) {
  const [electricityCost, setElectricityCost] = useState(settings?.electricity_cost_per_kwh?.toString() || "0.20")
  const [fuelCost, setFuelCost] = useState(settings?.fuel_cost_per_liter?.toString() || "2.00")
  const [fuelConsumption, setFuelConsumption] = useState(settings?.car_fuel_consumption_per_100km?.toString() || "7.5")
  const [laborRate, setLaborRate] = useState(settings?.labor_hourly_rate?.toString() || "7.5")
  const [efficiencyFactor, setEfficiencyFactor] = useState(settings?.material_efficiency_factor?.toString() || "1.1")
  const [bufferFactor, setBufferFactor] = useState(settings?.cost_buffer_factor?.toString() || "1.3")
  const [emergencyFee, setEmergencyFee] = useState(settings?.emergency_fee_fixed?.toString() || "10.00")
  const [doubleHeatingCost, setDoubleHeatingCost] = useState(settings?.double_heating_cost ?? true)
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const handleSave = async () => {
    // Validate before writing: an empty/garbage field parses to NaN, which
    // persists as null and crashes every consumer of these settings
    // (e.g. emergency_fee_fixed.toFixed in the calculators).
    const numericFields: { label: string; value: string }[] = [
      { label: "Electricity Cost", value: electricityCost },
      { label: "Fuel Cost", value: fuelCost },
      { label: "Car Fuel Consumption", value: fuelConsumption },
      { label: "Labor Hourly Rate", value: laborRate },
      { label: "Material Efficiency Factor", value: efficiencyFactor },
      { label: "Cost Buffer Factor", value: bufferFactor },
      { label: "Emergency Fee", value: emergencyFee },
    ]
    const invalid = numericFields.filter(({ value }) => {
      const n = Number.parseFloat(value)
      return !Number.isFinite(n) || n < 0
    })
    if (invalid.length > 0) {
      toast({
        title: "Invalid settings",
        description: `${invalid.map((f) => f.label).join(", ")} must be ${
          invalid.length > 1 ? "non-negative numbers" : "a non-negative number"
        }.`,
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    const supabase = createClient()

    const { error } = await supabase
      .from("global_settings")
      .update({
        electricity_cost_per_kwh: Number.parseFloat(electricityCost),
        fuel_cost_per_liter: Number.parseFloat(fuelCost),
        car_fuel_consumption_per_100km: Number.parseFloat(fuelConsumption),
        labor_hourly_rate: Number.parseFloat(laborRate),
        material_efficiency_factor: Number.parseFloat(efficiencyFactor),
        cost_buffer_factor: Number.parseFloat(bufferFactor),
        emergency_fee_fixed: Number.parseFloat(emergencyFee),
        double_heating_cost: doubleHeatingCost,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings?.id)

    setIsSaving(false)

    if (!error) {
      toast({ title: "Success", description: "Settings saved successfully!" })
      router.refresh()
    } else {
      toast({ title: "Error", description: "Error saving settings", variant: "destructive" })
    }
  }

  return (
    <div className="space-y-6">
      {/* Cost Settings */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Cost Settings</CardTitle>
          <CardDescription>Base costs for calculations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="electricity">
              Electricity Cost (€/kWh)
            </Label>
            <Input
              id="electricity"
              type="number"
              min="0" // Added min="0" to prevent negative values
              step="0.01"
              value={electricityCost}
              onChange={(e) => setElectricityCost(e.target.value)}
              className="bg-card"
            />
            <p className="text-xs text-muted-foreground mt-1.5">Cost per kilowatt-hour for electricity</p>
          </div>

          <div>
            <Label htmlFor="emergency">
              Emergency Fee (€)
            </Label>
            <Input
              id="emergency"
              type="number"
              min="0" // Added min="0" to prevent negative values
              step="0.01"
              value={emergencyFee}
              onChange={(e) => setEmergencyFee(e.target.value)}
              className="bg-card"
            />
            <p className="text-xs text-muted-foreground mt-1.5">Fixed fee for emergency/rush orders</p>
          </div>

          <div>
            <Label htmlFor="labor">
              Labor Hourly Rate (€/hr)
            </Label>
            <Input
              id="labor"
              type="number"
              min="0" // Added min="0" to prevent negative values
              step="0.01"
              value={laborRate}
              onChange={(e) => setLaborRate(e.target.value)}
              className="bg-card"
            />
          </div>
        </CardContent>
      </Card>

      {/* Transportation Settings */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Transportation Settings</CardTitle>
          <CardDescription>Fuel and vehicle costs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="fuel">
              Fuel Cost (€/liter)
            </Label>
            <Input
              id="fuel"
              type="number"
              min="0" // Added min="0" to prevent negative values
              step="0.01"
              value={fuelCost}
              onChange={(e) => setFuelCost(e.target.value)}
              className="bg-card"
            />
          </div>

          <div>
            <Label htmlFor="consumption">
              Car Fuel Consumption (liters/100km)
            </Label>
            <Input
              id="consumption"
              type="number"
              min="0" // Added min="0" to prevent negative values
              step="0.1"
              value={fuelConsumption}
              onChange={(e) => setFuelConsumption(e.target.value)}
              className="bg-card"
            />
          </div>
        </CardContent>
      </Card>

      {/* Advanced Settings */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Advanced Settings</CardTitle>
          <CardDescription>Adjustment factors for calculations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="efficiency">
              Material Efficiency Factor
            </Label>
            <Input
              id="efficiency"
              type="number"
              min="0" // Added min="0" to prevent negative values
              step="0.01"
              value={efficiencyFactor}
              onChange={(e) => setEfficiencyFactor(e.target.value)}
              className="bg-card"
            />
            <p className="text-xs text-muted-foreground mt-1.5">Multiplier for printing inefficiencies (default: 1.1 = 110%)</p>
          </div>

          <div>
            <Label htmlFor="buffer">
              Cost Buffer Factor
            </Label>
            <Input
              id="buffer"
              type="number"
              min="0" // Added min="0" to prevent negative values
              step="0.01"
              value={bufferFactor}
              onChange={(e) => setBufferFactor(e.target.value)}
              className="bg-card"
            />
            <p className="text-xs text-muted-foreground mt-1.5">Buffer for unforeseen expenses (default: 1.3)</p>
          </div>

          <div className="flex items-start space-x-3 pt-2">
            <Checkbox 
              id="doubleHeating" 
              checked={doubleHeatingCost}
              onCheckedChange={(checked) => setDoubleHeatingCost(checked === true)}
              className="mt-1"
            />
            <div className="flex-1">
              <Label htmlFor="doubleHeating" className="cursor-pointer">
                Double Heating Cost for Filaments Requiring Heating
              </Label>
              <p className="text-xs text-muted-foreground mt-1.5">
                When enabled, heating cost = Drying Hours × (Total Dryer Cost Per Hour × 2). When disabled, heating
                cost = Drying Hours × Total Dryer Cost Per Hour
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} size="lg" className="w-full shadow-sm" disabled={isSaving}>
        <Save className="w-4 h-4 mr-2" />
        {isSaving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  )
}
