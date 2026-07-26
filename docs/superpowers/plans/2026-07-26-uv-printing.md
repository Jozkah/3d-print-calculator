# UV Printing Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third calculator — UV Printing — with per-colour ink costing (OEM vs refill, billed at OEM), run-aware quantities, and scoped work operations.

**Architecture:** Pure pricing math in `lib/uv-pricing.ts` (vitest-tested, no React, no storage), consumed by `components/uv-calculator.tsx` and its two sub-components. Storage is the existing localStorage layer (`lib/local-db.ts`) — two new tables (`uv_inks`, `uv_materials`), one new `machine_type` value, one new `global_settings` field. Quotes persist denormalized `uv_items` + `uv_operations` under `quote_type_mode: "uv"`, so history and documents render without the catalogues.

**Tech Stack:** Next.js App Router (client components), TypeScript, Tailwind + shadcn/ui, vitest, localStorage data layer masquerading as a Supabase client (`@/lib/supabase/client` re-exports `createClient` from `lib/local-db.ts`).

**Spec:** `docs/superpowers/specs/2026-07-26-uv-printing-design.md`

## Global Constraints

- Currency symbol comes from `globalSettings.currency_symbol`, default `"€"`; format money with `formatMoney` from `lib/format.ts`. Never hardcode a currency.
- Every external number passes a finite-and-positive guard before use; bad input costs 0, never `NaN`.
- A missing machine / material / ink row contributes 0 rather than throwing — matches laser behaviour for deleted catalogue rows.
- The client is **always** billed at OEM ink price. `use_refill` affects internal cost only. `inkSaving`, `actualBaseCost` and `actualProfit` must never reach `components/quotation-document.tsx` or `app/quote/[id]/detailed/page.tsx`.
- Files stay under 800 lines; extract when approaching it.
- No `console.log` in new code (`console.error` in a catch matches existing practice and is fine).
- Run tests with `pnpm test` (vitest, `vitest.config.ts` already present).
- Commit after each task with a conventional-commit message.

## File Structure

**Create:**
- `lib/uv-pricing.ts` — all UV pricing math. Pure.
- `lib/uv-pricing.test.ts` — vitest coverage of the above.
- `lib/quote-modes.ts` — shared calculator-mode resolution (removes an existing 3-way copy-paste).
- `components/uv-inks-list.tsx` — six-row ink catalogue editor + "Fill from kit" helper.
- `components/uv-materials-list.tsx` — substrate catalogue CRUD.
- `components/uv-item-card.tsx` — one UV item (quantity, runs, machine, material, six ink rows).
- `components/uv-operations-table.tsx` — scoped operations list.
- `components/uv-calculator.tsx` — assembly: order details, items, operations, packaging, pricing, summary, save.
- `app/settings/uv-inks/page.tsx`, `app/settings/uv-materials/page.tsx` — loaders for the two lists.

**Modify:**
- `types/db.ts` — `UvInk`, `UvMaterial`, `uv_min_job_price`, `Tables` entries.
- `lib/local-db.ts` — seed `uv_inks`.
- `components/printers-list.tsx` — `uv-printer` machine type.
- `components/global-settings-form.tsx` — UV minimum job price field.
- `app/settings/page.tsx` — two new section cards.
- `app/business/page.tsx`, `app/personal/page.tsx` — third toggle, UV data load, `resolveCalcType`.
- `components/quote-history.tsx` — UV badge, item count, name search, template save.
- `components/quotation-document.tsx`, `app/quote/[id]/detailed/page.tsx` — UV line rendering.

---

### Task 1: Pure pricing module

**Files:**
- Create: `lib/uv-pricing.ts`
- Test: `lib/uv-pricing.test.ts`

**Interfaces:**
- Consumes: `machineCostPerHour`, `discountPctForQty`, `QtyDiscountTier`, `LaserMachineLike`, `LaserMaterialLike` from `lib/laser-pricing.ts`.
- Produces: `UV_COLOR_KEYS`, `UV_INK_SEED`, `UV_DEFAULTS`, `UvColorKey`, `UvInkLike`, `UvInkUsage`, `UvItem`, `UvOperation`, `UvOperationScope`, `UvQuoteInput`, `UvQuoteBreakdown`, `UvItemBreakdown`, `UvOperationBreakdown`, `inkOemPerMl`, `inkRefillPerMl`, `itemQty`, `itemPiecesPerRun`, `itemRuns`, `itemInkCost`, `itemMachineCost`, `itemMaterialCost`, `operationUnitCost`, `operationOccurrences`, `computeUvQuote`.

- [ ] **Step 1: Write the failing test**

Create `lib/uv-pricing.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  UV_COLOR_KEYS,
  UV_INK_SEED,
  inkOemPerMl,
  inkRefillPerMl,
  itemRuns,
  itemPiecesPerRun,
  itemInkCost,
  operationOccurrences,
  operationUnitCost,
  computeUvQuote,
  type UvInkLike,
  type UvItem,
  type UvOperation,
  type UvQuoteInput,
} from "./uv-pricing"
import type { LaserMachineLike, LaserMaterialLike } from "./laser-pricing"

// The real kit: €174.99 for 380ml cleaner + 100ml of each of six colours.
// Cleaner is excluded from the denominator so its cost rides on printed ml.
const KIT_PRICE = 174.99
const kitInk = (over: Partial<UvInkLike> = {}): UvInkLike => ({
  color_key: "cyan",
  oem_price: KIT_PRICE / 6,
  oem_volume_ml: 100,
  refill_price: 25,
  refill_volume_ml: 200,
  ...over,
})

const inkMap = (inks: UvInkLike[]) => new Map(inks.map((i) => [i.color_key, i]))
const allKitInks = () => inkMap(UV_COLOR_KEYS.map((k) => kitInk({ color_key: k })))

const machine = (over: Partial<LaserMachineLike> = {}): LaserMachineLike => ({
  id: "uv1",
  name: "UV printer",
  machine_type: "uv-printer",
  printer_cost: 3000,
  additional_upfront_cost: 0,
  estimated_annual_maintenance: 200,
  estimated_life_years: 5,
  estimated_printer_uptime_percent: 0.5,
  average_power_consumption_watts: 300,
  ...over,
})

const blank: LaserMaterialLike = { id: "mat1", name: "Acrylic blank", pricing_unit: "piece", price: 2 }

const item = (over: Partial<UvItem> = {}): UvItem => ({
  id: "i1",
  name: "Coaster",
  quantity: 1,
  pieces_per_run: 1,
  machine_id: "uv1",
  minutes_per_run: 0,
  material_id: "mat1",
  usage: 1,
  ink: [],
  ...over,
})

const input = (over: Partial<UvQuoteInput> = {}): UvQuoteInput => ({
  items: [],
  operations: [],
  inksByKey: allKitInks(),
  materialsById: new Map([[blank.id, blank]]),
  machinesById: new Map([[machine().id, machine()]]),
  electricityCostPerKwh: 0.2,
  materialEfficiencyFactor: 1,
  laborHourlyRate: 12,
  packagingCost: 0,
  fuelCost: 0,
  setupFee: 0,
  marginPct: 50,
  qtyDiscountTiers: [],
  applyDiscountsAndMinimum: true,
  uvMinJobPrice: 0,
  emergencyFee: 0,
  vatRate: 0,
  ...over,
})

describe("ink pricing", () => {
  it("derives €/ml from the kit with cleaner folded in", () => {
    expect(inkOemPerMl(kitInk())).toBeCloseTo(KIT_PRICE / 600, 6)
  })

  it("falls back to the OEM price when no refill is recorded", () => {
    const ink = kitInk({ refill_price: null, refill_volume_ml: null })
    expect(inkRefillPerMl(ink)).toBeCloseTo(inkOemPerMl(ink), 6)
  })

  it("prices a refill from its own bottle price", () => {
    expect(inkRefillPerMl(kitInk())).toBeCloseTo(0.125, 6)
  })

  it("treats a zero volume as free rather than Infinity", () => {
    expect(inkOemPerMl(kitInk({ oem_volume_ml: 0 }))).toBe(0)
  })

  it("seeds six colours", () => {
    expect(UV_INK_SEED).toHaveLength(6)
    expect(UV_INK_SEED.map((i) => i.color_key)).toEqual([...UV_COLOR_KEYS])
  })
})

describe("runs", () => {
  it("rounds runs up and clamps pieces-per-run to at least one", () => {
    expect(itemRuns(item({ quantity: 50, pieces_per_run: 12 }))).toBe(5)
    expect(itemPiecesPerRun(item({ pieces_per_run: 0 }))).toBe(1)
    expect(itemRuns(item({ quantity: 0, pieces_per_run: 12 }))).toBe(0)
  })
})

describe("ink cost per item", () => {
  const nested = item({
    quantity: 50,
    pieces_per_run: 12,
    ink: [{ color_key: "white", ml_per_run: 12, use_refill: true }],
  })

  it("bills OEM ml pro-rata across pieces, not runs", () => {
    // 12ml per run / 12 pieces = 1ml per piece × 50 pieces × OEM €/ml
    expect(itemInkCost(nested, allKitInks(), "billed")).toBeCloseTo(50 * (KIT_PRICE / 600), 6)
  })

  it("costs the refill price when the refill box is ticked", () => {
    expect(itemInkCost(nested, allKitInks(), "actual")).toBeCloseTo(50 * 0.125, 6)
  })

  it("costs OEM when the box is unticked", () => {
    const oem = item({ ...nested, ink: [{ color_key: "white", ml_per_run: 12, use_refill: false }] })
    expect(itemInkCost(oem, allKitInks(), "actual")).toBeCloseTo(itemInkCost(oem, allKitInks(), "billed"), 6)
  })

  it("ignores ink rows with no matching catalogue entry", () => {
    const orphan = item({ quantity: 1, ink: [{ color_key: "neon", ml_per_run: 5, use_refill: false }] })
    expect(itemInkCost(orphan, allKitInks(), "billed")).toBe(0)
  })
})

describe("operations", () => {
  const items = [item({ id: "a", quantity: 50, pieces_per_run: 12 }), item({ id: "b", quantity: 3 })]

  const op = (over: Partial<UvOperation> = {}): UvOperation => ({
    id: "o1",
    name: "Step",
    kind: "labour",
    minutes: 30,
    amount: 0,
    scope: "quote",
    item_id: null,
    ...over,
  })

  it("charges labour minutes at the hourly rate", () => {
    expect(operationUnitCost(op(), 12)).toBeCloseTo(6, 6)
  })

  it("charges a fixed cost row at its amount", () => {
    expect(operationUnitCost(op({ kind: "cost", amount: 1.5 }), 12)).toBe(1.5)
  })

  it("counts a quote-scoped operation once", () => {
    expect(operationOccurrences(op(), items)).toBe(1)
  })

  it("counts per-run occurrences across every item when unattached", () => {
    expect(operationOccurrences(op({ scope: "run" }), items)).toBe(5 + 3)
  })

  it("counts per-piece occurrences for one attached item", () => {
    expect(operationOccurrences(op({ scope: "piece", item_id: "a" }), items)).toBe(50)
  })

  it("counts nothing for an operation attached to a deleted item", () => {
    expect(operationOccurrences(op({ scope: "piece", item_id: "gone" }), items)).toBe(0)
  })
})

describe("computeUvQuote", () => {
  it("keeps the client price identical whether or not refill ink is used", () => {
    const withRefill = item({ quantity: 10, ink: [{ color_key: "cyan", ml_per_run: 2, use_refill: true }] })
    const withOem = item({ ...withRefill, ink: [{ color_key: "cyan", ml_per_run: 2, use_refill: false }] })

    const a = computeUvQuote(input({ items: [withRefill] }))
    const b = computeUvQuote(input({ items: [withOem] }))

    expect(a.total).toBeCloseTo(b.total, 6)
    expect(a.items[0].lineSell).toBeCloseTo(b.items[0].lineSell, 6)
    expect(a.inkCostBilled).toBeCloseTo(b.inkCostBilled, 6)
    expect(a.inkCostActual).toBeLessThan(b.inkCostActual)
    expect(a.inkSaving).toBeCloseTo(a.inkCostBilled - a.inkCostActual, 6)
    expect(a.actualProfit).toBeGreaterThan(b.actualProfit)
  })

  it("bills 50 pieces of ink and 5 runs of per-run work for a 50/12 job", () => {
    const it50 = item({
      quantity: 50,
      pieces_per_run: 12,
      minutes_per_run: 24,
      usage: 0,
      material_id: "",
      ink: [{ color_key: "cyan", ml_per_run: 12, use_refill: false }],
    })
    const jigLoad: UvOperation = {
      id: "o1", name: "Jig load", kind: "labour", minutes: 6, amount: 0, scope: "run", item_id: null,
    }
    const b = computeUvQuote(input({ items: [it50], operations: [jigLoad], marginPct: 0 }))

    expect(b.inkCostBilled).toBeCloseTo(50 * (KIT_PRICE / 600), 6)
    // 6 min at €12/h = €1.20 per run × 5 runs
    expect(b.operationsCost).toBeCloseTo(6, 6)
    expect(b.operations[0].occurrences).toBe(5)
  })

  it("puts quote-scoped operations in overhead and item-scoped ones in the line", () => {
    const one = item({ id: "a", quantity: 2, usage: 0, material_id: "" })
    const filePrep: UvOperation = {
      id: "o1", name: "File prep", kind: "labour", minutes: 60, amount: 0, scope: "quote", item_id: null,
    }
    const wipe: UvOperation = {
      id: "o2", name: "Wipe", kind: "cost", minutes: 0, amount: 0.5, scope: "piece", item_id: "a",
    }
    const b = computeUvQuote(input({ items: [one], operations: [filePrep, wipe], marginPct: 0 }))

    expect(b.overheadCost).toBeCloseTo(12, 6)
    expect(b.items[0].directCost).toBeCloseTo(1, 6)
    expect(b.baseCost).toBeCloseTo(13, 6)
  })

  it("applies margin, quantity discount, minimum job price, emergency fee and VAT", () => {
    const one = item({ quantity: 10, usage: 1, material_id: "mat1" })
    const b = computeUvQuote(
      input({
        items: [one],
        marginPct: 50,
        qtyDiscountTiers: [{ min_qty: 10, discount_pct: 10 }],
        uvMinJobPrice: 100,
        emergencyFee: 10,
        vatRate: 0.23,
      }),
    )
    expect(b.items[0].discountPct).toBe(10)
    expect(b.minPriceApplied).toBe(true)
    expect(b.sellExVat).toBeCloseTo(100, 6)
    expect(b.totalExVat).toBeCloseTo(110, 6)
    expect(b.total).toBeCloseTo(110 * 1.23, 6)
  })

  it("skips discounts and the minimum in target-price mode", () => {
    const one = item({ quantity: 10, usage: 1, material_id: "mat1" })
    const b = computeUvQuote(
      input({
        items: [one],
        qtyDiscountTiers: [{ min_qty: 10, discount_pct: 10 }],
        uvMinJobPrice: 500,
        applyDiscountsAndMinimum: false,
      }),
    )
    expect(b.items[0].discountPct).toBe(0)
    expect(b.minPriceApplied).toBe(false)
  })

  it("returns zeros, not NaN, for an empty or broken quote", () => {
    const broken = item({ quantity: 0, material_id: "missing", machine_id: "missing", minutes_per_run: 10 })
    const b = computeUvQuote(input({ items: [broken] }))
    expect(b.baseCost).toBe(0)
    expect(b.total).toBe(0)
    expect(Number.isNaN(b.total)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- uv-pricing`
Expected: FAIL — `Failed to resolve import "./uv-pricing"`.

- [ ] **Step 3: Write the implementation**

Create `lib/uv-pricing.ts`:

```ts
// Pure pricing math for the UV printing calculator. No React, no storage —
// everything here is unit-tested in lib/uv-pricing.test.ts.
//
// The one rule that shapes this whole module: the client is always billed as
// if OEM ink was used. Loading cheaper refill ink changes what the job costs
// us, never what it sells for — so every total is computed twice, once with
// each ink price, and the difference is the operator's margin.

import {
  discountPctForQty,
  machineCostPerHour,
  type LaserMachineLike,
  type LaserMaterialLike,
  type QtyDiscountTier,
} from "./laser-pricing"

export const UV_COLOR_KEYS = ["cyan", "magenta", "yellow", "black", "white", "gloss"] as const
export type UvColorKey = (typeof UV_COLOR_KEYS)[number]

/** Seed defaults for the pricing levers stored on global_settings. */
export const UV_DEFAULTS = {
  uv_min_job_price: 15,
}

/** Rows written the first time the uv_inks table is read. Prices start at 0 — the
 *  settings page's "Fill from kit" helper is how they get filled in. */
export const UV_INK_SEED: { color_key: UvColorKey; name: string; hex: string; sort_order: number }[] = [
  { color_key: "cyan", name: "Cyan", hex: "#00AEEF", sort_order: 1 },
  { color_key: "magenta", name: "Magenta", hex: "#EC008C", sort_order: 2 },
  { color_key: "yellow", name: "Yellow", hex: "#FFF200", sort_order: 3 },
  { color_key: "black", name: "Black", hex: "#231F20", sort_order: 4 },
  { color_key: "white", name: "White", hex: "#FFFFFF", sort_order: 5 },
  { color_key: "gloss", name: "Gloss / varnish", hex: "#C9D4DD", sort_order: 6 },
]

/** Finite and > 0, else 0 — every external number passes through this. */
const pos = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export interface UvInkLike {
  color_key: string
  oem_price: number
  oem_volume_ml: number
  refill_price?: number | null
  refill_volume_ml?: number | null
}

/** €/ml at the OEM price. A zero volume prices the ink at 0 rather than Infinity. */
export function inkOemPerMl(ink: UvInkLike | undefined): number {
  if (!ink) return 0
  const volume = pos(ink.oem_volume_ml)
  return volume > 0 ? pos(ink.oem_price) / volume : 0
}

/** €/ml at the third-party refill price; falls back to OEM when no refill is recorded. */
export function inkRefillPerMl(ink: UvInkLike | undefined): number {
  if (!ink) return 0
  const volume = pos(ink.refill_volume_ml)
  return volume > 0 ? pos(ink.refill_price) / volume : inkOemPerMl(ink)
}

export interface UvInkUsage {
  color_key: string
  /** ml this colour uses for ONE run, straight from the RIP report. */
  ml_per_run: number
  /** Cheaper third-party ink was loaded. Affects cost only, never the billed price. */
  use_refill: boolean
}

export interface UvItem {
  id: string
  name: string
  /** Pieces the client wants. */
  quantity: number
  /** How many copies are nested on one bed. */
  pieces_per_run: number
  machine_id: string
  /** Minutes for ONE run, straight from the RIP report. */
  minutes_per_run: number
  /** Empty string = none / customer-supplied. */
  material_id: string
  /** Material used per PIECE, in the material's native unit. */
  usage: number
  usage_width_cm?: number | null
  usage_height_cm?: number | null
  ink: UvInkUsage[]
}

export type UvOperationScope = "quote" | "run" | "piece"

export interface UvOperation {
  id: string
  name: string
  kind: "labour" | "cost"
  /** kind "labour" — charged at the shop's hourly rate. */
  minutes: number
  /** kind "cost" — fixed € per occurrence. */
  amount: number
  scope: UvOperationScope
  /** null = applies to every item in the quote. */
  item_id: string | null
}

export const itemQty = (item: UvItem): number => Math.floor(pos(item.quantity))

export const itemPiecesPerRun = (item: UvItem): number => Math.max(1, Math.floor(pos(item.pieces_per_run) || 1))

/** Runs needed for the whole item — rounded up, so a 2-piece tail is still a run. */
export const itemRuns = (item: UvItem): number => {
  const qty = itemQty(item)
  return qty > 0 ? Math.ceil(qty / itemPiecesPerRun(item)) : 0
}

/**
 * Ink cost for all pieces of one item. Per-run ml is divided by pieces-per-run
 * and multiplied by the real quantity, so a partial last run is charged for the
 * pieces it actually prints. "billed" always uses the OEM price; "actual" uses
 * whichever ink each colour was loaded with.
 */
export function itemInkCost(
  item: UvItem,
  inksByKey: ReadonlyMap<string, UvInkLike>,
  mode: "billed" | "actual",
): number {
  const perPieceFactor = itemQty(item) / itemPiecesPerRun(item)
  if (perPieceFactor <= 0) return 0
  return (item.ink ?? []).reduce((sum, usage) => {
    const ink = inksByKey.get(usage.color_key)
    if (!ink) return sum
    const perMl = mode === "actual" && usage.use_refill ? inkRefillPerMl(ink) : inkOemPerMl(ink)
    return sum + pos(usage.ml_per_run) * perPieceFactor * perMl
  }, 0)
}

/** Machine cost for all pieces of one item: per-run minutes pro-rated per piece. */
export function itemMachineCost(
  item: UvItem,
  machine: LaserMachineLike | undefined,
  electricityCostPerKwh: number,
): number {
  if (!machine) return 0
  const perPieceMinutes = pos(item.minutes_per_run) / itemPiecesPerRun(item)
  return (perPieceMinutes / 60) * machineCostPerHour(machine, electricityCostPerKwh) * itemQty(item)
}

/** Material cost for all pieces of one item: usage × unit price × qty × waste factor. */
export function itemMaterialCost(
  item: UvItem,
  material: LaserMaterialLike | undefined,
  materialEfficiencyFactor: number,
): number {
  if (!material) return 0
  const efficiency = pos(materialEfficiencyFactor) || 1
  return pos(item.usage) * pos(material.price) * itemQty(item) * efficiency
}

/** What one occurrence of an operation costs. */
export function operationUnitCost(op: UvOperation, laborHourlyRate: number): number {
  return op.kind === "cost" ? pos(op.amount) : (pos(op.minutes) / 60) * pos(laborHourlyRate)
}

/**
 * How many times an operation happens. Quote scope is once; run and piece scope
 * count over the attached item, or over every item when unattached. An operation
 * pointing at a deleted item happens zero times.
 */
export function operationOccurrences(op: UvOperation, items: UvItem[]): number {
  if (op.scope === "quote") return 1
  const targets = op.item_id ? items.filter((it) => it.id === op.item_id) : items
  return targets.reduce((sum, it) => sum + (op.scope === "run" ? itemRuns(it) : itemQty(it)), 0)
}

export interface UvQuoteInput {
  items: UvItem[]
  operations: UvOperation[]
  inksByKey: ReadonlyMap<string, UvInkLike>
  materialsById: ReadonlyMap<string, LaserMaterialLike>
  machinesById: ReadonlyMap<string, LaserMachineLike>
  electricityCostPerKwh: number
  materialEfficiencyFactor: number
  laborHourlyRate: number
  packagingCost: number
  fuelCost: number
  setupFee: number
  marginPct: number
  qtyDiscountTiers: QtyDiscountTier[]
  /** false in target-price mode — the operator sets the exact total. */
  applyDiscountsAndMinimum: boolean
  uvMinJobPrice: number
  emergencyFee: number
  /** 0 when VAT is not charged. */
  vatRate: number
}

export interface UvItemBreakdown {
  id: string
  runs: number
  inkBilled: number
  inkActual: number
  materialCost: number
  machineCost: number
  operationsCost: number
  /** Billed direct cost — material + machine + OEM ink + attached operations. */
  directCost: number
  costPerPiece: number
  discountPct: number
  sellPerPiece: number
  lineSell: number
}

export interface UvOperationBreakdown {
  id: string
  occurrences: number
  unitCost: number
  total: number
}

export interface UvQuoteBreakdown {
  materialCost: number
  machineCost: number
  inkCostBilled: number
  inkCostActual: number
  /** Billed − actual: the extra margin refill ink earns. Internal only. */
  inkSaving: number
  operationsCost: number
  /** Quote-scoped operations + packaging + fuel — allocated into lines by cost share. */
  overheadCost: number
  setupFee: number
  setupFeeSell: number
  baseCost: number
  /** Base cost with the ink actually loaded. Internal only. */
  actualBaseCost: number
  /** sellExVat − actualBaseCost. Internal only. */
  actualProfit: number
  marginPct: number
  sellBeforeMinimum: number
  discountAmount: number
  minJobPrice: number
  minPriceApplied: boolean
  minPriceAdjustment: number
  sellExVat: number
  totalExVat: number
  vatAmount: number
  total: number
  items: UvItemBreakdown[]
  operations: UvOperationBreakdown[]
}

export function computeUvQuote(input: UvQuoteInput): UvQuoteBreakdown {
  const marginPct = Math.min(95, pos(input.marginPct))
  const multiplier = 1 / (1 - marginPct / 100)

  // Operations first: item-scoped rows join their item's direct cost, quote-scoped
  // rows join the overhead pot.
  const opsByItem = new Map<string, number>()
  let quoteScopeOpsCost = 0
  const operations: UvOperationBreakdown[] = (input.operations ?? []).map((op) => {
    const unitCost = operationUnitCost(op, input.laborHourlyRate)
    const occurrences = operationOccurrences(op, input.items)
    if (op.scope === "quote") {
      quoteScopeOpsCost += unitCost * occurrences
    } else {
      const targets = op.item_id ? input.items.filter((it) => it.id === op.item_id) : input.items
      for (const it of targets) {
        const times = op.scope === "run" ? itemRuns(it) : itemQty(it)
        opsByItem.set(it.id, (opsByItem.get(it.id) ?? 0) + unitCost * times)
      }
    }
    return { id: op.id, occurrences, unitCost, total: unitCost * occurrences }
  })

  const directs = input.items.map((it) => {
    const material = itemMaterialCost(it, input.materialsById.get(it.material_id), input.materialEfficiencyFactor)
    const machine = itemMachineCost(it, input.machinesById.get(it.machine_id), input.electricityCostPerKwh)
    const inkBilled = itemInkCost(it, input.inksByKey, "billed")
    const inkActual = itemInkCost(it, input.inksByKey, "actual")
    const ops = opsByItem.get(it.id) ?? 0
    return { it, material, machine, inkBilled, inkActual, ops }
  })

  const materialCost = directs.reduce((s, d) => s + d.material, 0)
  const machineCost = directs.reduce((s, d) => s + d.machine, 0)
  const inkCostBilled = directs.reduce((s, d) => s + d.inkBilled, 0)
  const inkCostActual = directs.reduce((s, d) => s + d.inkActual, 0)
  const itemOpsCost = directs.reduce((s, d) => s + d.ops, 0)

  const directTotal = materialCost + machineCost + inkCostBilled + itemOpsCost
  const overheadCost = quoteScopeOpsCost + pos(input.packagingCost) + pos(input.fuelCost)
  const setupFee = pos(input.setupFee)
  const baseCost = directTotal + overheadCost + setupFee
  const actualBaseCost = baseCost - inkCostBilled + inkCostActual
  const setupFeeSell = setupFee * multiplier

  const items: UvItemBreakdown[] = directs.map(({ it, material, machine, inkBilled, inkActual, ops }) => {
    const direct = material + machine + inkBilled + ops
    // Shares come from BILLED cost so a refill checkbox never moves a line price.
    const share = directTotal > 0 ? direct / directTotal : input.items.length > 0 ? 1 / input.items.length : 0
    const allocated = direct + overheadCost * share
    const qty = itemQty(it)
    const discountPct = input.applyDiscountsAndMinimum ? discountPctForQty(qty, input.qtyDiscountTiers) : 0
    const lineSell = allocated * multiplier * (1 - discountPct / 100)
    return {
      id: it.id,
      runs: itemRuns(it),
      inkBilled,
      inkActual,
      materialCost: material,
      machineCost: machine,
      operationsCost: ops,
      directCost: direct,
      costPerPiece: qty > 0 ? allocated / qty : 0,
      discountPct,
      sellPerPiece: qty > 0 ? lineSell / qty : 0,
      lineSell,
    }
  })

  const itemsSell = items.reduce((s, i) => s + i.lineSell, 0)
  // With no items there are no lines to carry the overhead — sell it directly.
  const overheadSell = input.items.length === 0 ? overheadCost * multiplier : 0
  const sellBeforeMinimum = itemsSell + overheadSell + setupFeeSell
  const discountAmount = items.reduce(
    (s, i) => s + (i.discountPct > 0 ? i.lineSell / (1 - i.discountPct / 100) - i.lineSell : 0),
    0,
  )

  const minJobPrice = input.applyDiscountsAndMinimum ? pos(input.uvMinJobPrice) : 0
  const minPriceApplied = baseCost > 0 && sellBeforeMinimum < minJobPrice
  const sellExVat = minPriceApplied ? minJobPrice : sellBeforeMinimum
  const minPriceAdjustment = minPriceApplied ? minJobPrice - sellBeforeMinimum : 0

  const totalExVat = sellExVat + pos(input.emergencyFee)
  const vatAmount = totalExVat * pos(input.vatRate)

  return {
    materialCost,
    machineCost,
    inkCostBilled,
    inkCostActual,
    inkSaving: inkCostBilled - inkCostActual,
    operationsCost: quoteScopeOpsCost + itemOpsCost,
    overheadCost,
    setupFee,
    setupFeeSell,
    baseCost,
    actualBaseCost,
    actualProfit: sellExVat - actualBaseCost,
    marginPct,
    sellBeforeMinimum,
    discountAmount,
    minJobPrice,
    minPriceApplied,
    minPriceAdjustment,
    sellExVat,
    totalExVat,
    vatAmount,
    total: totalExVat + vatAmount,
    items,
    operations,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- uv-pricing`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/uv-pricing.ts lib/uv-pricing.test.ts
git commit -m "feat: UV printing pricing math with billed-vs-actual ink cost"
```

---

### Task 2: Data layer — types, tables, seed

**Files:**
- Modify: `types/db.ts`
- Modify: `lib/local-db.ts:41-68` (the `SEED` map)

**Interfaces:**
- Consumes: `UV_INK_SEED`, `UV_DEFAULTS` from `lib/uv-pricing.ts` (Task 1).
- Produces: `UvInk`, `UvMaterial` row types; `uv_inks` and `uv_materials` entries on `Tables`; `uv_min_job_price` on `GlobalSettings`. After this task `createClient().from("uv_inks").select()` returns six typed rows.

- [ ] **Step 1: Add the row types**

In `types/db.ts`, after the `LaserMaterial` type:

```ts
/** One ink channel. Two prices: the OEM bottle we bill at, and the cheaper
 *  third-party refill we sometimes actually load. */
export type UvInk = {
  id: string
  color_key: "cyan" | "magenta" | "yellow" | "black" | "white" | "gloss"
  name: string
  hex: string
  // Kit price ÷ colours, and ml that price buys. The cleaner in the kit is
  // deliberately outside this volume, which folds its cost into printed ml.
  oem_price: number
  oem_volume_ml: number
  // Third-party refill. null = none recorded; €/ml then falls back to OEM.
  refill_price?: number | null
  refill_volume_ml?: number | null
  sort_order: number
  created_at: string
  updated_at?: string
  [key: string]: any
}

/** Substrate for UV printing — blanks, sheet stock, customer-supplied items.
 *  Deliberately a separate catalogue from laser_materials. */
export type UvMaterial = {
  id: string
  name: string
  color?: string | null
  pricing_unit: "sheet" | "area" | "length" | "piece"
  price: number
  sheet_width_cm?: number | null
  sheet_height_cm?: number | null
  stock_qty?: number | null
  notes?: string | null
  created_at: string
  updated_at?: string
  [key: string]: any
}
```

In the same file, add to `GlobalSettings` next to the laser levers:

```ts
  // UV printing minimum job price. Absent on legacy rows; read sites fall back
  // to UV_DEFAULTS from lib/uv-pricing.
  uv_min_job_price?: number
```

And register both tables on `Tables`:

```ts
  uv_inks: UvInk
  uv_materials: UvMaterial
```

- [ ] **Step 2: Seed the ink table**

In `lib/local-db.ts`, extend the import from `lib/uv-pricing` and add a `uv_inks` seed entry to `SEED`:

```ts
import { UV_INK_SEED } from "@/lib/uv-pricing"
```

```ts
  // Six ink channels, priced at 0 until the operator runs "Fill from kit" on
  // /settings/uv-inks. A 0 price is visibly wrong on that page, which is safer
  // than guessing a kit price on their behalf.
  uv_inks: () =>
    UV_INK_SEED.map((ink) => ({
      id: uuid(),
      ...ink,
      oem_price: 0,
      oem_volume_ml: 0,
      refill_price: null,
      refill_volume_ml: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
```

`uv_materials` needs no seed — an empty table is the correct starting state.

- [ ] **Step 3: Verify types compile**

Run: `pnpm exec tsc --noEmit`
Expected: no errors from `types/db.ts` or `lib/local-db.ts`.

- [ ] **Step 4: Commit**

```bash
git add types/db.ts lib/local-db.ts
git commit -m "feat: uv_inks and uv_materials tables with seeded ink channels"
```

---

### Task 3: Ink catalogue settings screen

**Files:**
- Create: `components/uv-inks-list.tsx`
- Create: `app/settings/uv-inks/page.tsx`

**Interfaces:**
- Consumes: `UvInk` from `types/db.ts`; `inkOemPerMl`, `inkRefillPerMl`, `UV_COLOR_KEYS` from `lib/uv-pricing.ts`.
- Produces: `UvInksList({ inks }: { inks: UvInk[] })`.

- [ ] **Step 1: Build the list component**

Create `components/uv-inks-list.tsx`. Follow `components/laser-materials-list.tsx` for structure (Card per row, toast on write, `createClient()` per handler). Requirements:

- Renders one row per ink, ordered by `sort_order`, each with a colour swatch (`style={{ backgroundColor: ink.hex }}`), name, and four number inputs: OEM price, OEM ml, refill price, refill ml.
- Each row shows its derived prices: `€X.XXXX/ml OEM · €Y.YYYY/ml refill`, using `inkOemPerMl` / `inkRefillPerMl` to 4 decimals.
- A row whose `oem_volume_ml` is 0 shows an amber inline warning: `Set a volume — this ink is currently priced at €0/ml.`
- Edits save on blur via `supabase.from("uv_inks").update({...}).eq("id", ink.id)`, writing `updated_at`.
- A "Fill from kit" card at the top with three inputs (kit price, number of colours, ml per colour — defaults 174.99 / 6 / 100) and a live preview line `→ €0.2917/ml`. Its button updates **every** ink row with `oem_price = kitPrice / colours`, `oem_volume_ml = mlPerColour`, then toasts `Kit price applied to all inks`.

Key excerpt — the helper's write:

```tsx
const applyKit = async () => {
  const price = Number.parseFloat(kitPrice) || 0
  const colours = Number.parseInt(kitColours, 10) || 0
  const ml = Number.parseFloat(kitMl) || 0
  if (price <= 0 || colours <= 0 || ml <= 0) {
    toast({ title: "Check the kit figures", description: "Price, colours and ml must all be above zero.", variant: "destructive" })
    return
  }
  const supabase = createClient()
  const perColour = price / colours
  for (const ink of inks) {
    const { error } = await supabase
      .from("uv_inks")
      .update({ oem_price: perColour, oem_volume_ml: ml, updated_at: new Date().toISOString() })
      .eq("id", ink.id)
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
      return
    }
  }
  toast({ title: "Kit price applied to all inks", description: `${formatMoney(price / (colours * ml), "€")}/ml` })
}
```

Explanatory copy under the helper (verbatim):

> Cleaner volume is deliberately left out — dividing the whole kit price by the printing ml only is what recovers the cleaner's cost through the ink you actually sell.

- [ ] **Step 2: Build the page**

Create `app/settings/uv-inks/page.tsx`, copying `app/settings/materials/page.tsx` exactly but reading `uv_inks` ordered by `sort_order` ascending, titled **UV Inks**, described `Per-colour OEM and refill prices — quotes always bill at the OEM price`.

- [ ] **Step 3: Verify in the app**

Run: `pnpm dev`, open `/settings/uv-inks`.
Expected: six colour rows with €0/ml warnings; entering 174.99 / 6 / 100 in the kit helper and clicking apply sets every row to `€0.2917/ml OEM`.

- [ ] **Step 4: Commit**

```bash
git add components/uv-inks-list.tsx app/settings/uv-inks/page.tsx
git commit -m "feat: UV ink catalogue settings screen with fill-from-kit helper"
```

---

### Task 4: Substrate catalogue settings screen

**Files:**
- Create: `components/uv-materials-list.tsx`
- Create: `app/settings/uv-materials/page.tsx`
- Modify: `app/settings/page.tsx:6-37` (the `SECTIONS` array)

**Interfaces:**
- Consumes: `UvMaterial` from `types/db.ts`; `pricingUnitLabel`, `usageUnitLabel`, `LaserPricingUnit` from `lib/laser-pricing.ts`.
- Produces: `UvMaterialsList({ materials }: { materials: UvMaterial[] })`.

- [ ] **Step 1: Build the list component**

Create `components/uv-materials-list.tsx` as a copy of `components/laser-materials-list.tsx` with these differences only: it writes to the `uv_materials` table, its heading is `UV Materials`, its add button says `Add Material`, the name placeholder is `Acrylic blank 90×90`, and the empty state reads `No UV substrates yet. Add the blanks and sheet stock you print on — each priced the way you buy it.`

- [ ] **Step 2: Build the page**

Create `app/settings/uv-materials/page.tsx` mirroring `app/settings/materials/page.tsx`, reading `uv_materials` ordered by `created_at` ascending, titled **UV Materials**, described `Blanks and sheet stock you UV print on — priced per sheet, area, length or piece`.

- [ ] **Step 3: Link both new screens from Settings**

In `app/settings/page.tsx`, import `Droplets` from `lucide-react` and add two entries to `SECTIONS` after the laser materials entry:

```ts
  {
    href: "/settings/uv-inks",
    icon: Droplets,
    title: "UV Inks",
    description: "Per-colour OEM and refill prices. Quotes always bill at the OEM price.",
  },
  {
    href: "/settings/uv-materials",
    icon: Layers,
    title: "UV Materials",
    description: "Blanks and sheet stock you UV print on, with per-piece or per-area pricing.",
  },
```

- [ ] **Step 4: Verify in the app**

Run: `pnpm dev`, open `/settings`, click through to both new cards; add and delete a material.
Expected: both screens render, CRUD works, the list refreshes without a reload.

- [ ] **Step 5: Commit**

```bash
git add components/uv-materials-list.tsx app/settings/uv-materials/page.tsx app/settings/page.tsx
git commit -m "feat: UV materials catalogue and settings navigation"
```

---

### Task 5: Machine type and minimum job price

**Files:**
- Modify: `components/printers-list.tsx:319-327` (machine type select) and `:413-414` (fleet labels)
- Modify: `components/global-settings-form.tsx` (laser card, around `:545-565`)

**Interfaces:**
- Consumes: `UV_DEFAULTS` from `lib/uv-pricing.ts`.
- Produces: printers can carry `machine_type: "uv-printer"`; `global_settings.uv_min_job_price` is editable and persisted.

- [ ] **Step 1: Add the machine type**

In `components/printers-list.tsx`, add to the machine-type `SelectContent`:

```tsx
            <SelectItem value="uv-printer">UV Printer</SelectItem>
```

and next to the existing fleet labels:

```tsx
                    {printer.machine_type === "uv-printer" && <span className="text-xs text-muted-foreground">UV printer</span>}
```

- [ ] **Step 2: Add the minimum job price field**

In `components/global-settings-form.tsx`: import `UV_DEFAULTS` from `@/lib/uv-pricing`, add `uv_min_job_price?: number` to the local settings prop type, add state

```tsx
  const [uvMinJobPrice, setUvMinJobPrice] = useState(
    settings?.uv_min_job_price?.toString() ?? UV_DEFAULTS.uv_min_job_price.toString(),
  )
```

include `uv_min_job_price: Number.parseFloat(uvMinJobPrice) || 0,` in the saved payload, and render an input labelled `UV minimum job price (€)` inside the existing Laser & Stickers card, whose `CardTitle` becomes `Laser, Stickers & UV` and whose `CardDescription` becomes `Minimum job prices, setup fee, and quantity discounts for laser, sticker and UV quotes`.

- [ ] **Step 3: Verify in the app**

Run: `pnpm dev`, open `/settings/printers`, add a machine of type UV Printer; open `/settings/global`, set the UV minimum to 20 and save, then reload.
Expected: the machine shows "UV printer" in the fleet; the minimum persists across reload.

- [ ] **Step 4: Commit**

```bash
git add components/printers-list.tsx components/global-settings-form.tsx
git commit -m "feat: uv-printer machine type and UV minimum job price setting"
```

---

### Task 6: Shared calculator-mode resolution

**Files:**
- Create: `lib/quote-modes.ts`
- Modify: `app/business/page.tsx:16`, `:66-79`
- Modify: `app/personal/page.tsx:16`, `:66-79`
- Modify: `components/quote-history.tsx:115-119`

**Interfaces:**
- Produces: `LEGACY_LASER_MODES`, `CalcType`, `resolveCalcType`, `isLaserQuote`, `isUvQuote`. Tasks 10, 11 and 12 import from here.

- [ ] **Step 1: Write the module**

Create `lib/quote-modes.ts`:

```ts
// Which calculator a quote belongs to. Extracted because three call sites
// (business page, personal page, quote history) each had their own copy of the
// legacy-mode list, and a third calculator would have made it four.

export const LEGACY_LASER_MODES = ["laser-engraving", "laser-cutting", "stickers"]

export type CalcType = "3d-print" | "laser" | "uv" | "legacy-laser"

/** Laser/sticker quote, including rows saved before the laser rework. */
export const isLaserQuote = (quote: { quote_type_mode?: string }): boolean =>
  quote.quote_type_mode === "laser" || LEGACY_LASER_MODES.includes(quote.quote_type_mode ?? "")

export const isUvQuote = (quote: { quote_type_mode?: string }): boolean => quote.quote_type_mode === "uv"

/**
 * Editing an existing quote pins the calculator to that quote's mode; otherwise
 * the `?type=` search param picks it, defaulting to 3D print.
 */
export function resolveCalcType(args: {
  isEditing: boolean
  editingQuoteMode?: string
  typeParam?: string | null
}): CalcType {
  if (args.isEditing) {
    if (args.editingQuoteMode === "laser") return "laser"
    if (args.editingQuoteMode === "uv") return "uv"
    if (LEGACY_LASER_MODES.includes(args.editingQuoteMode ?? "")) return "legacy-laser"
    return "3d-print"
  }
  if (args.typeParam === "laser") return "laser"
  if (args.typeParam === "uv") return "uv"
  return "3d-print"
}
```

- [ ] **Step 2: Replace the copies**

In `app/business/page.tsx` and `app/personal/page.tsx`, delete the local `LEGACY_LASER_MODES` const and replace the `calcType` block with:

```tsx
  const calcType = resolveCalcType({
    isEditing: Boolean(editingQuoteId) && editingQuote != null,
    editingQuoteMode: editingQuote?.quote_type_mode as string | undefined,
    typeParam,
  })
```

In `components/quote-history.tsx`, delete the local `isLaserQuote` arrow function and import `isLaserQuote` from `@/lib/quote-modes` instead.

- [ ] **Step 3: Verify nothing regressed**

Run: `pnpm exec tsc --noEmit && pnpm test`
Then `pnpm dev`: open a saved laser quote from history for editing and confirm the laser calculator still opens; confirm `/business?type=laser` still switches tabs.
Expected: clean typecheck, tests pass, both flows unchanged.

- [ ] **Step 4: Commit**

```bash
git add lib/quote-modes.ts app/business/page.tsx app/personal/page.tsx components/quote-history.tsx
git commit -m "refactor: extract shared quote-mode resolution to lib/quote-modes"
```

---

### Task 7: UV item card

**Files:**
- Create: `components/uv-item-card.tsx`

**Interfaces:**
- Consumes: `UvItem`, `UvItemBreakdown`, `itemRuns`, `UV_COLOR_KEYS` from `lib/uv-pricing.ts`; `UvInk`, `UvMaterial`, `Printer` from `types/db.ts`; `pricingUnitLabel`, `usageUnitLabel` from `lib/laser-pricing.ts`.
- Produces:

```tsx
export function UvItemCard(props: {
  item: UvItem
  index: number
  inks: UvInk[]
  materials: UvMaterial[]
  machines: Printer[]
  line: UvItemBreakdown | undefined
  currency: string
  onPatch: (patch: Partial<UvItem>) => void
  onDuplicate: () => void
  onRemove: () => void
}): JSX.Element
```

- [ ] **Step 1: Build the card**

Create `components/uv-item-card.tsx` as a `"use client"` component rendering one `Card` per item:

- **Header row:** item name `Input`, a `Copy` icon button (`onDuplicate`) and a `Trash2` icon button (`onRemove`), both with `aria-label`s.
- **Grid row:** Quantity, Pieces per run, Machine `Select` (from `machines`), Minutes per run. Under pieces-per-run, a muted readout: `{itemRuns(item)} run(s)`.
- **Material row:** a `Select` over `materials` plus a `"None / customer supplied"` option with value `"none"` that patches `material_id: ""`. When a material is chosen, reuse the dimension-vs-plain usage entry from `components/laser-calculator.tsx`'s `UsageCell` (copy it in as a local `UsageCell`, typed to `UvItem`), labelled **Material per piece**.
- **Ink block:** one row per entry in `inks` (which arrives ordered), each with the colour swatch, the colour name, an `Input` for ml per run, and a `Checkbox` labelled `Refill`. Values come from `item.ink.find((u) => u.color_key === ink.color_key)`; patching writes the whole `ink` array back:

```tsx
const patchInk = (colorKey: string, patch: Partial<UvInkUsage>) => {
  const existing = item.ink.find((u) => u.color_key === colorKey)
  const next = existing
    ? item.ink.map((u) => (u.color_key === colorKey ? { ...u, ...patch } : u))
    : [...item.ink, { color_key: colorKey, ml_per_run: 0, use_refill: false, ...patch }]
  onPatch({ ink: next })
}
```

- **Footer:** `cost/piece → sell/piece · line total` from `line`, and when `line.discountPct > 0` a `−N%` chip.
- **Incomplete warning:** when no machine is picked, an amber line `Pick a machine — this row counts as {money(0)}`, matching the laser calculator's wording.
- A muted caption above the ink block: `ml and minutes are per run, straight from the RIP report.`

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (The component is rendered for the first time in Task 9.)

- [ ] **Step 3: Commit**

```bash
git add components/uv-item-card.tsx
git commit -m "feat: UV item card with per-run ink entry and refill toggles"
```

---

### Task 8: Operations table

**Files:**
- Create: `components/uv-operations-table.tsx`

**Interfaces:**
- Consumes: `UvOperation`, `UvOperationScope`, `UvOperationBreakdown` from `lib/uv-pricing.ts`.
- Produces:

```tsx
export function UvOperationsTable(props: {
  operations: UvOperation[]
  items: { id: string; name: string }[]
  breakdown: UvOperationBreakdown[]
  currency: string
  defaultHourlyRate: number
  onChange: (operations: UvOperation[]) => void
}): JSX.Element
```

- [ ] **Step 1: Build the table**

Create `components/uv-operations-table.tsx` as a `"use client"` component modelled on `LaborTable` in `components/quote-line-tables.tsx`. Columns: **Step**, **Type**, **Minutes / €**, **How often**, **Applies to**, **Cost**, and a remove button.

- Type is a `Select` of `Labour (minutes)` / `Fixed cost (€)`; the third column renders a minutes input or an amount input accordingly.
- How often is a `Select` of `Once per quote` (`quote`) / `Per run` (`run`) / `Per piece` (`piece`).
- Applies to is a `Select` with `All items` (value `"all"` → `item_id: null`) plus one option per item, using `item.name || "Unnamed item"` as the label. Disabled when scope is `quote`, since a once-per-quote step happens once regardless.
- Cost shows `breakdown.find((b) => b.id === op.id)` as `{occurrences} × {money(unitCost)} = {money(total)}`.
- "Add step" appends `{ id: crypto.randomUUID(), name: "", kind: "labour", minutes: 0, amount: 0, scope: "quote", item_id: null }`.
- Three quick-add buttons that append a prefilled row, so the common shape is one click: **File prep** (labour, 30 min, quote), **Jig load** (labour, 5 min, run), **Wipe / prime** (labour, 1 min, piece).
- Caption under the header: `Once-per-quote steps are shared across the whole job; per-run and per-piece steps scale with the item they're attached to.`

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/uv-operations-table.tsx
git commit -m "feat: scoped operations table for UV quotes"
```

---

### Task 9: UV calculator

**Files:**
- Create: `components/uv-calculator.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1, 7, 8; `ClientSelector`, `PackagingTable`, `formatMoney`, `useToast`.
- Produces:

```tsx
export function UvCalculator(props: {
  machines: Printer[]      // machine_type "uv-printer"
  materials: UvMaterial[]
  inks: UvInk[]
  globalSettings: GlobalSettings | null
  mode?: "business" | "personal"
  clients?: Client[]
  editingQuoteId?: string
  templateId?: string
}): JSX.Element
```

- [ ] **Step 1: Build the calculator**

Create `components/uv-calculator.tsx` following `components/laser-calculator.tsx` section by section. Differences from the laser version:

- State adds `operations: UvOperation[]`; the `LaborTable` is **replaced** by `UvOperationsTable` (labour now lives in operations). `PackagingTable` stays.
- `inksByKey = useMemo(() => new Map(inks.map((i) => [i.color_key, i])), [inks])`.
- New item factory:

```tsx
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
})
```

- `breakdown = useMemo(() => computeUvQuote({ ... }), [...])` wiring `laborHourlyRate: globalSettings?.labor_hourly_rate ?? 0`, `uvMinJobPrice: globalSettings?.uv_min_job_price ?? UV_DEFAULTS.uv_min_job_price`, `qtyDiscountTiers: globalSettings?.qty_discount_tiers ?? LASER_DEFAULTS.qty_discount_tiers`, and the rest as the laser calculator does.
- Target-price back-solve effect: copy verbatim from the laser calculator.
- Summary rows: `Materials`, `Ink (billed at OEM)` = `breakdown.inkCostBilled`, `Machine time`, `Operations` = `breakdown.operationsCost`, `Packaging`, `Fuel / delivery`, `Setup fee`, then base cost / margin / discounts / minimum / emergency / VAT / total exactly as the laser calculator renders them.
- **Internal-only block**, rendered after the totals inside a bordered `div` with the caption `Internal — not shown on the quote`:

```tsx
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
```

- Empty-state warning card: no UV machines → link `/settings/printers` (`machine type "UV Printer"`); no inks priced (`inks.every((i) => !i.oem_volume_ml)`) → link `/settings/uv-inks`. Materials are optional (customer-supplied work is normal), so their absence is not warned about.
- `buildQuoteData(isDraft)` returns the laser payload shape with these changes: `quote_type_mode: "uv"`, `laser_items: []`, and

```tsx
      uv_items: items.map((it) => {
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
      }),
      uv_operations: operations.map((op) => {
        const b = breakdown.operations.find((x) => x.id === op.id)
        return { ...op, occurrences: b?.occurrences ?? 0, unit_cost: b?.unitCost ?? 0, total: b?.total ?? 0 }
      }),
      uv_ink_cost: breakdown.inkCostBilled,
      uv_ink_cost_actual: breakdown.inkCostActual,
      labor_cost: breakdown.operationsCost,
      total_printing_cost: breakdown.materialCost,
      machine_cost: breakdown.machineCost,
```

- Edit hydration: guard `if (data.quote_type_mode !== "uv") return`, then restore `items` from `data.uv_items` (coercing every number with `Number(...) || 0`, defaulting `pieces_per_run` to 1 and `ink` to `[]`) and `operations` from `data.uv_operations`.
- Template hydration: a second effect modelled on `components/excel-calculator.tsx:359-428` — when `templateId` is set and `editingQuoteId` is not, read the `quote_templates` row and hydrate `items`, `operations`, `packaging`, `setupFee` and margin state from `template.payload`, leaving client identity blank.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/uv-calculator.tsx
git commit -m "feat: UV printing calculator"
```

---

### Task 10: Page wiring

**Files:**
- Modify: `app/business/page.tsx`
- Modify: `app/personal/page.tsx`

**Interfaces:**
- Consumes: `UvCalculator` (Task 9), `resolveCalcType` (Task 6).
- Produces: `/business?type=uv` and `/personal?type=uv` render the UV calculator with live catalogues.

- [ ] **Step 1: Load the UV data**

In both pages add state `uvMaterials` and `uvInks`, and inside `loadData`:

```tsx
      const { data: uvMaterialsData, error: uvMaterialsError } = await supabase.from("uv_materials").select("*").order("created_at", { ascending: true })
      const { data: uvInksData, error: uvInksError } = await supabase.from("uv_inks").select("*").order("sort_order", { ascending: true })
      setUvMaterials(uvMaterialsData || [])
      setUvInks(uvInksData || [])
```

Add `uvMaterialsError` and `uvInksError` to the `firstError` chain so a catalogue read failure surfaces through `PageLoadError` instead of silently rendering an empty catalogue.

- [ ] **Step 2: Add the machine filter and the third toggle**

```tsx
  const uvMachines = printers.filter((p) => p.machine_type === "uv-printer")
```

```tsx
                <Button size="sm" variant={calcType === "uv" ? "default" : "ghost"}
                  onClick={() => router.push("/business?type=uv")}>UV Printing</Button>
```

(`/personal?type=uv` on the personal page.)

- [ ] **Step 3: Render the calculator and enable templates**

```tsx
          {calcType === "uv" && (
            <UvCalculator
              mode="business"
              machines={uvMachines}
              materials={uvMaterials}
              inks={uvInks}
              globalSettings={globalSettings}
              clients={clients}
              editingQuoteId={editingQuoteId}
              templateId={templateId}
            />
          )}
```

Change the template picker's guard from `calcType === "3d-print"` to `(calcType === "3d-print" || calcType === "uv")` so UV quotes can start from a template.

- [ ] **Step 4: Verify end to end**

Run: `pnpm dev`. On `/business?type=uv`: add a UV printer machine first if needed, then create an item — quantity 50, 12 per run, 24 min/run, 12 ml cyan — and confirm the runs readout says `5 run(s)`, the summary shows a non-zero ink cost, ticking **Refill** leaves the total unchanged while raising "Extra margin from refill ink", and Save Quote succeeds.
Expected: all of the above; the quote appears in `/history`.

- [ ] **Step 5: Commit**

```bash
git add app/business/page.tsx app/personal/page.tsx
git commit -m "feat: UV Printing tab on the business and personal calculators"
```

---

### Task 11: Quote history

**Files:**
- Modify: `components/quote-history.tsx` (`:115-119` imports, `:522-525` search, `:838-846` counts, `:885-887` badge, `:954` items rendering)

**Interfaces:**
- Consumes: `isUvQuote` from `lib/quote-modes.ts`.
- Produces: UV quotes are searchable, badged, counted, editable and saveable as templates from history.

- [ ] **Step 1: Wire UV through history**

- Import `isUvQuote` alongside `isLaserQuote`.
- Search haystack: add UV item names next to the laser ones.

```tsx
      const uvNames = (quote.uv_items || []).map((it: any) => it?.name || "").join(" ")
```

and include `uvNames` in the `haystack` template string.

- Item count: extend the existing ternary so a UV quote counts `quote.uv_items?.length || 0`.
- Badge: render a `UV` badge with the same markup as the `Laser` badge when `isUvQuote(quote)`.
- Item list rendering: wherever the laser branch reads `quote.laser_items`, add a UV branch reading `quote.uv_items` with the same per-line layout (`name × quantity → line_sell`).
- Edit link: UV quotes route to the same `?edit=<id>` URL the other modes use — no change needed, but confirm the two `!isLaserQuote(quote)` guards at `:1033` and `:1123` (3D-specific detail blocks) also exclude UV by changing them to `!isLaserQuote(quote) && !isUvQuote(quote)`.

- [ ] **Step 2: Verify in the app**

Run: `pnpm dev`, open `/history` with at least one saved UV quote.
Expected: a **UV** badge, the correct item count, the item name matches a search, "Save as template" produces a template, and Edit reopens the UV calculator with every field restored.

- [ ] **Step 3: Commit**

```bash
git add components/quote-history.tsx
git commit -m "feat: UV quotes in history — badge, counts, search, templates"
```

---

### Task 12: Documents

**Files:**
- Modify: `components/quotation-document.tsx:148-149`, `:204-206`, `:328-329`
- Modify: `app/quote/[id]/detailed/page.tsx:73-77`, `:305`, `:400`

**Interfaces:**
- Consumes: `isUvQuote` from `lib/quote-modes.ts`.
- Produces: the quote/invoice document and the detailed breakdown render UV lines. No ink detail, no actual-vs-billed figures.

- [ ] **Step 1: Quotation document**

In `components/quotation-document.tsx`:

```tsx
  const isUvQuote = quote.quote_type_mode === "uv"
  const uvItems: any[] = isUvQuote ? quote.uv_items || [] : []
```

Render the UV branch with the same line markup as the laser branch — `name`, `quantity`, `sell_per_piece`, `line_sell` — and extend the closing blurb:

```tsx
              {isUvQuote
                ? "This quotation includes all costs associated with the UV printing service, including materials, ink, machine time, labor, packaging, and delivery."
                : isLaserQuote
```

- [ ] **Step 2: Detailed document**

In `app/quote/[id]/detailed/page.tsx`, add a `UvItemsSection` beside `LaserItemsSection`:

```tsx
function UvItemsSection({ quote, money }: { quote: any; money: (n: number) => string }) {
  const items: any[] = quote.uv_items || []
  if (items.length === 0) return null
  return (
    <section>
      <p className={sectionLabel}>UV Printed Items</p>
      {/* one row per item: name, quantity × runs, cost/piece, sell/piece, line total */}
    </section>
  )
}
```

Add `const isUvMode = quote.quote_type_mode === "uv"`, render `{isUvMode && <UvItemsSection quote={quote} money={money} />}` next to the laser section, and change every `!isLaserMode` guard around 3D-specific sections to `!isLaserMode && !isUvMode`.

Ink is summarised as a single cost line (`quote.uv_ink_cost`) inside the existing cost table — per-colour ml and `uv_ink_cost_actual` are never rendered.

- [ ] **Step 3: Verify in the app**

Run: `pnpm dev`, open a saved UV quote's document and detailed views, and print-preview both.
Expected: UV items listed with correct totals; no ink ml, no "actual" or "extra margin" figure anywhere on either page.

- [ ] **Step 4: Final verification**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm build`
Expected: tests pass, no type errors, production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/quotation-document.tsx "app/quote/[id]/detailed/page.tsx"
git commit -m "feat: render UV items on quote and detailed documents"
```

---

## Self-Review

**Spec coverage:** `uv_inks` → Tasks 2, 3. `uv_materials` → Tasks 2, 4. `uv-printer` machine type + `uv_min_job_price` → Task 5. Item shape, operation shape, all pricing math and the billed/actual split → Task 1. Calculator UI and its two sub-components → Tasks 7, 8, 9. Third tab and both pages → Task 10. Persistence, history, templates → Tasks 9, 10, 11. Documents and the internal-figures exclusion → Task 12. `lib/quote-modes.ts` refactor → Task 6. Error handling → Task 1 (`pos` guard, missing rows, `pieces_per_run` clamp), Task 3 (zero-volume ink warning), Task 10 (catalogue load errors). Testing → Task 1.

**Type consistency:** `UvItem`, `UvInkUsage`, `UvOperation`, `UvItemBreakdown`, `UvOperationBreakdown` and `UvQuoteBreakdown` are defined once in Task 1 and referenced by those exact names in Tasks 7–12. `itemRuns`/`itemQty`/`itemPiecesPerRun` keep their Task 1 signatures throughout. `isLaserQuote`/`isUvQuote`/`resolveCalcType` are defined in Task 6 and imported unchanged in Tasks 10–12.
