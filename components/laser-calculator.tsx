"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Copy, AlertTriangle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { ClientSelector } from "@/components/client-selector"
import { LaborTable, PackagingTable, type LaborItemRow, type PackagingItemRow } from "@/components/quote-line-tables"
import { formatMoney } from "@/lib/format"
import {
  computeLaserQuote,
  itemQty,
  pricingUnitLabel,
  usageUnitLabel,
  LASER_DEFAULTS,
  type LaserItem,
} from "@/lib/laser-pricing"
import type { Client, GlobalSettings, LaserMaterial, Printer } from "@/types/db"

interface LaserCalculatorProps {
  machines: Printer[] // rows with machine_type "laser" | "sticker-printer"
  materials: LaserMaterial[]
  globalSettings: GlobalSettings | null
  mode?: "business" | "personal"
  clients?: Client[]
  editingQuoteId?: string
}

const newItem = (): LaserItem => ({
  id: crypto.randomUUID(),
  name: "",
  quantity: 1,
  material_id: "",
  usage: 0,
  usage_width_cm: null,
  usage_height_cm: null,
  machine_id: "",
  machine_minutes: 0,
})

function UsageCell({
  item,
  material,
  onPatch,
}: {
  item: LaserItem
  material: LaserMaterial | undefined
  onPatch: (patch: Partial<LaserItem>) => void
}) {
  if (!material) return <span className="text-xs text-muted-foreground">Pick a material first</span>
  const unit = material.pricing_unit

  if (unit === "area" || (unit === "sheet" && material.sheet_width_cm && material.sheet_height_cm)) {
    // Dimension entry. For dimensioned sheets the W×H converts to a sheet fraction.
    const sheetArea =
      unit === "sheet" ? (material.sheet_width_cm || 0) * (material.sheet_height_cm || 0) : 1
    const toUsage = (w: number, h: number) => (unit === "area" ? w * h : sheetArea > 0 ? (w * h) / sheetArea : 0)
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number" min="0" step="0.1" placeholder="W" className="w-16 bg-card"
          value={item.usage_width_cm || ""}
          onChange={(e) => {
            const w = Number.parseFloat(e.target.value) || 0
            onPatch({ usage_width_cm: w, usage: toUsage(w, item.usage_height_cm || 0) })
          }}
        />
        <span className="text-xs text-muted-foreground">×</span>
        <Input
          type="number" min="0" step="0.1" placeholder="H" className="w-16 bg-card"
          value={item.usage_height_cm || ""}
          onChange={(e) => {
            const h = Number.parseFloat(e.target.value) || 0
            onPatch({ usage_height_cm: h, usage: toUsage(item.usage_width_cm || 0, h) })
          }}
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {unit === "area" ? `= ${(item.usage || 0).toFixed(1)} cm²` : `= ${(item.usage || 0).toFixed(2)} sheets`}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number" min="0" step={unit === "sheet" ? "0.05" : "1"} className="w-24 bg-card"
        value={item.usage || ""}
        onChange={(e) => onPatch({ usage: Number.parseFloat(e.target.value) || 0, usage_width_cm: null, usage_height_cm: null })}
      />
      <span className="text-xs text-muted-foreground">{usageUnitLabel(unit)}</span>
    </div>
  )
}

export function LaserCalculator({
  machines,
  materials,
  globalSettings,
  mode = "business",
  clients: initialClients = [],
  editingQuoteId,
}: LaserCalculatorProps) {
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])

  const [items, setItems] = useState<LaserItem[]>([newItem()])
  const [labor, setLabor] = useState<LaborItemRow[]>([])
  const [packaging, setPackaging] = useState<PackagingItemRow[]>([])
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [clientName, setClientName] = useState("")
  const [clientId, setClientId] = useState<string | null>(null)
  const [distanceTraveledKm, setDistanceTraveledKm] = useState(0)
  const [isEmergency, setIsEmergency] = useState(false)
  const [vatEnabled, setVatEnabled] = useState(true)
  const [setupFee, setSetupFee] = useState<number>(globalSettings?.default_setup_fee ?? LASER_DEFAULTS.default_setup_fee)
  const [marginInputMode, setMarginInputMode] = useState<"percentage" | "targetPrice">("percentage")
  const [selectedMargin, setSelectedMargin] = useState(50)
  const [customMargin, setCustomMargin] = useState(65)
  const [targetPrice, setTargetPrice] = useState(0)
  const [isEditingQuote, setIsEditingQuote] = useState(false)
  const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const materialsById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials])
  const machinesById = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines])

  const currency = globalSettings?.currency_symbol || "€"
  const money = (n: number) => formatMoney(n, currency)
  const vatRate = globalSettings?.vat_rate ?? 0.23
  const vatPercentLabel = Math.round(vatRate * 10000) / 100
  const vatApplies = mode === "business" && vatEnabled
  const validityDays = globalSettings?.validity_days ?? 30
  const emergencyFee = isEmergency && globalSettings ? globalSettings.emergency_fee_fixed : 0

  const laborCost = labor.reduce((s, l) => s + l.hours * l.hourly_cost, 0)
  const packagingCost = packaging.reduce((s, p) => s + p.quantity * p.unit_cost, 0)
  const fuelCost = globalSettings
    ? (distanceTraveledKm / 100) * globalSettings.car_fuel_consumption_per_100km * globalSettings.fuel_cost_per_liter
    : 0

  const breakdown = useMemo(
    () =>
      computeLaserQuote({
        items,
        materialsById,
        machinesById,
        electricityCostPerKwh: globalSettings?.electricity_cost_per_kwh ?? 0,
        materialEfficiencyFactor: globalSettings?.material_efficiency_factor ?? 1.1,
        laborCost,
        packagingCost,
        fuelCost,
        setupFee,
        marginPct: selectedMargin,
        qtyDiscountTiers: globalSettings?.qty_discount_tiers ?? LASER_DEFAULTS.qty_discount_tiers,
        applyDiscountsAndMinimum: marginInputMode !== "targetPrice",
        laserMinJobPrice: globalSettings?.laser_min_job_price ?? LASER_DEFAULTS.laser_min_job_price,
        stickerMinJobPrice: globalSettings?.sticker_min_job_price ?? LASER_DEFAULTS.sticker_min_job_price,
        emergencyFee,
        vatRate: vatApplies ? vatRate : 0,
      }),
    [items, materialsById, machinesById, globalSettings, laborCost, packagingCost, fuelCost, setupFee, selectedMargin, marginInputMode, emergencyFee, vatApplies, vatRate],
  )

  // Target-price mode back-solves the margin from base cost, exactly like the
  // 3D calculator does (targetPrice is VAT-inclusive when VAT applies).
  useEffect(() => {
    if (marginInputMode !== "targetPrice" || targetPrice <= 0) return
    const targetExVat = vatApplies ? targetPrice / (1 + vatRate) : targetPrice
    const priceBeforeEmergency = Math.max(0, targetExVat - emergencyFee)
    if (breakdown.baseCost > 0 && priceBeforeEmergency > breakdown.baseCost) {
      const m = Math.max(0, Math.round((1 - breakdown.baseCost / priceBeforeEmergency) * 1000) / 10)
      // Back-solved state is persisted on save, not pure derived data.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedMargin(m)
      setCustomMargin(m)
    } else {
      setSelectedMargin(0)
      setCustomMargin(0)
    }
  }, [marginInputMode, targetPrice, breakdown.baseCost, vatApplies, vatRate, emergencyFee])

  const finalPrice = marginInputMode === "targetPrice" && targetPrice > 0 ? targetPrice : breakdown.total

  // ---- Edit-mode hydration -------------------------------------------------
  useEffect(() => {
    if (!editingQuoteId) return
    const loadQuote = async () => {
      const { data, error } = await supabase.from("quotes").select("*").eq("id", editingQuoteId).single()
      if (error || !data || data.quote_type_mode !== "laser") return
      setIsEditingQuote(true)
      setCurrentQuoteId(data.id)
      setClientName(data.quote_name || "")
      setClientId(data.client_id ?? null)
      setItems(
        (data.laser_items || []).map((it: any) => ({
          id: it.id || crypto.randomUUID(),
          name: it.name || "",
          quantity: Number(it.quantity) || 1,
          material_id: it.material_id || "",
          usage: Number(it.usage) || 0,
          usage_width_cm: it.usage_width_cm ?? null,
          usage_height_cm: it.usage_height_cm ?? null,
          machine_id: it.machine_id || "",
          machine_minutes: Number(it.machine_minutes) || 0,
        })),
      )
      setLabor((data.labor_items || []).map((l: any) => ({ id: l.id || crypto.randomUUID(), action: l.action || "", hours: Number(l.hours) || 0, hourly_cost: Number(l.hourly_cost) || 0 })))
      setPackaging((data.packaging_items || []).map((p: any) => ({ id: p.id || crypto.randomUUID(), name: p.name || "", quantity: Number(p.quantity) || 0, unit_cost: Number(p.unit_cost) || 0 })))
      setDistanceTraveledKm(Number(data.distance_traveled_km) || 0)
      setIsEmergency(Boolean(data.is_emergency))
      setVatEnabled(data.vat_enabled !== false)
      setSetupFee(Number(data.setup_fee) || 0)
      if (data.final_price != null && data.selected_margin_percentage == null) {
        setMarginInputMode("targetPrice")
        setTargetPrice(Number(data.final_price) || 0)
      } else {
        setSelectedMargin(Number(data.selected_margin_percentage) || 50)
      }
    }
    loadQuote()
  }, [editingQuoteId, supabase])

  // ---- Item helpers --------------------------------------------------------
  const patchItem = (index: number, patch: Partial<LaserItem>) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))

  const duplicateItem = (index: number) =>
    setItems((prev) => {
      const copy = { ...prev[index], id: crypto.randomUUID(), name: prev[index].name ? `${prev[index].name} (copy)` : "" }
      const next = [...prev]
      next.splice(index + 1, 0, copy)
      return next
    })

  // ---- Save ----------------------------------------------------------------
  const buildQuoteData = (isDraft: boolean) => {
    const persistedItems = items.map((it) => {
      const b = breakdown.items.find((x) => x.id === it.id)
      return {
        ...it,
        material_name: materialsById.get(it.material_id)?.name ?? "",
        machine_name: machinesById.get(it.machine_id)?.name ?? "",
        cost_per_piece: b?.costPerPiece ?? 0,
        sell_per_piece: b?.sellPerPiece ?? 0,
        line_sell: b?.lineSell ?? 0,
        discount_pct: b?.discountPct ?? 0,
      }
    })
    return {
      quote_type: mode,
      quote_name: clientName,
      client_id: clientId,
      quote_type_mode: "laser",
      laser_items: persistedItems,
      printed_parts: [],
      dried_batches: [],
      materials: [],
      labor_items: labor,
      packaging_items: packaging,
      distance_traveled_km: distanceTraveledKm,
      is_emergency: isEmergency,
      total_printing_cost: breakdown.materialCost,
      machine_cost: breakdown.machineCost,
      drying_cost: 0,
      materials_cost: 0,
      labor_cost: laborCost,
      packaging_cost: packagingCost,
      fuel_cost: fuelCost,
      emergency_fee: emergencyFee,
      // Machine electricity is inside machine_cost (buffered), not separate.
      electricity_cost: 0,
      landed_cost: breakdown.baseCost,
      setup_fee: breakdown.setupFee,
      discount_amount: breakdown.discountAmount,
      min_job_price: breakdown.minJobPrice,
      min_price_applied: breakdown.minPriceApplied,
      min_price_adjustment: breakdown.minPriceAdjustment,
      margin_30: breakdown.baseCost / 0.7 + emergencyFee,
      margin_40: breakdown.baseCost / 0.6 + emergencyFee,
      margin_50: breakdown.baseCost / 0.5 + emergencyFee,
      margin_60: breakdown.baseCost / 0.4 + emergencyFee,
      custom_margin_value: customMargin,
      selected_margin_percentage: marginInputMode === "targetPrice" ? null : selectedMargin,
      selected_margin: String(selectedMargin || 0),
      // Authoritative, VAT-inclusive total — documents render this directly.
      final_price: finalPrice,
      owner_a_receives: null,
      owner_b_receives: null,
      is_draft: isDraft,
      vat_enabled: vatEnabled,
      vat_rate: vatRate,
      valid_until: new Date(Date.now() + validityDays * 86400000).toISOString(),
    }
  }

  const handleSave = async (isDraft: boolean) => {
    if (!clientName.trim()) {
      toast({ title: "Client Name Required", description: "Please enter a client name before saving.", variant: "destructive" })
      return
    }
    if (isSaving) return
    setIsSaving(true)
    try {
      const quoteData = buildQuoteData(isDraft)
      const { error } =
        isEditingQuote && currentQuoteId
          ? await supabase.from("quotes").update(quoteData).eq("id", currentQuoteId)
          : await supabase.from("quotes").insert([quoteData])
      if (error) throw error
      toast({ title: "Success", description: `${isDraft ? "Draft" : "Quote"} "${clientName}" saved.` })
      if (!isDraft) {
        setClientName("")
        setIsEditingQuote(false)
        setCurrentQuoteId(null)
      }
    } catch (error: any) {
      console.error("Error saving laser quote:", error)
      toast({ title: "Error", description: `Error saving: ${error.message}`, variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  if (!globalSettings) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-muted-foreground animate-pulse">Loading calculator...</div>
      </div>
    )
  }

  const noMachines = machines.length === 0
  const noMaterials = materials.length === 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {(noMachines || noMaterials) && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5 text-sm flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
          <div className="space-y-1">
            {noMachines && (
              <p>No laser or sticker machines yet — add one under <a href="/settings/printers" className="underline">Settings → Printers & Machines</a> with machine type "Laser" or "Sticker Printer".</p>
            )}
            {noMaterials && (
              <p>No materials yet — add sheets/rolls under <a href="/settings/materials" className="underline">Settings → Laser & Sticker Materials</a>.</p>
            )}
          </div>
        </Card>
      )}

      {/* Client / order details */}
      <Card className="p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight text-foreground mb-4">Order Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Client</Label>
            <ClientSelector
              value={clientName}
              onChange={(name, id) => {
                setClientName(name)
                setClientId(id || null)
              }}
              clients={clients}
              onClientsUpdate={async () => {
                const { data } = await supabase.from("clients").select("*").order("name")
                if (data) setClients(data)
              }}
              placeholder="Select or add client..."
              className="bg-card"
            />
          </div>
          <div>
            <Label htmlFor="laser-distance">Distance Traveled (km)</Label>
            <Input id="laser-distance" type="number" min="0" step="0.1" className="bg-card"
              value={distanceTraveledKm || ""}
              onChange={(e) => setDistanceTraveledKm(Number.parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <div className="flex flex-col gap-4 mt-4">
          <div className="flex items-center space-x-2">
            <Checkbox id="laser-emergency" checked={isEmergency} onCheckedChange={(c) => setIsEmergency(c as boolean)} />
            <Label htmlFor="laser-emergency" className="font-medium">
              Emergency Order (+{money(globalSettings.emergency_fee_fixed)})
            </Label>
          </div>
          {mode === "business" && (
            <div className="flex items-center space-x-2">
              <Checkbox id="laser-vat" checked={vatEnabled} onCheckedChange={(c) => setVatEnabled(c as boolean)} />
              <Label htmlFor="laser-vat" className="font-medium">Include VAT ({vatPercentLabel}%)</Label>
            </div>
          )}
        </div>
      </Card>

      {/* Items */}
      <Card className="p-5 sm:p-6 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Items</h2>
          <Button className="shadow-sm" onClick={() => setItems((prev) => [...prev, newItem()])}>
            <Plus className="w-4 h-4 mr-2" />Add Item
          </Button>
        </div>
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-muted/60 border-b border-border">
                {["Item", "Material", "Usage / piece", "Machine", "Min / piece", "Qty", "Sell / piece", "Line total", ""].map((h) => (
                  <th key={h} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const material = materialsById.get(item.material_id)
                const line = breakdown.items.find((b) => b.id === item.id)
                const rowIncomplete = !item.material_id || !item.machine_id
                return (
                  <tr key={item.id} className="border-b border-border/60 transition-colors hover:bg-muted/30 align-top">
                    <td className="p-2 min-w-[130px]">
                      <Input value={item.name} placeholder="Item name" className="bg-card"
                        onChange={(e) => patchItem(index, { name: e.target.value })} />
                      {rowIncomplete && (
                        <p className="mt-1 text-[11px] text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />Pick material & machine — row counts as {money(0)}
                        </p>
                      )}
                    </td>
                    <td className="p-2 min-w-[170px]">
                      <Select value={item.material_id || undefined}
                        onValueChange={(v) => patchItem(index, { material_id: v, usage: 0, usage_width_cm: null, usage_height_cm: null })}>
                        <SelectTrigger className="bg-card"><SelectValue placeholder="Material" /></SelectTrigger>
                        <SelectContent>
                          {materials.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name} — {m.price?.toFixed(2)} {pricingUnitLabel(m.pricing_unit, currency)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2 min-w-[190px]">
                      <UsageCell item={item} material={material} onPatch={(p) => patchItem(index, p)} />
                    </td>
                    <td className="p-2 min-w-[150px]">
                      <Select value={item.machine_id || undefined} onValueChange={(v) => patchItem(index, { machine_id: v })}>
                        <SelectTrigger className="bg-card"><SelectValue placeholder="Machine" /></SelectTrigger>
                        <SelectContent>
                          {machines.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}{m.machine_type === "sticker-printer" ? " (sticker)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Input type="number" min="0" step="0.5" className="w-20 bg-card" value={item.machine_minutes || ""}
                        onChange={(e) => patchItem(index, { machine_minutes: Number.parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" min="1" step="1" className="w-16 bg-card" value={item.quantity || ""}
                        onChange={(e) => patchItem(index, { quantity: Number.parseInt(e.target.value, 10) || 0 })} />
                    </td>
                    <td className="p-2 tabular-nums text-sm whitespace-nowrap">
                      {money(line?.sellPerPiece ?? 0)}
                      {line && line.discountPct > 0 && (
                        <span className="ml-1 text-[11px] text-primary">−{line.discountPct}%</span>
                      )}
                    </td>
                    <td className="p-2 tabular-nums text-sm font-medium whitespace-nowrap">{money(line?.lineSell ?? 0)}</td>
                    <td className="p-2 whitespace-nowrap">
                      <Button size="icon" variant="ghost" aria-label="Duplicate item" onClick={() => duplicateItem(index)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Remove item"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <LaborTable items={labor} onChange={setLabor} defaultHourlyRate={globalSettings.labor_hourly_rate} />
      <PackagingTable items={packaging} onChange={setPackaging} />

      {/* Pricing */}
      <Card className="p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Pricing</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="setup-fee">Design / setup fee ({currency})</Label>
            <Input id="setup-fee" type="number" min="0" step="0.5" className="bg-card" value={setupFee || ""}
              onChange={(e) => setSetupFee(Number.parseFloat(e.target.value) || 0)} />
            <p className="mt-1 text-xs text-muted-foreground">Charged once per job, sold with margin.</p>
          </div>
          <div>
            <Label>Pricing mode</Label>
            <div className="flex gap-2 mt-1">
              <Button size="sm" variant={marginInputMode === "percentage" ? "default" : "outline"}
                onClick={() => setMarginInputMode("percentage")}>Margin %</Button>
              <Button size="sm" variant={marginInputMode === "targetPrice" ? "default" : "outline"}
                onClick={() => setMarginInputMode("targetPrice")}>Target price</Button>
            </div>
          </div>
        </div>

        {marginInputMode === "percentage" ? (
          <div className="flex flex-wrap items-center gap-2">
            {[30, 40, 50, 60].map((m) => (
              <Button key={m} size="sm" variant={selectedMargin === m ? "default" : "outline"} onClick={() => setSelectedMargin(m)}>
                {m}%
              </Button>
            ))}
            <div className="flex items-center gap-2">
              <Button size="sm" variant={selectedMargin === customMargin && ![30, 40, 50, 60].includes(selectedMargin) ? "default" : "outline"}
                onClick={() => setSelectedMargin(customMargin)}>Custom</Button>
              <Input type="number" min="0" max="95" step="0.5" className="w-20 bg-card" value={customMargin || ""}
                onChange={(e) => {
                  const v = Number.parseFloat(e.target.value) || 0
                  setCustomMargin(v)
                  setSelectedMargin(v)
                }} />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        ) : (
          <div>
            <Label htmlFor="target-price">Target price ({currency}{vatApplies ? ", VAT-inclusive" : ""})</Label>
            <Input id="target-price" type="number" min="0" step="0.5" className="bg-card w-40" value={targetPrice || ""}
              onChange={(e) => setTargetPrice(Number.parseFloat(e.target.value) || 0)} />
            <p className="mt-1 text-xs text-muted-foreground">
              Back-solved margin: {selectedMargin}%. Quantity discounts and the minimum job price are skipped — you set the exact total.
            </p>
          </div>
        )}
      </Card>

      {/* Summary */}
      <Card className="p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight text-foreground mb-4">Summary</h2>
        <div className="space-y-1.5 text-sm">
          {[
            ["Materials", breakdown.materialCost],
            ["Machine time", breakdown.machineCost],
            ["Labor", laborCost],
            ["Packaging", packagingCost],
            ["Fuel / delivery", fuelCost],
            ["Setup fee", breakdown.setupFee],
          ].map(([label, value]) => (
            <div key={label as string} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className="tabular-nums">{money(value as number)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-1.5 font-medium">
            <span>Base cost</span>
            <span className="tabular-nums">{money(breakdown.baseCost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">With {breakdown.marginPct}% margin</span>
            <span className="tabular-nums">{money(breakdown.sellBeforeMinimum + breakdown.discountAmount)}</span>
          </div>
          {breakdown.discountAmount > 0 && (
            <div className="flex justify-between text-primary">
              <span>Quantity discounts</span>
              <span className="tabular-nums">−{money(breakdown.discountAmount)}</span>
            </div>
          )}
          {breakdown.minPriceApplied && (
            <div className="flex justify-between text-amber-600">
              <span>Minimum job price applied ({money(breakdown.minJobPrice)})</span>
              <span className="tabular-nums">+{money(breakdown.minPriceAdjustment)}</span>
            </div>
          )}
          {emergencyFee > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Emergency fee</span>
              <span className="tabular-nums">{money(emergencyFee)}</span>
            </div>
          )}
          {vatApplies && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">VAT ({vatPercentLabel}%)</span>
              <span className="tabular-nums">{money(breakdown.vatAmount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{money(finalPrice)}</span>
          </div>
        </div>

        {breakdown.items.some((b) => itemQty(items.find((i) => i.id === b.id)!) > 0) && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Per piece</p>
            <div className="space-y-1 text-sm">
              {items.map((it) => {
                const b = breakdown.items.find((x) => x.id === it.id)
                if (!b || itemQty(it) === 0) return null
                return (
                  <div key={it.id} className="flex justify-between">
                    <span className="text-muted-foreground truncate mr-4">{it.name || "Unnamed item"} × {itemQty(it)}</span>
                    <span className="tabular-nums whitespace-nowrap">
                      cost {money(b.costPerPiece)} → sell {money(b.sellPerPiece)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => handleSave(false)} disabled={isSaving} className="shadow-sm">
            {isEditingQuote ? "Update Quote" : "Save Quote"}
          </Button>
          <Button variant="outline" onClick={() => handleSave(true)} disabled={isSaving}>
            Save as Draft
          </Button>
        </div>
      </Card>
    </div>
  )
}
