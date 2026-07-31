"use client"

// One UV print item. Ink ml and machine minutes are entered PER RUN — that is
// what the RIP reports — and the pricing module pro-rates them across the
// pieces a run actually produces.

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DecimalInput } from "@/components/ui/decimal-input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, Copy, AlertTriangle } from "lucide-react"
import { formatMoney } from "@/lib/format"
import { pricingUnitLabel, usageUnitLabel } from "@/lib/laser-pricing"
import { itemRuns, type UvItem, type UvItemBreakdown, type UvInkUsage } from "@/lib/uv-pricing"
import type { Printer, UvInk, UvMaterial } from "@/types/db"

const NO_MATERIAL = "none"
/** Select sentinel for "not a reverse side of anything". */
const FRONT_SIDE = "front"

/** Material entry adapts to how the material is priced, same as the laser calculator. */
function UsageCell({
  item,
  material,
  onPatch,
}: {
  item: UvItem
  material: UvMaterial | undefined
  onPatch: (patch: Partial<UvItem>) => void
}) {
  if (!material) return null
  const unit = material.pricing_unit

  if (unit === "area" || (unit === "sheet" && material.sheet_width_cm && material.sheet_height_cm)) {
    const sheetArea = unit === "sheet" ? (material.sheet_width_cm || 0) * (material.sheet_height_cm || 0) : 1
    const toUsage = (w: number, h: number) => (unit === "area" ? w * h : sheetArea > 0 ? (w * h) / sheetArea : 0)
    return (
      <div className="flex items-center gap-1">
        <DecimalInput
          min="0" step="0.01" placeholder="W" className="w-16 bg-card"
          value={item.usage_width_cm}
          onValueChange={(w) => onPatch({ usage_width_cm: w, usage: toUsage(w, item.usage_height_cm || 0) })}
        />
        <span className="text-xs text-muted-foreground">×</span>
        <DecimalInput
          min="0" step="0.01" placeholder="H" className="w-16 bg-card"
          value={item.usage_height_cm}
          onValueChange={(h) => onPatch({ usage_height_cm: h, usage: toUsage(item.usage_width_cm || 0, h) })}
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {unit === "area" ? `= ${(item.usage || 0).toFixed(1)} cm²` : `= ${(item.usage || 0).toFixed(2)} sheets`}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <DecimalInput
        min="0" step={unit === "sheet" ? "0.01" : "1"} className="w-24 bg-card"
        value={item.usage}
        onValueChange={(usage) => onPatch({ usage, usage_width_cm: null, usage_height_cm: null })}
      />
      {/* "pieces / piece" reads like a typo, so per-piece stock says it once. */}
      <span className="text-xs text-muted-foreground">
        {unit === "piece" ? "per piece" : `${usageUnitLabel(unit)} / piece`}
      </span>
    </div>
  )
}

export function UvItemCard({
  item,
  index,
  inks,
  materials,
  machines,
  line,
  currency,
  onPatch,
  frontSideOptions,
  onDuplicate,
  onRemove,
}: {
  item: UvItem
  index: number
  inks: UvInk[]
  materials: UvMaterial[]
  machines: Printer[]
  /** Other items this one could be the reverse side of (front sides only). */
  frontSideOptions: { id: string; name: string; quantity: number; pieces_per_run: number; rawName: string }[]
  line: UvItemBreakdown | undefined
  currency: string
  onPatch: (patch: Partial<UvItem>) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const money = (n: number) => formatMoney(n, currency)
  const frontSide = frontSideOptions.find((o) => o.id === item.back_of_item_id)
  // A reverse-side pass reuses the front item's pieces and substrate, so it
  // owns neither a quantity nor a material — only its own ink and minutes.
  const isBack = Boolean(frontSide)
  const material = isBack ? undefined : materials.find((m) => m.id === item.material_id)
  // Quantity and nesting are inherited for a back side, so the run count has to
  // be read off the same resolved values the pricing uses — not off this row's
  // own stale fields.
  const effectiveQty = (isBack ? frontSide?.quantity : item.quantity) || 0
  const effectivePiecesPerRun = (isBack ? frontSide?.pieces_per_run : item.pieces_per_run) || 0
  const runs = itemRuns({ ...item, quantity: effectiveQty, pieces_per_run: effectivePiecesPerRun })

  const patchInk = (colorKey: string, patch: Partial<UvInkUsage>) => {
    const existing = item.ink.find((u) => u.color_key === colorKey)
    const next = existing
      ? item.ink.map((u) => (u.color_key === colorKey ? { ...u, ...patch } : u))
      : [...item.ink, { color_key: colorKey, ml_per_run: 0, use_refill: false, ...patch }]
    onPatch({ ink: next })
  }

  return (
    <Card className="p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <Label htmlFor={`uv-item-name-${index}`}>Item</Label>
          <Input
            id={`uv-item-name-${index}`}
            // A back side is the same product, so it carries the front item's
            // name; every printed surface adds its own "(back side)" marker.
            value={isBack ? frontSide?.rawName ?? "" : item.name}
            placeholder="Item name"
            className="bg-card"
            disabled={isBack}
            onChange={(e) => onPatch({ name: e.target.value })}
          />
          {isBack && <p className="mt-1 text-xs text-muted-foreground">Back side — named after the front item</p>}
        </div>
        <div className="flex gap-1 pt-6 shrink-0">
          <Button size="icon" variant="ghost" aria-label="Duplicate item" onClick={onDuplicate}>
            <Copy className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Remove item" onClick={onRemove}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {frontSideOptions.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>This item is</Label>
            <Select
              value={item.back_of_item_id || FRONT_SIDE}
              onValueChange={(v) =>
                onPatch(
                  v === FRONT_SIDE
                    ? { back_of_item_id: null }
                    : // Clear the substrate: the front item already pays for it.
                      { back_of_item_id: v, material_id: "", usage: 0, usage_width_cm: null, usage_height_cm: null },
                )
              }
            >
              <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={FRONT_SIDE}>Its own piece</SelectItem>
                {frontSideOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>Back side of {o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor={`uv-qty-${index}`}>Quantity (pieces)</Label>
          <Input
            id={`uv-qty-${index}`} type="number" min="1" step="1" className="bg-card"
            // A back side shows the inherited count, which is what it is
            // actually priced on — its own stored quantity is ignored.
            value={effectiveQty || ""}
            disabled={isBack}
            onChange={(e) => onPatch({ quantity: Number.parseInt(e.target.value, 10) || 0 })}
          />
          {isBack && (
            <p className="mt-1 text-xs text-muted-foreground">
              Same pieces as {frontSide?.name || "the front side"}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor={`uv-ppr-${index}`}>Pieces per run</Label>
          <Input
            id={`uv-ppr-${index}`} type="number" min="1" step="1" className="bg-card"
            value={effectivePiecesPerRun || ""}
            disabled={isBack}
            onChange={(e) => onPatch({ pieces_per_run: Number.parseInt(e.target.value, 10) || 0 })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {runs} run{runs === 1 ? "" : "s"}
          </p>
        </div>
        <div>
          <Label>Machine</Label>
          <Select value={item.machine_id || undefined} onValueChange={(v) => onPatch({ machine_id: v })}>
            <SelectTrigger className="bg-card"><SelectValue placeholder="Machine" /></SelectTrigger>
            <SelectContent>
              {machines.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!item.machine_id && (
            <p className="mt-1 text-[11px] text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />Pick a machine — this row counts as {money(0)}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor={`uv-minutes-${index}`}>Minutes per run</Label>
          <DecimalInput
            id={`uv-minutes-${index}`} min="0" step="0.1" className="bg-card"
            value={item.minutes_per_run}
            onValueChange={(minutes_per_run) => onPatch({ minutes_per_run })}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {isBack ? (
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Material comes from {frontSide?.name || "the front side"} — a second pass over the same pieces adds ink and
            machine time, not another substrate.
          </p>
        ) : (
        <div>
          <Label>Material</Label>
          <Select
            value={item.material_id || NO_MATERIAL}
            onValueChange={(v) =>
              onPatch({
                material_id: v === NO_MATERIAL ? "" : v,
                usage: 0,
                usage_width_cm: null,
                usage_height_cm: null,
              })
            }
          >
            <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_MATERIAL}>None / customer supplied</SelectItem>
              {materials.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} — {m.price?.toFixed(2)} {pricingUnitLabel(m.pricing_unit, currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        )}
        {material && (
          <div>
            <Label>Material per piece</Label>
            <div className="mt-2">
              <UsageCell item={item} material={material} onPatch={onPatch} />
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ink per run</p>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          ml and minutes are per run, straight from the RIP report. Tick <span className="font-medium">Refill</span> when
          the cheaper third-party ink is loaded — the client is still billed at the OEM price.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {inks.map((ink) => {
            const usage = item.ink.find((u) => u.color_key === ink.color_key)
            return (
              <div key={ink.id} className="flex items-center gap-2 rounded-lg border border-border/60 p-2">
                <span
                  className="size-5 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: ink.hex }}
                  aria-hidden
                />
                <span className="text-sm text-muted-foreground w-20 shrink-0 truncate" title={ink.name}>
                  {ink.name}
                </span>
                <DecimalInput
                  min="0" step="0.01" className="w-20 bg-card"
                  aria-label={`${ink.name} ml per run`}
                  value={usage?.ml_per_run}
                  onValueChange={(ml) => patchInk(ink.color_key, { ml_per_run: ml })}
                />
                <span className="text-xs text-muted-foreground">ml</span>
                <div className="flex items-center gap-1 ml-auto">
                  <Checkbox
                    id={`uv-refill-${index}-${ink.color_key}`}
                    checked={Boolean(usage?.use_refill)}
                    onCheckedChange={(c) => patchInk(ink.color_key, { use_refill: c as boolean })}
                  />
                  <Label htmlFor={`uv-refill-${index}-${ink.color_key}`} className="text-xs cursor-pointer">
                    Refill
                  </Label>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">
          cost {money(line?.costPerPiece ?? 0)} / piece → sell {money(line?.sellPerPiece ?? 0)} / piece
          {line && line.discountPct > 0 && <span className="ml-1 text-primary">−{line.discountPct}%</span>}
        </span>
        <span className="tabular-nums font-medium">{money(line?.lineSell ?? 0)}</span>
      </div>
    </Card>
  )
}
