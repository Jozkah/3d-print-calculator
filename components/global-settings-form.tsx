"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Save } from "lucide-react"
import { useRouter } from "next/navigation"

type GlobalSettings = {
  id: string
  electricity_cost_per_kwh: number
  fuel_cost_per_liter: number
  car_fuel_consumption_per_100km: number
  labor_hourly_rate: number
  material_efficiency_factor: number
  cost_buffer_factor: number
  emergency_fee_fixed: number
}

export function GlobalSettingsForm({ settings }: { settings: GlobalSettings | null }) {
  const [electricityCost, setElectricityCost] = useState(settings?.electricity_cost_per_kwh?.toString() || "0.20")
  const [fuelCost, setFuelCost] = useState(settings?.fuel_cost_per_liter?.toString() || "2.00")
  const [fuelConsumption, setFuelConsumption] = useState(settings?.car_fuel_consumption_per_100km?.toString() || "7.5")
  const [laborRate, setLaborRate] = useState(settings?.labor_hourly_rate?.toString() || "7.5")
  const [efficiencyFactor, setEfficiencyFactor] = useState(settings?.material_efficiency_factor?.toString() || "1.1")
  const [bufferFactor, setBufferFactor] = useState(settings?.cost_buffer_factor?.toString() || "1.3")
  const [emergencyFee, setEmergencyFee] = useState(settings?.emergency_fee_fixed?.toString() || "10.00")
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  const handleSave = async () => {
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
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings?.id)

    setIsSaving(false)

    if (!error) {
      alert("Settings saved successfully!")
      router.refresh()
    } else {
      alert("Error saving settings")
    }
  }

  return (
    <div className="space-y-6">
      {/* Cost Settings */}
      <Card className="border-2 border-blue-300 bg-white">
        <CardHeader>
          <CardTitle className="text-blue-900">Cost Settings</CardTitle>
          <CardDescription>Base costs for calculations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="electricity" className="text-blue-900">
              Electricity Cost (€/kWh)
            </Label>
            <Input
              id="electricity"
              type="number"
              step="0.01"
              value={electricityCost}
              onChange={(e) => setElectricityCost(e.target.value)}
              className="border-blue-200"
            />
            <p className="text-xs text-blue-600 mt-1">Cost per kilowatt-hour for electricity</p>
          </div>

          <div>
            <Label htmlFor="emergency" className="text-blue-900">
              Emergency Fee (€)
            </Label>
            <Input
              id="emergency"
              type="number"
              step="0.01"
              value={emergencyFee}
              onChange={(e) => setEmergencyFee(e.target.value)}
              className="border-blue-200"
            />
            <p className="text-xs text-blue-600 mt-1">Fixed fee for emergency/rush orders</p>
          </div>

          <div>
            <Label htmlFor="labor" className="text-blue-900">
              Labor Hourly Rate (€/hr)
            </Label>
            <Input
              id="labor"
              type="number"
              step="0.01"
              value={laborRate}
              onChange={(e) => setLaborRate(e.target.value)}
              className="border-blue-200"
            />
          </div>
        </CardContent>
      </Card>

      {/* Transportation Settings */}
      <Card className="border-2 border-blue-300 bg-white">
        <CardHeader>
          <CardTitle className="text-blue-900">Transportation Settings</CardTitle>
          <CardDescription>Fuel and vehicle costs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="fuel" className="text-blue-900">
              Fuel Cost (€/liter)
            </Label>
            <Input
              id="fuel"
              type="number"
              step="0.01"
              value={fuelCost}
              onChange={(e) => setFuelCost(e.target.value)}
              className="border-blue-200"
            />
          </div>

          <div>
            <Label htmlFor="consumption" className="text-blue-900">
              Car Fuel Consumption (liters/100km)
            </Label>
            <Input
              id="consumption"
              type="number"
              step="0.1"
              value={fuelConsumption}
              onChange={(e) => setFuelConsumption(e.target.value)}
              className="border-blue-200"
            />
          </div>
        </CardContent>
      </Card>

      {/* Advanced Settings */}
      <Card className="border-2 border-blue-300 bg-white">
        <CardHeader>
          <CardTitle className="text-blue-900">Advanced Settings</CardTitle>
          <CardDescription>Adjustment factors for calculations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="efficiency" className="text-blue-900">
              Material Efficiency Factor
            </Label>
            <Input
              id="efficiency"
              type="number"
              step="0.01"
              value={efficiencyFactor}
              onChange={(e) => setEfficiencyFactor(e.target.value)}
              className="border-blue-200"
            />
            <p className="text-xs text-blue-600 mt-1">Multiplier for printing inefficiencies (default: 1.1 = 110%)</p>
          </div>

          <div>
            <Label htmlFor="buffer" className="text-blue-900">
              Cost Buffer Factor
            </Label>
            <Input
              id="buffer"
              type="number"
              step="0.01"
              value={bufferFactor}
              onChange={(e) => setBufferFactor(e.target.value)}
              className="border-blue-200"
            />
            <p className="text-xs text-blue-600 mt-1">Buffer for unforeseen expenses (default: 1.3)</p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} className="w-full bg-blue-600 hover:bg-blue-700" disabled={isSaving}>
        <Save className="w-4 h-4 mr-2" />
        {isSaving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  )
}
