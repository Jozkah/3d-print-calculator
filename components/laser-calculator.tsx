"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type LaserMaterial = {
  id: string
  name: string
  material_type: string
  price_per_unit: number | null
  unit: string
}

type GlobalSettings = {
  labor_hourly_rate: number
  electricity_cost_per_kwh: number
  [key: string]: any
}

type LaserCalculatorProps = {
  type: "laser-engraving" | "laser-cutting" | "stickers"
  materials: LaserMaterial[]
  globalSettings: GlobalSettings
  mode: "personal" | "business"
}

export function LaserCalculator({ type, materials, globalSettings, mode }: LaserCalculatorProps) {
  const [selectedMaterial, setSelectedMaterial] = useState<string>("")
  const [processingTimeMinutes, setProcessingTimeMinutes] = useState<number>(0)
  const [powerConsumptionWatts, setPowerConsumptionWatts] = useState<number>(0)
  const [materialQuantity, setMaterialQuantity] = useState<number>(1)
  const [laborHours, setLaborHours] = useState<number>(0)
  const [packagingCost, setPackagingCost] = useState<number>(0)

  const selectedMaterialData = materials.find((m) => m.id === selectedMaterial)

  // Calculate costs
  const electricityCost =
    (processingTimeMinutes / 60) * (powerConsumptionWatts / 1000) * globalSettings.electricity_cost_per_kwh

  const materialCost = selectedMaterialData?.price_per_unit ? selectedMaterialData.price_per_unit * materialQuantity : 0

  const laborCost = laborHours * globalSettings.labor_hourly_rate

  const totalCost = electricityCost + materialCost + laborCost + packagingCost

  // Business mode margins
  const margin30 = totalCost * 1.3
  const margin40 = totalCost * 1.4
  const margin50 = totalCost * 1.5
  const margin60 = totalCost * 1.6

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Column - Inputs */}
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-xl font-bold text-blue-600 mb-4">
            {type === "laser-engraving" ? "Laser Engraving" : type === "laser-cutting" ? "Laser Cutting" : "Stickers"}
          </h2>

          <div className="space-y-4">
            {/* Material Selection */}
            <div>
              <Label htmlFor="material">Material</Label>
              <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
                <SelectTrigger id="material">
                  <SelectValue placeholder="Select material" />
                </SelectTrigger>
                <SelectContent>
                  {materials.map((material) => (
                    <SelectItem key={material.id} value={material.id}>
                      {material.name} ({material.material_type})
                      {material.price_per_unit === null && <span className="text-red-500 ml-2">(No Price)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Material Quantity */}
            <div>
              <Label htmlFor="quantity">Material Quantity ({selectedMaterialData?.unit || "units"})</Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                step="0.01"
                value={materialQuantity}
                onChange={(e) => setMaterialQuantity(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "e" || e.key === "E") {
                    e.preventDefault()
                  }
                }}
              />
            </div>

            {/* Processing Time */}
            <div>
              <Label htmlFor="time">Processing Time (minutes)</Label>
              <Input
                id="time"
                type="number"
                min="0"
                step="1"
                value={processingTimeMinutes}
                onChange={(e) => setProcessingTimeMinutes(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "e" || e.key === "E") {
                    e.preventDefault()
                  }
                }}
              />
            </div>

            {/* Power Consumption */}
            <div>
              <Label htmlFor="power">Power Consumption (Watts)</Label>
              <Input
                id="power"
                type="number"
                min="0"
                step="1"
                value={powerConsumptionWatts}
                onChange={(e) => setPowerConsumptionWatts(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "e" || e.key === "E") {
                    e.preventDefault()
                  }
                }}
              />
            </div>

            {/* Labor Hours */}
            <div>
              <Label htmlFor="labor">Labor Hours</Label>
              <Input
                id="labor"
                type="number"
                min="0"
                step="0.25"
                value={laborHours}
                onChange={(e) => setLaborHours(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "e" || e.key === "E") {
                    e.preventDefault()
                  }
                }}
              />
            </div>

            {/* Packaging Cost */}
            <div>
              <Label htmlFor="packaging">Packaging Cost (€)</Label>
              <Input
                id="packaging"
                type="number"
                min="0"
                step="0.01"
                value={packagingCost}
                onChange={(e) => setPackagingCost(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "e" || e.key === "E") {
                    e.preventDefault()
                  }
                }}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Right Column - Cost Breakdown */}
      <div className="space-y-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-blue-600 mb-4">Cost Breakdown</h3>

          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Electricity Cost:</span>
              <span className="font-semibold">€{electricityCost.toFixed(2)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Material Cost:</span>
              <span className="font-semibold">€{materialCost.toFixed(2)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Labor Cost:</span>
              <span className="font-semibold">€{laborCost.toFixed(2)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Packaging Cost:</span>
              <span className="font-semibold">€{packagingCost.toFixed(2)}</span>
            </div>

            <div className="border-t-2 border-blue-200 pt-3 mt-3">
              <div className="flex justify-between text-lg">
                <span className="font-bold text-blue-600">Total Cost:</span>
                <span className="font-bold text-blue-600">€{totalCost.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Business mode profit margins */}
        {mode === "business" && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-blue-600 mb-4">Profit Margins</h3>

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">30% Margin:</span>
                <span className="font-semibold">€{margin30.toFixed(2)}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">40% Margin:</span>
                <span className="font-semibold">€{margin40.toFixed(2)}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">50% Margin:</span>
                <span className="font-semibold">€{margin50.toFixed(2)}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">60% Margin:</span>
                <span className="font-semibold">€{margin60.toFixed(2)}</span>
              </div>
            </div>
          </Card>
        )}

        <Button className="w-full" size="lg">
          Save Quote to History
        </Button>
      </div>
    </div>
  )
}
