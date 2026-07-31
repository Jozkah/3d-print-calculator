"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, AlertTriangle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { ClientSelector } from "@/components/client-selector"
import { PackagingTable, type PackagingItemRow } from "@/components/quote-line-tables"
import { UvItemCard } from "@/components/uv-item-card"
import { UvOperationsTable } from "@/components/uv-operations-table"
import { formatMoney } from "@/lib/format"
import { LASER_DEFAULTS } from "@/lib/laser-pricing"
import {
  computeUvQuote,
  itemQty,
  UV_DEFAULTS,
  resolveBackSides,
  type UvItem,
  type UvOperation,
} from "@/lib/uv-pricing"
import type { Client, GlobalSettings, Printer, UvInk, UvMaterial } from "@/types/db"

interface UvCalculatorProps {
  machines: Printer[] // rows with machine_type "uv-printer"
  materials: UvMaterial[]
  inks: UvInk[]
  globalSettings: GlobalSettings | null
  mode?: "business" | "personal"
  clients?: Client[]
  editingQuoteId?: string
  /** Start a NEW quote pre-filled from a saved template (quote_templates row). */
  templateId?: string
}

const newItem = (): UvItem => ({
  id: crypto.randomUUID(),
  name: "",
  quantity: 1,
  pieces_per_run: 1,
  machine_id: "",
  minutes_per_run: 0,
  material_id: "",
  usage: 0,
  usage_width_cm: null,
  usage_height_cm: null,
  ink: [],
  back_of_item_id: null,
})

/** Rehydrate a persisted item, coercing every number so a hand-edited backup can't produce NaN. */
const hydrateItem = (it: any): UvItem => ({
  id: it.id || crypto.randomUUID(),
  name: it.name || "",
  quantity: Number(it.quantity) || 0,
  pieces_per_run: Number(it.pieces_per_run) || 1,
  machine_id: it.machine_id || "",
  minutes_per_run: Number(it.minutes_per_run) || 0,
  material_id: it.material_id || "",
  usage: Number(it.usage) || 0,
  usage_width_cm: it.usage_width_cm ?? null,
  usage_height_cm: it.usage_height_cm ?? null,
  back_of_item_id: it.back_of_item_id ?? null,
  ink: Array.isArray(it.ink)
    ? it.ink.map((u: any) => ({
        color_key: u.color_key || "",
        ml_per_run: Number(u.ml_per_run) || 0,
        use_refill: Boolean(u.use_refill),
      }))
    : [],
})

const hydrateOperation = (op: any): UvOperation => ({
  id: op.id || crypto.randomUUID(),
  name: op.name || "",
  kind: op.kind === "cost" ? "cost" : "labour",
  minutes: Number(op.minutes) || 0,
  amount: Number(op.amount) || 0,
  scope: op.scope === "run" || op.scope === "piece" ? op.scope : "quote",
  item_id: op.item_id ?? null,
})

export function UvCalculator({
  machines,
  materials,
  inks,
  globalSettings,
  mode = "business",
  clients: initialClients = [],
  editingQuoteId,
  templateId,
}: UvCalculatorProps) {
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])

  const [items, setItems] = useState<UvItem[]>([newItem()])
  const [operations, setOperations] = useState<UvOperation[]>([])
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
  const inksByKey = useMemo(() => new Map(inks.map((i) => [i.color_key, i])), [inks])

  const currency = globalSettings?.currency_symbol || "€"
  const money = (n: number) => formatMoney(n, currency)
  const vatRate = globalSettings?.vat_rate ?? 0.23
  const vatPercentLabel = Math.round(vatRate * 10000) / 100
  const vatApplies = mode === "business" && vatEnabled
  const validityDays = globalSettings?.validity_days ?? 30
  const emergencyFee = isEmergency && globalSettings ? globalSettings.emergency_fee_fixed : 0

  const packagingCost = packaging.reduce((s, p) => s + p.quantity * p.unit_cost, 0)
  const fuelCost = globalSettings
    ? (distanceTraveledKm / 100) * globalSettings.car_fuel_consumption_per_100km * globalSettings.fuel_cost_per_liter
    : 0

  const breakdown = useMemo(
    () =>
      computeUvQuote({
        items,
        operations,
        inksByKey,
        materialsById,
        machinesById,
        electricityCostPerKwh: globalSettings?.electricity_cost_per_kwh ?? 0,
        materialEfficiencyFactor: globalSettings?.material_efficiency_factor ?? 1.1,
        laborHourlyRate: globalSettings?.labor_hourly_rate ?? 0,
        packagingCost,
        fuelCost,
        setupFee,
        marginPct: selectedMargin,
        qtyDiscountTiers: globalSettings?.qty_discount_tiers ?? LASER_DEFAULTS.qty_discount_tiers,
        applyDiscountsAndMinimum: marginInputMode !== "targetPrice",
        uvMinJobPrice: globalSettings?.uv_min_job_price ?? UV_DEFAULTS.uv_min_job_price,
        emergencyFee,
        vatRate: vatApplies ? vatRate : 0,
      }),
    [items, operations, inksByKey, materialsById, machinesById, globalSettings, packagingCost, fuelCost, setupFee, selectedMargin, marginInputMode, emergencyFee, vatApplies, vatRate],
  )

  // Target-price mode back-solves the margin from base cost, exactly like the
  // 3D and laser calculators do (targetPrice is VAT-inclusive when VAT applies).
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
      if (error || !data) {
        toast({ variant: "destructive", title: "Could not load quote", description: error?.message })
        return
      }
      if (data.quote_type_mode !== "uv") return
      setIsEditingQuote(true)
      setCurrentQuoteId(data.id)
      setClientName(data.quote_name || "")
      setClientId(data.client_id ?? null)
      setItems((data.uv_items || []).map(hydrateItem))
      setOperations((data.uv_operations || []).map(hydrateOperation))
      setPackaging(
        (data.packaging_items || []).map((p: any) => ({
          id: p.id || crypto.randomUUID(),
          name: p.name || "",
          quantity: Number(p.quantity) || 0,
          unit_cost: Number(p.unit_cost) || 0,
        })),
      )
      setDistanceTraveledKm(Number(data.distance_traveled_km) || 0)
      setIsEmergency(Boolean(data.is_emergency))
      setVatEnabled(data.vat_enabled !== false)
      setSetupFee(Number(data.setup_fee) || 0)
      if (data.final_price != null && data.selected_margin_percentage == null) {
        setMarginInputMode("targetPrice")
        setTargetPrice(Number(data.final_price) || 0)
      } else {
        const savedMargin = Number(data.selected_margin_percentage)
        setSelectedMargin(Number.isFinite(savedMargin) ? savedMargin : 50)
      }
    }
    loadQuote()
  }, [editingQuoteId, supabase, toast])

  // ---- Template hydration --------------------------------------------------
  // A template is a saved quote structure with no client or pricing identity —
  // items, work steps and packaging carry over, the client does not.
  useEffect(() => {
    if (!templateId || editingQuoteId) return
    const loadTemplate = async () => {
      const { data, error } = await supabase.from("quote_templates").select("*").eq("id", templateId).single()
      if (error || !data) {
        toast({ variant: "destructive", title: "Could not load template", description: error?.message })
        return
      }
      const payload: any = data.payload || {}
      if (payload.quote_type_mode !== "uv") return
      // Template rows get fresh ids; remap back-side links through the same
      // table so a two-sided item survives the copy.
      const hydrated = (payload.uv_items || []).map((it: any) => hydrateItem(it))
      const idMap = new Map(hydrated.map((it: UvItem) => [it.id, crypto.randomUUID()]))
      const templateItems: UvItem[] = hydrated.map((it: UvItem) => ({
        ...it,
        id: idMap.get(it.id)!,
        back_of_item_id: it.back_of_item_id ? idMap.get(it.back_of_item_id) ?? null : null,
      }))
      setItems(templateItems.length > 0 ? templateItems : [newItem()])
      setOperations((payload.uv_operations || []).map((op: any) => ({ ...hydrateOperation(op), id: crypto.randomUUID() })))
      setPackaging(
        (payload.packaging_items || []).map((p: any) => ({
          id: crypto.randomUUID(),
          name: p.name || "",
          quantity: Number(p.quantity) || 0,
          unit_cost: Number(p.unit_cost) || 0,
        })),
      )
      setSetupFee(Number(payload.setup_fee) || 0)
      const savedMargin = Number(payload.selected_margin_percentage)
      if (Number.isFinite(savedMargin) && savedMargin > 0) setSelectedMargin(savedMargin)
      toast({ title: "Template loaded", description: data.name })
    }
    loadTemplate()
  }, [templateId, editingQuoteId, supabase, toast])

  // ---- Item helpers --------------------------------------------------------
  const patchItem = (index: number, patch: Partial<UvItem>) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))

  const duplicateItem = (index: number) =>
    setItems((prev) => {
      const copy = { ...prev[index], id: crypto.randomUUID(), name: prev[index].name ? `${prev[index].name} (copy)` : "" }
      const next = [...prev]
      next.splice(index + 1, 0, copy)
      return next
    })

  // Work steps attached to a removed item would silently cost nothing, so they
  // fall back to "all items" instead of pointing at a ghost.
  const removeItem = (index: number) =>
    setItems((prev) => {
      const removed = prev[index]
      if (removed) {
        setOperations((ops) => ops.map((op) => (op.item_id === removed.id ? { ...op, item_id: null } : op)))
      }
      return prev.filter((_, i) => i !== index)
    })

  // ---- Save ----------------------------------------------------------------
  const buildQuoteData = (isDraft: boolean) => {
    // Save what was priced, not what was typed: a back side's stored name,
    // quantity, nesting and material are all inherited, and the quote/history
    // views read these fields directly.
    const persistedItems = resolveBackSides(items).map((it) => {
      const b = breakdown.items.find((x) => x.id === it.id)
      return {
        ...it,
        material_name: materialsById.get(it.material_id)?.name ?? "",
        machine_name: machinesById.get(it.machine_id)?.name ?? "",
        runs: b?.runs ?? 0,
        cost_per_piece: b?.costPerPiece ?? 0,
        sell_per_piece: b?.sellPerPiece ?? 0,
        line_sell: b?.lineSell ?? 0,
        discount_pct: b?.discountPct ?? 0,
      }
    })
    const persistedOperations = operations.map((op) => {
      const b = breakdown.operations.find((x) => x.id === op.id)
      return { ...op, occurrences: b?.occurrences ?? 0, unit_cost: b?.unitCost ?? 0, total: b?.total ?? 0 }
    })
    return {
      quote_type: mode,
      quote_name: clientName,
      client_id: clientId,
      quote_type_mode: "uv",
      uv_items: persistedItems,
      uv_operations: persistedOperations,
      // Ink billed at OEM drives the price; the actual figure is internal only.
      uv_ink_cost: breakdown.inkCostBilled,
      uv_ink_cost_actual: breakdown.inkCostActual,
      laser_items: [],
      printed_parts: [],
      dried_batches: [],
      materials: [],
      labor_items: [],
      packaging_items: packaging,
      distance_traveled_km: distanceTraveledKm,
      is_emergency: isEmergency,
      total_printing_cost: breakdown.materialCost,
      machine_cost: breakdown.machineCost,
      drying_cost: 0,
      materials_cost: 0,
      labor_cost: breakdown.operationsCost,
      packaging_cost: packagingCost,
      fuel_cost: fuelCost,
      emergency_fee: emergencyFee,
      // Machine electricity is inside machine_cost (buffered), not separate.
      electricity_cost: 0,
      landed_cost: breakdown.baseCost,
      setup_fee: breakdown.setupFee,
      setup_fee_sell: breakdown.setupFeeSell,
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
      console.error("Error saving UV quote:", error)
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
  const noInkPrices = inks.length === 0 || inks.every((i) => !i.oem_volume_ml)

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {(noMachines || noInkPrices) && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5 text-sm flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
          <div className="space-y-1">
            {noMachines && (
              <p>No UV printers yet — add one under <a href="/settings/printers" className="underline">Settings → Printers &amp; Machines</a> with machine type "UV Printer".</p>
            )}
            {noInkPrices && (
              <p>Ink is priced at {money(0)}/ml — set your kit price under <a href="/settings/uv-inks" className="underline">Settings → UV Inks</a> or every quote will under-charge.</p>
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
            <Label htmlFor="uv-distance">Distance Traveled (km)</Label>
            <Input id="uv-distance" type="number" min="0" step="0.1" className="bg-card"
              value={distanceTraveledKm || ""}
              onChange={(e) => setDistanceTraveledKm(Number.parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <div className="flex flex-col gap-4 mt-4">
          <div className="flex items-center space-x-2">
            <Checkbox id="uv-emergency" checked={isEmergency} onCheckedChange={(c) => setIsEmergency(c as boolean)} />
            <Label htmlFor="uv-emergency" className="font-medium">
              Emergency Order (+{money(globalSettings.emergency_fee_fixed)})
            </Label>
          </div>
          {mode === "business" && (
            <div className="flex items-center space-x-2">
              <Checkbox id="uv-vat" checked={vatEnabled} onCheckedChange={(c) => setVatEnabled(c as boolean)} />
              <Label htmlFor="uv-vat" className="font-medium">Include VAT ({vatPercentLabel}%)</Label>
            </div>
          )}
        </div>
      </Card>

      {/* Items */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Items</h2>
          <Button className="shadow-sm" onClick={() => setItems((prev) => [...prev, newItem()])}>
            <Plus className="w-4 h-4 mr-2" />Add Item
          </Button>
        </div>
        {items.map((item, index) => (
          <UvItemCard
            key={item.id}
            item={item}
            index={index}
            inks={inks}
            materials={materials}
            machines={machines}
            // Only front sides can be a target, so back-of-a-back is impossible.
            frontSideOptions={items
              // Number unnamed rows by their real position in the list, not by
              // their position after filtering, or the labels point at the
              // wrong item.
              .map((other, i) => ({
                id: other.id,
                name: other.name || `Item ${i + 1}`,
                // The literal stored name, so a back side mirrors an empty name
                // as empty rather than inheriting the "Item 2" placeholder.
                rawName: other.name,
                quantity: other.quantity,
                pieces_per_run: other.pieces_per_run,
                raw: other,
              }))
              .filter((o) => o.raw.id !== item.id && !o.raw.back_of_item_id)
              .map(({ raw, ...option }) => option)}
            line={breakdown.items.find((b) => b.id === item.id)}
            currency={currency}
            onPatch={(patch) => patchItem(index, patch)}
            onDuplicate={() => duplicateItem(index)}
            onRemove={() => removeItem(index)}
          />
        ))}
      </div>

      <UvOperationsTable
        operations={operations}
        // Resolved names so a back side is listed under its front item's name,
        // marked so the two rows are still tellable apart.
        items={resolveBackSides(items).map((it) => ({
          id: it.id,
          name: it.back_of_item_id ? `${it.name || "Unnamed item"} (back side)` : it.name,
        }))}
        breakdown={breakdown.operations}
        currency={currency}
        onChange={setOperations}
      />
      <PackagingTable items={packaging} onChange={setPackaging} />

      {/* Pricing */}
      <Card className="p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Pricing</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="uv-setup-fee">Design / setup fee ({currency})</Label>
            <Input id="uv-setup-fee" type="number" min="0" step="0.5" className="bg-card" value={setupFee || ""}
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
            <Label htmlFor="uv-target-price">Target price ({currency}{vatApplies ? ", VAT-inclusive" : ""})</Label>
            <Input id="uv-target-price" type="number" min="0" step="0.5" className="bg-card w-40" value={targetPrice || ""}
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
            ["Ink (billed at OEM)", breakdown.inkCostBilled],
            ["Machine time", breakdown.machineCost],
            ["Work steps", breakdown.operationsCost],
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

        <div className="mt-4 rounded-lg border border-dashed border-border p-3 space-y-1 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Internal — not shown on the quote
          </p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ink billed at OEM</span>
            <span className="tabular-nums">{money(breakdown.inkCostBilled)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ink actually loaded</span>
            <span className="tabular-nums">{money(breakdown.inkCostActual)}</span>
          </div>
          <div className="flex justify-between text-primary">
            <span>Extra margin from refill ink</span>
            <span className="tabular-nums">{money(breakdown.inkSaving)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 font-medium">
            <span>Real profit</span>
            <span className="tabular-nums">{money(breakdown.actualProfit)}</span>
          </div>
        </div>

        {breakdown.items.some((b) => {
          const match = items.find((i) => i.id === b.id)
          return match ? itemQty(match) > 0 : false
        }) && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Per piece</p>
            <div className="space-y-1 text-sm">
              {items.map((it) => {
                const b = breakdown.items.find((x) => x.id === it.id)
                if (!b || itemQty(it) === 0) return null
                return (
                  <div key={it.id} className="flex justify-between">
                    <span className="text-muted-foreground truncate mr-4">
                      {it.name || "Unnamed item"} × {itemQty(it)} ({b.runs} run{b.runs === 1 ? "" : "s"})
                    </span>
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
