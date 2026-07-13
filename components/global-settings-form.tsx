"use client"

import { useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { geocodeAddress } from "@/lib/geo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Save, Trash2, Upload, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { LASER_DEFAULTS } from "@/lib/laser-pricing"

// Logos are stored inline as data URIs in localStorage, so keep them small.
const MAX_LOGO_BYTES = 200 * 1024

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
  vat_rate?: number
  currency_symbol?: string
  validity_days?: number
  company_name?: string
  company_address?: string
  company_email?: string
  company_phone?: string
  company_tax_id?: string
  company_logo?: string
  laser_min_job_price?: number
  sticker_min_job_price?: number
  default_setup_fee?: number
  qty_discount_tiers?: { min_qty: number; discount_pct: number }[]
  company_lat?: number | null
  company_lon?: number | null
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
  // Shown to the user as a percent (23), stored as a fraction (0.23). Round
  // the fraction->percent conversion to dodge float artifacts (0.23*100).
  const [vatPercent, setVatPercent] = useState(
    (Math.round((settings?.vat_rate ?? 0.23) * 10000) / 100).toString(),
  )
  const [currencySymbol, setCurrencySymbol] = useState(settings?.currency_symbol || "€")
  const [validityDays, setValidityDays] = useState(settings?.validity_days?.toString() || "30")
  const [companyName, setCompanyName] = useState(settings?.company_name || "")
  const [companyAddress, setCompanyAddress] = useState(settings?.company_address || "")
  const [companyEmail, setCompanyEmail] = useState(settings?.company_email || "")
  const [companyPhone, setCompanyPhone] = useState(settings?.company_phone || "")
  const [companyTaxId, setCompanyTaxId] = useState(settings?.company_tax_id || "")
  const [companyLogo, setCompanyLogo] = useState(settings?.company_logo || "")
  const [laserMinJobPrice, setLaserMinJobPrice] = useState(
    settings?.laser_min_job_price?.toString() ?? LASER_DEFAULTS.laser_min_job_price.toString(),
  )
  const [stickerMinJobPrice, setStickerMinJobPrice] = useState(
    settings?.sticker_min_job_price?.toString() ?? LASER_DEFAULTS.sticker_min_job_price.toString(),
  )
  const [defaultSetupFee, setDefaultSetupFee] = useState(
    settings?.default_setup_fee?.toString() ?? LASER_DEFAULTS.default_setup_fee.toString(),
  )
  const [qtyDiscountTiers, setQtyDiscountTiers] = useState(
    (settings?.qty_discount_tiers ?? LASER_DEFAULTS.qty_discount_tiers).map((tier) => ({
      min_qty: tier.min_qty.toString(),
      discount_pct: tier.discount_pct.toString(),
    })),
  )
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Allow re-selecting the same file after a remove.
    e.target.value = ""
    if (!file) return
    if (file.size > MAX_LOGO_BYTES) {
      toast({
        title: "Logo too large",
        description: `The logo must be under ${Math.round(MAX_LOGO_BYTES / 1024)}KB. Please use a smaller image.`,
        variant: "destructive",
      })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") setCompanyLogo(reader.result)
    }
    reader.readAsDataURL(file)
  }

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
      { label: "Quote Validity", value: validityDays },
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

    const vatPercentValue = Number.parseFloat(vatPercent)
    if (!Number.isFinite(vatPercentValue) || vatPercentValue < 0 || vatPercentValue > 100) {
      toast({
        title: "Invalid settings",
        description: "VAT Rate must be a number between 0 and 100.",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    const supabase = createClient()

    // Cache home coordinates for the route-distance dialog. Best-effort: the
    // dialog re-geocodes on open when no cached coordinates exist, so a
    // geocoding failure must never block saving settings.
    const trimmedAddress = companyAddress.trim()
    let companyLat = settings?.company_lat ?? null
    let companyLon = settings?.company_lon ?? null
    if (!trimmedAddress) {
      companyLat = null
      companyLon = null
    } else if (trimmedAddress !== (settings?.company_address || "").trim()) {
      try {
        const results = await geocodeAddress(trimmedAddress)
        companyLat = results[0]?.lat ?? null
        companyLon = results[0]?.lon ?? null
      } catch {
        // Stale coordinates for a changed address would be wrong — drop them.
        companyLat = null
        companyLon = null
      }
    }

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
        // Stored as a fraction; the UI edits a percent.
        vat_rate: vatPercentValue / 100,
        currency_symbol: currencySymbol.trim() || "€",
        validity_days: Number.parseFloat(validityDays),
        company_name: companyName.trim(),
        company_address: companyAddress.trim(),
        company_lat: companyLat,
        company_lon: companyLon,
        company_email: companyEmail.trim(),
        company_phone: companyPhone.trim(),
        company_tax_id: companyTaxId.trim(),
        company_logo: companyLogo,
        laser_min_job_price: Number.parseFloat(laserMinJobPrice) || 0,
        sticker_min_job_price: Number.parseFloat(stickerMinJobPrice) || 0,
        default_setup_fee: Number.parseFloat(defaultSetupFee) || 0,
        qty_discount_tiers: qtyDiscountTiers
          .map((tier) => ({
            min_qty: Number.parseInt(tier.min_qty, 10) || 0,
            discount_pct: Number.parseFloat(tier.discount_pct) || 0,
          }))
          .filter((tier) => tier.min_qty > 0 && tier.discount_pct > 0),
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

      {/* Business Identity */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Business Identity</CardTitle>
          <CardDescription>Shown as a letterhead on quotes and invoices (optional)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="companyName">Company Name</Label>
            <Input
              id="companyName"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="bg-card"
              placeholder="e.g. Acme 3D Prints"
            />
          </div>

          <div>
            <Label htmlFor="companyAddress">Address</Label>
            <Textarea
              id="companyAddress"
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              className="bg-card"
              rows={2}
              placeholder={"Street, number\nPostal code, City"}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="companyEmail">Email</Label>
              <Input
                id="companyEmail"
                type="email"
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
                className="bg-card"
              />
            </div>
            <div>
              <Label htmlFor="companyPhone">Phone</Label>
              <Input
                id="companyPhone"
                type="tel"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                className="bg-card"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="companyTaxId">Tax ID / VAT Number</Label>
            <Input
              id="companyTaxId"
              type="text"
              value={companyTaxId}
              onChange={(e) => setCompanyTaxId(e.target.value)}
              className="bg-card"
            />
          </div>

          <div>
            <Label htmlFor="companyLogo">Logo</Label>
            <input
              ref={logoInputRef}
              id="companyLogo"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
            {companyLogo ? (
              <div className="mt-2 flex items-center gap-4">
                {/* Data-URI preview; next/image adds nothing for inline data. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={companyLogo}
                  alt="Company logo preview"
                  className="h-16 max-w-[200px] rounded-md border border-border bg-white object-contain p-1"
                />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    Replace
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCompanyLogo("")}
                    aria-label="Remove logo"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload logo
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1.5">PNG/JPG/SVG up to 200KB, stored locally with your settings</p>
          </div>
        </CardContent>
      </Card>

      {/* Quotes & Billing */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Quotes &amp; Billing</CardTitle>
          <CardDescription>VAT, currency and quote validity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="vatRate">
              VAT Rate (%)
            </Label>
            <Input
              id="vatRate"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={vatPercent}
              onChange={(e) => setVatPercent(e.target.value)}
              className="bg-card"
            />
            <p className="text-xs text-muted-foreground mt-1.5">Applied to business quotes with VAT enabled (default: 23%)</p>
          </div>

          <div>
            <Label htmlFor="currencySymbol">
              Currency Symbol
            </Label>
            <Input
              id="currencySymbol"
              type="text"
              maxLength={4}
              value={currencySymbol}
              onChange={(e) => setCurrencySymbol(e.target.value)}
              className="bg-card w-24"
            />
            <p className="text-xs text-muted-foreground mt-1.5">Shown on quote documents (default: €)</p>
          </div>

          <div>
            <Label htmlFor="validityDays">
              Quote Validity (days)
            </Label>
            <Input
              id="validityDays"
              type="number"
              min="0"
              step="1"
              value={validityDays}
              onChange={(e) => setValidityDays(e.target.value)}
              className="bg-card"
            />
            <p className="text-xs text-muted-foreground mt-1.5">How long new quotes stay valid from the day they are saved (default: 30)</p>
          </div>
        </CardContent>
      </Card>

      {/* Laser & Stickers */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Laser &amp; Stickers</CardTitle>
          <CardDescription>Minimum job prices, setup fee, and quantity discounts for laser/sticker quotes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Laser minimum job price (€)</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={laserMinJobPrice}
                onChange={(e) => setLaserMinJobPrice(e.target.value)}
                className="bg-card"
              />
            </div>
            <div>
              <Label>Sticker minimum job price (€)</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={stickerMinJobPrice}
                onChange={(e) => setStickerMinJobPrice(e.target.value)}
                className="bg-card"
              />
            </div>
            <div>
              <Label>Default setup fee (€)</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={defaultSetupFee}
                onChange={(e) => setDefaultSetupFee(e.target.value)}
                className="bg-card"
              />
            </div>
          </div>
          <div className="mt-4">
            <Label>Quantity discounts</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Items whose quantity reaches a tier get that discount on their line price.
            </p>
            {qtyDiscountTiers.map((tier, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={tier.min_qty}
                  placeholder="Min qty"
                  className="w-28 bg-card"
                  onChange={(e) =>
                    setQtyDiscountTiers(
                      qtyDiscountTiers.map((t, j) => (j === i ? { ...t, min_qty: e.target.value } : t)),
                    )
                  }
                />
                <span className="text-sm text-muted-foreground">pcs →</span>
                <Input
                  type="number"
                  min="0"
                  max="95"
                  step="1"
                  value={tier.discount_pct}
                  placeholder="%"
                  className="w-24 bg-card"
                  onChange={(e) =>
                    setQtyDiscountTiers(
                      qtyDiscountTiers.map((t, j) => (j === i ? { ...t, discount_pct: e.target.value } : t)),
                    )
                  }
                />
                <span className="text-sm text-muted-foreground">% off</span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove tier"
                  onClick={() => setQtyDiscountTiers(qtyDiscountTiers.filter((_, j) => j !== i))}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setQtyDiscountTiers([...qtyDiscountTiers, { min_qty: "", discount_pct: "" }])}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add tier
            </Button>
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
