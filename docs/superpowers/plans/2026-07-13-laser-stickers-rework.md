# Laser & Stickers Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bolted-on laser/sticker modes (magic ×11 formula, filament-table hack) with a dedicated Laser & Stickers calculator backed by a real materials catalog, machine-time costing, and explicit pricing levers (margin, minimum job price, setup fee, quantity discounts).

**Architecture:** A pure pricing module (`lib/laser-pricing.ts`, fully unit-tested) feeds a new `LaserCalculator` component. Materials live in a revived `laser_materials` localStorage table (per-sheet/area/length/piece pricing) managed on a new settings page. Laser/sticker machines are `printers` rows with a new `machine_type`. The business/personal quote pages get a top-level 3D Print | Laser & Stickers toggle; `excel-calculator.tsx` loses all laser conditionals.

**Tech Stack:** Next.js 16 (App Router, all-client pages), React 19, TypeScript, Tailwind + shadcn/radix ui primitives, localStorage data layer (`lib/local-db.ts` — mimics Supabase query builder), Vitest (new, added in Task 1). Package manager: **pnpm**. Dev server: `pnpm dev` (port 4001). Build: `pnpm build`.

**Spec:** `docs/superpowers/specs/2026-07-13-laser-stickers-rework-design.md`

## Global Constraints

- Currency display uses `formatMoney(n, currencySymbol)` from `lib/format.ts`; currency symbol from `global_settings.currency_symbol ?? "€"`.
- VAT fraction from `global_settings.vat_rate ?? 0.23`; VAT applies only when `mode === "business" && vatEnabled`.
- Cost buffer factor is `1.3`, matching the 3D calculator's machine math exactly.
- Material waste factor is `global_settings.material_efficiency_factor ?? 1.1`.
- All localStorage row types keep the `[key: string]: any` index signature (project convention in `types/db.ts`).
- Data access goes through `createClient()` from `@/lib/supabase/client` (which is the localStorage shim) — never touch `window.localStorage` directly outside `lib/local-db.ts`.
- Immutable state updates only (project convention).
- New quote rows save `quote_type_mode: "laser"`. Legacy values `"laser-engraving"`, `"laser-cutting"`, `"stickers"` must remain readable everywhere but are never written again.
- No `console.log` in shipped code (`console.error` in catch blocks matches existing convention).
- Defaults: laser min job price €15, sticker min €10, setup fee €5, tiers `[{min_qty:10, discount_pct:5},{min_qty:50, discount_pct:10}]`.
- Commit messages: conventional commits (`feat:`, `fix:`, `test:`, `chore:`).

---

### Task 1: Vitest setup + pricing module core (machine cost/hour)

**Files:**
- Modify: `package.json` (devDependency + script)
- Create: `vitest.config.ts`
- Create: `lib/laser-pricing.ts`
- Test: `lib/laser-pricing.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `machineCostPerHour(machine: LaserMachineLike, electricityCostPerKwh: number): number`, `COST_BUFFER_FACTOR`, `LASER_DEFAULTS`, types `LaserPricingUnit`, `QtyDiscountTier`, `LaserMaterialLike`, `LaserMachineLike`, `LaserItem`, and labels `pricingUnitLabel()` / `usageUnitLabel()`. Later tasks import all of these from `@/lib/laser-pricing`.

- [ ] **Step 1: Install vitest and add the test script**

```bash
pnpm add -D vitest
```

Then in `package.json` scripts add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
})
```

- [ ] **Step 3: Write the failing test**

Create `lib/laser-pricing.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { machineCostPerHour, type LaserMachineLike } from "./laser-pricing"

const machine = (over: Partial<LaserMachineLike> = {}): LaserMachineLike => ({
  id: "m1",
  name: "Laser",
  machine_type: "laser",
  printer_cost: 2000,
  additional_upfront_cost: 0,
  estimated_annual_maintenance: 100,
  estimated_life_years: 5,
  estimated_printer_uptime_percent: 0.5,
  average_power_consumption_watts: 400,
  ...over,
})

describe("machineCostPerHour", () => {
  it("amortizes capital cost and adds electricity, with 1.3 buffer", () => {
    // lifetime = 2000 + 100*5 = 2500; uptime hrs/yr = 8760*0.5 = 4380
    // capital/hr = 2500 / (4380*5) = 0.11415…; electricity = 0.4kW*0.2 = 0.08
    // (0.11415… + 0.08) * 1.3 = 0.25240…
    expect(machineCostPerHour(machine(), 0.2)).toBeCloseTo(0.2524, 3)
  })

  it("guards a zero-lifetime/uptime machine to electricity-only cost", () => {
    const m = machine({ estimated_life_years: 0 })
    // capital denominator 0 → capital 0; 0.4kW*0.2*1.3 = 0.104
    expect(machineCostPerHour(m, 0.2)).toBeCloseTo(0.104, 5)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./laser-pricing`.

- [ ] **Step 5: Create `lib/laser-pricing.ts`**

```ts
// Pure pricing math for the Laser & Stickers calculator. No React, no storage —
// everything here is unit-tested in lib/laser-pricing.test.ts.

export type LaserPricingUnit = "sheet" | "area" | "length" | "piece"

export interface QtyDiscountTier {
  min_qty: number
  discount_pct: number
}

/** Seed defaults for the pricing levers stored on global_settings. */
export const LASER_DEFAULTS = {
  laser_min_job_price: 15,
  sticker_min_job_price: 10,
  default_setup_fee: 5,
  qty_discount_tiers: [
    { min_qty: 10, discount_pct: 5 },
    { min_qty: 50, discount_pct: 10 },
  ] as QtyDiscountTier[],
}

/** Same buffer the 3D calculator applies to machine capital + electricity. */
export const COST_BUFFER_FACTOR = 1.3

export interface LaserMaterialLike {
  id: string
  name: string
  pricing_unit: LaserPricingUnit
  price: number
  sheet_width_cm?: number | null
  sheet_height_cm?: number | null
}

/** Subset of the printers row the pricing math needs. */
export interface LaserMachineLike {
  id: string
  name: string
  machine_type?: string
  printer_cost: number
  additional_upfront_cost: number
  estimated_annual_maintenance: number
  estimated_life_years: number
  estimated_printer_uptime_percent: number
  average_power_consumption_watts: number
}

export interface LaserItem {
  id: string
  name: string
  quantity: number
  material_id: string
  /** Per single piece, in the material's native unit (sheets, cm², cm, pieces). */
  usage: number
  usage_width_cm?: number | null
  usage_height_cm?: number | null
  machine_id: string
  /** Minutes of machine time per single piece. */
  machine_minutes: number
}

/** Finite and ≥ 0, else 0 — every external number passes through this. */
const pos = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export const itemQty = (item: LaserItem): number => Math.floor(pos(item.quantity))

export function pricingUnitLabel(unit: LaserPricingUnit, symbol = "€"): string {
  return { sheet: `${symbol}/sheet`, area: `${symbol}/cm²`, length: `${symbol}/cm`, piece: `${symbol}/piece` }[unit]
}

export function usageUnitLabel(unit: LaserPricingUnit): string {
  return { sheet: "sheets", area: "cm²", length: "cm", piece: "pieces" }[unit]
}

/**
 * Machine cost per hour: capital amortized over lifetime uptime plus
 * electricity, both buffered — the exact formula the 3D calculator uses for
 * printers (guarding zero uptime/lifetime to 0 capital).
 */
export function machineCostPerHour(machine: LaserMachineLike, electricityCostPerKwh: number): number {
  const totalInvestment = pos(machine.printer_cost) + pos(machine.additional_upfront_cost)
  const lifetimeCost = totalInvestment + pos(machine.estimated_annual_maintenance) * pos(machine.estimated_life_years)
  const uptimeHoursPerYear = 8760 * pos(machine.estimated_printer_uptime_percent)
  const denominator = uptimeHoursPerYear * pos(machine.estimated_life_years)
  const capitalPerHour = denominator > 0 ? lifetimeCost / denominator : 0
  const electricityPerHour = (pos(machine.average_power_consumption_watts) / 1000) * pos(electricityCostPerKwh)
  return (capitalPerHour + electricityPerHour) * COST_BUFFER_FACTOR
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test`
Expected: 2 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts lib/laser-pricing.ts lib/laser-pricing.test.ts
git commit -m "feat: laser pricing module core with vitest harness"
```

---

### Task 2: Per-item costs and quantity discounts

**Files:**
- Modify: `lib/laser-pricing.ts`
- Test: `lib/laser-pricing.test.ts`

**Interfaces:**
- Consumes: Task 1 types and `machineCostPerHour`.
- Produces: `itemMaterialCost(item, material | undefined, efficiencyFactor): number`, `itemMachineCost(item, machine | undefined, electricityCostPerKwh): number`, `discountPctForQty(qty: number, tiers: QtyDiscountTier[]): number`, `resolveMinJobPrice(items, machinesById, laserMin, stickerMin): number`.

- [ ] **Step 1: Write the failing tests** (append to `lib/laser-pricing.test.ts`)

```ts
import {
  itemMaterialCost,
  itemMachineCost,
  discountPctForQty,
  resolveMinJobPrice,
  LASER_DEFAULTS,
  type LaserItem,
  type LaserMaterialLike,
} from "./laser-pricing"

const item = (over: Partial<LaserItem> = {}): LaserItem => ({
  id: "i1",
  name: "Keychain",
  quantity: 1,
  material_id: "mat1",
  usage: 1,
  machine_id: "m1",
  machine_minutes: 0,
  ...over,
})

const sheetMaterial: LaserMaterialLike = { id: "mat1", name: "Plywood 3mm", pricing_unit: "sheet", price: 8 }

describe("itemMaterialCost", () => {
  it("multiplies usage × price × qty × efficiency", () => {
    expect(itemMaterialCost(item({ usage: 0.25, quantity: 10 }), sheetMaterial, 1.1)).toBeCloseTo(22, 5)
  })
  it("is unit-agnostic — area material priced per cm²", () => {
    const vinyl: LaserMaterialLike = { id: "v", name: "Vinyl", pricing_unit: "area", price: 0.02 }
    expect(itemMaterialCost(item({ usage: 96, quantity: 50 }), vinyl, 1.1)).toBeCloseTo(105.6, 5)
  })
  it("returns 0 for missing material, zero qty, or negative usage", () => {
    expect(itemMaterialCost(item(), undefined, 1.1)).toBe(0)
    expect(itemMaterialCost(item({ quantity: 0 }), sheetMaterial, 1.1)).toBe(0)
    expect(itemMaterialCost(item({ usage: -3 }), sheetMaterial, 1.1)).toBe(0)
  })
})

describe("itemMachineCost", () => {
  it("charges minutes/60 × cost-per-hour × qty", () => {
    // machine below: capital 0, electricity 1kW × €1 = 1 → ×1.3 = 1.3/hr
    const m = machine({ printer_cost: 0, estimated_annual_maintenance: 0, average_power_consumption_watts: 1000, estimated_printer_uptime_percent: 1, estimated_life_years: 1 })
    expect(itemMachineCost(item({ machine_minutes: 6, quantity: 10 }), m, 1)).toBeCloseTo(1.3, 5)
  })
  it("returns 0 for a missing machine", () => {
    expect(itemMachineCost(item({ machine_minutes: 60 }), undefined, 1)).toBe(0)
  })
})

describe("discountPctForQty", () => {
  it("applies the highest qualifying tier, with boundaries inclusive", () => {
    const tiers = LASER_DEFAULTS.qty_discount_tiers
    expect(discountPctForQty(9, tiers)).toBe(0)
    expect(discountPctForQty(10, tiers)).toBe(5)
    expect(discountPctForQty(49, tiers)).toBe(5)
    expect(discountPctForQty(50, tiers)).toBe(10)
  })
  it("handles unsorted tiers and empty lists", () => {
    expect(discountPctForQty(100, [{ min_qty: 50, discount_pct: 10 }, { min_qty: 10, discount_pct: 5 }])).toBe(10)
    expect(discountPctForQty(100, [])).toBe(0)
  })
})

describe("resolveMinJobPrice", () => {
  const machines = new Map([
    ["laser1", machine({ id: "laser1", machine_type: "laser" })],
    ["stick1", machine({ id: "stick1", machine_type: "sticker-printer" })],
  ])
  it("uses the laser minimum for laser-only quotes", () => {
    expect(resolveMinJobPrice([item({ machine_id: "laser1" })], machines, 15, 10)).toBe(15)
  })
  it("uses the sticker minimum for sticker-only quotes", () => {
    expect(resolveMinJobPrice([item({ machine_id: "stick1" })], machines, 15, 10)).toBe(10)
  })
  it("uses the higher minimum when both machine kinds appear", () => {
    expect(resolveMinJobPrice([item({ machine_id: "laser1" }), item({ machine_id: "stick1" })], machines, 15, 10)).toBe(15)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm test`
Expected: FAIL — `itemMaterialCost` is not exported.

- [ ] **Step 3: Implement** (append to `lib/laser-pricing.ts`)

```ts
/** Material cost for all pieces of one item: usage × unit price × qty × waste factor. */
export function itemMaterialCost(
  item: LaserItem,
  material: LaserMaterialLike | undefined,
  materialEfficiencyFactor: number,
): number {
  if (!material) return 0
  const efficiency = pos(materialEfficiencyFactor) || 1
  return pos(item.usage) * pos(material.price) * itemQty(item) * efficiency
}

/** Machine cost for all pieces of one item: (minutes/60) × €/hr × qty. */
export function itemMachineCost(
  item: LaserItem,
  machine: LaserMachineLike | undefined,
  electricityCostPerKwh: number,
): number {
  if (!machine) return 0
  return (pos(item.machine_minutes) / 60) * machineCostPerHour(machine, electricityCostPerKwh) * itemQty(item)
}

/** Highest discount among tiers whose min_qty the quantity reaches. */
export function discountPctForQty(qty: number, tiers: QtyDiscountTier[]): number {
  let discount = 0
  for (const tier of tiers ?? []) {
    if (qty >= pos(tier.min_qty) && pos(tier.discount_pct) > discount) discount = pos(tier.discount_pct)
  }
  return Math.min(95, discount)
}

/**
 * Minimum job price for a quote: sticker-printer-only quotes use the sticker
 * minimum, anything touching a laser uses the laser minimum, and a mixed quote
 * takes the higher of the two.
 */
export function resolveMinJobPrice(
  items: LaserItem[],
  machinesById: ReadonlyMap<string, LaserMachineLike>,
  laserMinJobPrice: number,
  stickerMinJobPrice: number,
): number {
  let hasSticker = false
  let hasLaser = false
  for (const it of items) {
    const machine = machinesById.get(it.machine_id)
    if (!machine) continue
    if (machine.machine_type === "sticker-printer") hasSticker = true
    else hasLaser = true
  }
  if (hasSticker && hasLaser) return Math.max(pos(laserMinJobPrice), pos(stickerMinJobPrice))
  if (hasSticker) return pos(stickerMinJobPrice)
  return pos(laserMinJobPrice)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/laser-pricing.ts lib/laser-pricing.test.ts
git commit -m "feat: per-item laser costs, qty discounts, min job price resolution"
```

---

### Task 3: Full quote computation (`computeLaserQuote`)

**Files:**
- Modify: `lib/laser-pricing.ts`
- Test: `lib/laser-pricing.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–2.
- Produces: `computeLaserQuote(input: LaserQuoteInput): LaserQuoteBreakdown` plus both interfaces (exact shapes below). The calculator (Task 8), detailed view and PDF rely on the persisted fields derived from `LaserItemBreakdown`.

- [ ] **Step 1: Write the failing tests** (append to `lib/laser-pricing.test.ts`)

```ts
import { computeLaserQuote, type LaserQuoteInput } from "./laser-pricing"

/** Machine with capital 0 and exactly €1.3/hr electricity-buffered cost. */
const simpleMachine = machine({
  id: "laser1",
  machine_type: "laser",
  printer_cost: 0,
  estimated_annual_maintenance: 0,
  average_power_consumption_watts: 1000,
  estimated_printer_uptime_percent: 1,
  estimated_life_years: 1,
})

const pieceMaterial: LaserMaterialLike = { id: "mat1", name: "Blank", pricing_unit: "piece", price: 1 }

const baseInput = (over: Partial<LaserQuoteInput> = {}): LaserQuoteInput => ({
  items: [item({ machine_id: "laser1", machine_minutes: 6, usage: 1, quantity: 1 })],
  materialsById: new Map([["mat1", pieceMaterial]]),
  machinesById: new Map([["laser1", simpleMachine]]),
  electricityCostPerKwh: 1,
  materialEfficiencyFactor: 1,
  laborCost: 0,
  packagingCost: 0,
  fuelCost: 0,
  setupFee: 0,
  marginPct: 50,
  qtyDiscountTiers: LASER_DEFAULTS.qty_discount_tiers,
  applyDiscountsAndMinimum: true,
  laserMinJobPrice: 15,
  stickerMinJobPrice: 10,
  emergencyFee: 0,
  vatRate: 0,
  ...over,
})

describe("computeLaserQuote", () => {
  it("bumps a small job to the minimum job price and reports the adjustment", () => {
    // direct = material 1 + machine 0.13 = 1.13; ×2 (50% margin) = 2.26 < 15
    const b = computeLaserQuote(baseInput())
    expect(b.baseCost).toBeCloseTo(1.13, 5)
    expect(b.sellBeforeMinimum).toBeCloseTo(2.26, 5)
    expect(b.minPriceApplied).toBe(true)
    expect(b.minPriceAdjustment).toBeCloseTo(12.74, 5)
    expect(b.total).toBeCloseTo(15, 5)
  })

  it("does not bump above-minimum jobs and applies VAT + emergency on top", () => {
    const b = computeLaserQuote(baseInput({
      items: [item({ machine_id: "laser1", machine_minutes: 60, usage: 10, quantity: 2 })],
      emergencyFee: 10,
      vatRate: 0.23,
    }))
    // material 10*1*2=20, machine 1.3*2=2.6 → base 22.6 → sell 45.2 (no discount, qty 2)
    expect(b.minPriceApplied).toBe(false)
    expect(b.totalExVat).toBeCloseTo(55.2, 5)
    expect(b.total).toBeCloseTo(55.2 * 1.23, 4)
  })

  it("applies the qty discount per item and reports per-piece figures", () => {
    const b = computeLaserQuote(baseInput({
      items: [item({ machine_id: "laser1", machine_minutes: 0, usage: 1, quantity: 10 })],
    }))
    // material 10 → sell full 20, 5% tier → line 19; per piece 1.9
    expect(b.items[0].discountPct).toBe(5)
    expect(b.items[0].lineSell).toBeCloseTo(19, 5)
    expect(b.items[0].sellPerPiece).toBeCloseTo(1.9, 5)
    expect(b.discountAmount).toBeCloseTo(1, 5)
    expect(b.sellExVat).toBeCloseTo(19, 5)
  })

  it("sells the setup fee with margin as its own line (not allocated to items)", () => {
    const b = computeLaserQuote(baseInput({ setupFee: 5 }))
    expect(b.setupFeeSell).toBeCloseTo(10, 5)
    expect(b.baseCost).toBeCloseTo(6.13, 5)
    // items keep their own sell: 2.26 + setup 10 = 12.26 < 15 → still bumped
    expect(b.sellBeforeMinimum).toBeCloseTo(12.26, 5)
    expect(b.minPriceApplied).toBe(true)
  })

  it("allocates labor/packaging/fuel overhead across items by direct-cost share", () => {
    const b = computeLaserQuote(baseInput({
      laborCost: 10,
      items: [
        item({ id: "a", machine_id: "laser1", machine_minutes: 0, usage: 3, quantity: 1 }),
        item({ id: "b", machine_id: "laser1", machine_minutes: 0, usage: 1, quantity: 1 }),
      ],
    }))
    // direct a=3, b=1 → overhead splits 7.5/2.5 → allocated 10.5/3.5 → sell 21/7
    expect(b.items[0].lineSell).toBeCloseTo(21, 5)
    expect(b.items[1].lineSell).toBeCloseTo(7, 5)
  })

  it("skips discounts and minimum in target-price mode", () => {
    const b = computeLaserQuote(baseInput({
      applyDiscountsAndMinimum: false,
      items: [item({ machine_id: "laser1", machine_minutes: 0, usage: 1, quantity: 50 })],
    }))
    expect(b.items[0].discountPct).toBe(0)
    expect(b.minPriceApplied).toBe(false)
  })

  it("sells pure-overhead quotes (no items) directly", () => {
    const b = computeLaserQuote(baseInput({ items: [], laborCost: 20 }))
    expect(b.sellBeforeMinimum).toBeCloseTo(40, 5)
    expect(b.minPriceApplied).toBe(false) // 40 > 15
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm test`
Expected: FAIL — `computeLaserQuote` is not exported.

- [ ] **Step 3: Implement** (append to `lib/laser-pricing.ts`)

```ts
export interface LaserQuoteInput {
  items: LaserItem[]
  materialsById: ReadonlyMap<string, LaserMaterialLike>
  machinesById: ReadonlyMap<string, LaserMachineLike>
  electricityCostPerKwh: number
  materialEfficiencyFactor: number
  laborCost: number
  packagingCost: number
  fuelCost: number
  setupFee: number
  marginPct: number
  qtyDiscountTiers: QtyDiscountTier[]
  /** false in target-price mode — the operator sets the exact total. */
  applyDiscountsAndMinimum: boolean
  laserMinJobPrice: number
  stickerMinJobPrice: number
  emergencyFee: number
  /** 0 when VAT is not charged. */
  vatRate: number
}

export interface LaserItemBreakdown {
  id: string
  directCost: number
  costPerPiece: number
  discountPct: number
  sellPerPiece: number
  lineSell: number
}

export interface LaserQuoteBreakdown {
  materialCost: number
  machineCost: number
  /** labor + packaging + fuel — allocated into item lines by direct-cost share. */
  overheadCost: number
  setupFee: number
  /** Setup fee with margin applied — rendered as its own document line. */
  setupFeeSell: number
  baseCost: number
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
  items: LaserItemBreakdown[]
}

export function computeLaserQuote(input: LaserQuoteInput): LaserQuoteBreakdown {
  const marginPct = Math.min(95, pos(input.marginPct))
  const multiplier = 1 / (1 - marginPct / 100)

  const directs = input.items.map((it) => ({
    it,
    material: itemMaterialCost(it, input.materialsById.get(it.material_id), input.materialEfficiencyFactor),
    machine: itemMachineCost(it, input.machinesById.get(it.machine_id), input.electricityCostPerKwh),
  }))
  const materialCost = directs.reduce((s, d) => s + d.material, 0)
  const machineCost = directs.reduce((s, d) => s + d.machine, 0)
  const directTotal = materialCost + machineCost
  const overheadCost = pos(input.laborCost) + pos(input.packagingCost) + pos(input.fuelCost)
  const setupFee = pos(input.setupFee)
  const baseCost = directTotal + overheadCost + setupFee
  const setupFeeSell = setupFee * multiplier

  const items: LaserItemBreakdown[] = directs.map(({ it, material, machine }) => {
    const direct = material + machine
    const share = directTotal > 0 ? direct / directTotal : input.items.length > 0 ? 1 / input.items.length : 0
    const allocated = direct + overheadCost * share
    const qty = itemQty(it)
    const discountPct = input.applyDiscountsAndMinimum ? discountPctForQty(qty, input.qtyDiscountTiers) : 0
    const lineSell = allocated * multiplier * (1 - discountPct / 100)
    return {
      id: it.id,
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

  const minJobPrice = input.applyDiscountsAndMinimum
    ? resolveMinJobPrice(input.items, input.machinesById, input.laserMinJobPrice, input.stickerMinJobPrice)
    : 0
  const minPriceApplied = baseCost > 0 && sellBeforeMinimum < minJobPrice
  const sellExVat = minPriceApplied ? minJobPrice : sellBeforeMinimum
  const minPriceAdjustment = minPriceApplied ? minJobPrice - sellBeforeMinimum : 0

  const totalExVat = sellExVat + pos(input.emergencyFee)
  const vatAmount = totalExVat * pos(input.vatRate)
  return {
    materialCost,
    machineCost,
    overheadCost,
    setupFee,
    setupFeeSell,
    baseCost,
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
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/laser-pricing.ts lib/laser-pricing.test.ts
git commit -m "feat: computeLaserQuote with margin, discounts, setup fee and min job price"
```

---

### Task 4: Row types, legacy-material migration, local-db seeding

**Files:**
- Modify: `types/db.ts`
- Create: `lib/laser-materials-migration.ts`
- Test: `lib/laser-materials-migration.test.ts`
- Modify: `lib/local-db.ts` (SEED map only)

**Interfaces:**
- Consumes: `Filament` type; `LASER_DEFAULTS` from `@/lib/laser-pricing`.
- Produces: `LaserMaterial` row type (in `types/db.ts`, registered in `Tables`), `Printer.machine_type`, `GlobalSettings` lever fields, and `migrateLegacyLaserMaterials(filamentRows: Filament[], existing: LaserMaterial[]): LaserMaterial[]`.

- [ ] **Step 1: Add the row types in `types/db.ts`**

Add to the `Printer` type (after `has_enclosure: boolean`):

```ts
  // "3d-printer" (default for legacy rows) | "laser" | "sticker-printer".
  machine_type?: string
```

Add to the `GlobalSettings` type (before `created_at`):

```ts
  // Laser & Stickers pricing levers. Absent on legacy rows; read sites fall
  // back to LASER_DEFAULTS from lib/laser-pricing.
  laser_min_job_price?: number
  sticker_min_job_price?: number
  default_setup_fee?: number
  qty_discount_tiers?: { min_qty: number; discount_pct: number }[]
```

Add a new exported type after `Filament`:

```ts
export type LaserMaterial = {
  id: string
  name: string
  color?: string | null
  // How this material is bought/charged: per sheet, per cm², per cm, per piece.
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

And in `Tables`, replace `laser_materials: UnknownRow` with `laser_materials: LaserMaterial`.

- [ ] **Step 2: Write the failing migration test**

Create `lib/laser-materials-migration.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { migrateLegacyLaserMaterials } from "./laser-materials-migration"
import type { Filament, LaserMaterial } from "@/types/db"

const filament = (over: Partial<Filament>): Filament => ({
  id: "f1",
  name: "PLA Black",
  price_per_kg: 20,
  requires_heating: false,
  heating_time_hours: 0,
  material_type: "filament",
  ...over,
})

describe("migrateLegacyLaserMaterials", () => {
  it("converts non-filament rows to sheet-priced laser materials", () => {
    const rows = [
      filament({ id: "f1", material_type: "filament" }),
      filament({ id: "f2", name: "Plywood Sheet", material_type: "material", price_per_kg: 8, color_hex: "#a07040" }),
    ]
    const out = migrateLegacyLaserMaterials(rows, [])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ name: "Plywood Sheet", pricing_unit: "sheet", price: 8, color: "#a07040" })
    expect(out[0].id).toBeTruthy()
    expect(out[0].created_at).toBeTruthy()
  })

  it("is idempotent — skips names that already exist (case-insensitive)", () => {
    const rows = [filament({ id: "f2", name: "Plywood Sheet", material_type: "material" })]
    const existing = [{ name: "plywood sheet" } as LaserMaterial]
    expect(migrateLegacyLaserMaterials(rows, existing)).toHaveLength(0)
  })

  it("defaults a missing price to 0", () => {
    const rows = [filament({ id: "f2", name: "Cork", material_type: "material", price_per_kg: undefined as any })]
    expect(migrateLegacyLaserMaterials(rows, [])[0].price).toBe(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./laser-materials-migration`.

- [ ] **Step 4: Create `lib/laser-materials-migration.ts`**

```ts
// One-time (idempotent) migration of legacy laser materials that were stored
// as filaments rows with material_type !== "filament". Pure so it's testable;
// lib/local-db.ts calls it when seeding the laser_materials table.

import type { Filament, LaserMaterial } from "@/types/db"

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function migrateLegacyLaserMaterials(filamentRows: Filament[], existing: LaserMaterial[]): LaserMaterial[] {
  const taken = new Set(existing.map((m) => (m.name || "").toLowerCase()))
  const now = new Date().toISOString()
  return filamentRows
    .filter((f) => f.material_type && f.material_type !== "filament")
    .filter((f) => !taken.has((f.name || "").toLowerCase()))
    .map((f) => ({
      id: newId(),
      name: f.name,
      color: f.color_hex ?? null,
      pricing_unit: "sheet" as const,
      price: Number(f.price_per_kg) || 0,
      sheet_width_cm: null,
      sheet_height_cm: null,
      stock_qty: null,
      notes: "Migrated from filament materials",
      created_at: now,
      updated_at: now,
    }))
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test`
Expected: all PASS.

- [ ] **Step 6: Wire seeding in `lib/local-db.ts`**

Add imports at the top (after the existing `Tables` import):

```ts
import { migrateLegacyLaserMaterials } from "@/lib/laser-materials-migration"
import { LASER_DEFAULTS } from "@/lib/laser-pricing"
```

In the `SEED` map, spread the laser defaults into the `global_settings` seed row (add after `validity_days: 30,`):

```ts
      ...LASER_DEFAULTS,
```

Add a `laser_materials` entry to `SEED` (after the `global_settings` entry). Seeding runs on first read of the table, so legacy filament-materials migrate exactly once — afterwards the stored key exists and `SEED` is never consulted again:

```ts
  laser_materials: () => migrateLegacyLaserMaterials(load("filaments") as any[], []),
```

(`load` is declared with `function` so the reference inside the lazily-invoked seed closure is fine.)

- [ ] **Step 7: Verify build and tests**

Run: `pnpm test` then `pnpm build`
Expected: tests PASS; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add types/db.ts lib/laser-materials-migration.ts lib/laser-materials-migration.test.ts lib/local-db.ts
git commit -m "feat: laser material types, legacy migration and local-db seeding"
```

---

### Task 5: Materials settings page

**Files:**
- Create: `components/laser-materials-list.tsx`
- Create: `app/settings/materials/page.tsx`
- Modify: `app/settings/page.tsx` (add card)
- Modify: `app/settings/filaments/page.tsx` + `components/filaments-list.tsx` (drop the legacy materials section)

**Interfaces:**
- Consumes: `LaserMaterial` type, `pricingUnitLabel` from `@/lib/laser-pricing`, `createClient` shim, `onLocalDbChange`.
- Produces: `LaserMaterialsList({ materials }: { materials: LaserMaterial[] })` component; `/settings/materials` route. Task 8's material picker assumes materials exist through this page.

- [ ] **Step 1: Create `components/laser-materials-list.tsx`**

A CRUD list styled like the rest of settings (Cards, shadcn inputs). Complete component:

```tsx
"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Pencil, X, Check } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { pricingUnitLabel, usageUnitLabel, type LaserPricingUnit } from "@/lib/laser-pricing"
import type { LaserMaterial } from "@/types/db"

const UNITS: { value: LaserPricingUnit; label: string }[] = [
  { value: "sheet", label: "Per sheet" },
  { value: "area", label: "Per area (cm²)" },
  { value: "length", label: "Per length (cm)" },
  { value: "piece", label: "Per piece" },
]

type FormState = {
  name: string
  pricing_unit: LaserPricingUnit
  price: string
  sheet_width_cm: string
  sheet_height_cm: string
  stock_qty: string
  color: string
}

const EMPTY_FORM: FormState = {
  name: "",
  pricing_unit: "sheet",
  price: "",
  sheet_width_cm: "",
  sheet_height_cm: "",
  stock_qty: "",
  color: "",
}

function formToRow(form: FormState) {
  return {
    name: form.name.trim(),
    pricing_unit: form.pricing_unit,
    price: Number.parseFloat(form.price) || 0,
    sheet_width_cm: form.pricing_unit === "sheet" ? Number.parseFloat(form.sheet_width_cm) || null : null,
    sheet_height_cm: form.pricing_unit === "sheet" ? Number.parseFloat(form.sheet_height_cm) || null : null,
    stock_qty: form.stock_qty === "" ? null : Number.parseFloat(form.stock_qty) || 0,
    color: form.color.trim() || null,
    updated_at: new Date().toISOString(),
  }
}

function MaterialForm({
  form,
  onChange,
}: {
  form: FormState
  onChange: (next: FormState) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <Label>Name</Label>
        <Input value={form.name} placeholder="Plywood 3mm" onChange={(e) => onChange({ ...form, name: e.target.value })} className="bg-card" />
      </div>
      <div>
        <Label>Priced</Label>
        <Select value={form.pricing_unit} onValueChange={(v) => onChange({ ...form, pricing_unit: v as LaserPricingUnit })}>
          <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            {UNITS.map((u) => (
              <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Price ({pricingUnitLabel(form.pricing_unit)})</Label>
        <Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => onChange({ ...form, price: e.target.value })} className="bg-card" />
      </div>
      {form.pricing_unit === "sheet" && (
        <>
          <div>
            <Label>Sheet width (cm, optional)</Label>
            <Input type="number" min="0" step="0.1" value={form.sheet_width_cm} onChange={(e) => onChange({ ...form, sheet_width_cm: e.target.value })} className="bg-card" />
          </div>
          <div>
            <Label>Sheet height (cm, optional)</Label>
            <Input type="number" min="0" step="0.1" value={form.sheet_height_cm} onChange={(e) => onChange({ ...form, sheet_height_cm: e.target.value })} className="bg-card" />
          </div>
        </>
      )}
      <div>
        <Label>Stock ({usageUnitLabel(form.pricing_unit)}, optional)</Label>
        <Input type="number" min="0" step="0.1" value={form.stock_qty} onChange={(e) => onChange({ ...form, stock_qty: e.target.value })} className="bg-card" />
      </div>
      <div>
        <Label>Color (optional, hex)</Label>
        <Input value={form.color} placeholder="#a07040" onChange={(e) => onChange({ ...form, color: e.target.value })} className="bg-card" />
      </div>
    </div>
  )
}

export function LaserMaterialsList({ materials }: { materials: LaserMaterial[] }) {
  const { toast } = useToast()
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM)

  const handleAdd = async () => {
    if (!addForm.name.trim()) {
      toast({ title: "Name required", description: "Give the material a name.", variant: "destructive" })
      return
    }
    const supabase = createClient()
    const { error } = await supabase.from("laser_materials").insert([{ ...formToRow(addForm), created_at: new Date().toISOString() }])
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
      return
    }
    setAddForm(EMPTY_FORM)
    setShowAdd(false)
    toast({ title: "Material added" })
  }

  const startEdit = (m: LaserMaterial) => {
    setEditingId(m.id)
    setEditForm({
      name: m.name,
      pricing_unit: m.pricing_unit,
      price: String(m.price ?? ""),
      sheet_width_cm: m.sheet_width_cm != null ? String(m.sheet_width_cm) : "",
      sheet_height_cm: m.sheet_height_cm != null ? String(m.sheet_height_cm) : "",
      stock_qty: m.stock_qty != null ? String(m.stock_qty) : "",
      color: m.color ?? "",
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    const supabase = createClient()
    const { error } = await supabase.from("laser_materials").update(formToRow(editForm)).eq("id", editingId)
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
      return
    }
    setEditingId(null)
    toast({ title: "Material updated" })
  }

  const handleDelete = async (m: LaserMaterial) => {
    const supabase = createClient()
    const { error } = await supabase.from("laser_materials").delete().eq("id", m.id)
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
      return
    }
    toast({ title: "Material deleted", description: m.name })
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6 shadow-sm">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Laser & Sticker Materials</h2>
          <Button size="sm" className="shadow-sm" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {showAdd ? "Cancel" : "Add Material"}
          </Button>
        </div>
        {showAdd && (
          <div className="mt-4 space-y-4">
            <MaterialForm form={addForm} onChange={setAddForm} />
            <Button onClick={handleAdd} className="shadow-sm">
              <Check className="w-4 h-4 mr-2" />
              Save Material
            </Button>
          </div>
        )}
      </Card>

      {materials.length === 0 && !showAdd && (
        <Card className="p-8 text-center text-sm text-muted-foreground shadow-sm">
          No materials yet. Add the sheets, rolls and blanks you buy — each priced the way you buy it.
        </Card>
      )}

      {materials.map((m) => (
        <Card key={m.id} className="p-4 sm:p-5 shadow-sm">
          {editingId === m.id ? (
            <div className="space-y-4">
              <MaterialForm form={editForm} onChange={setEditForm} />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveEdit}>
                  <Check className="w-4 h-4 mr-2" />Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                  <X className="w-4 h-4 mr-2" />Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="size-8 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: m.color || "var(--muted)" }}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{m.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {m.price?.toFixed(2)} {pricingUnitLabel(m.pricing_unit)}
                    {m.pricing_unit === "sheet" && m.sheet_width_cm && m.sheet_height_cm
                      ? ` · ${m.sheet_width_cm}×${m.sheet_height_cm} cm`
                      : ""}
                    {m.stock_qty != null ? ` · ${m.stock_qty} ${usageUnitLabel(m.pricing_unit)} in stock` : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" aria-label={`Edit ${m.name}`} onClick={() => startEdit(m)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Delete ${m.name}`} onClick={() => handleDelete(m)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `app/settings/materials/page.tsx`** (mirrors `app/settings/filaments/page.tsx`)

```tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { onLocalDbChange } from "@/lib/local-db"
import { LaserMaterialsList } from "@/components/laser-materials-list"
import { SiteHeader, PageHeader } from "@/components/site-header"
import type { LaserMaterial } from "@/types/db"

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<LaserMaterial[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data } = await supabase.from("laser_materials").select("*").order("created_at", { ascending: true })
      setMaterials(data || [])
      setLoaded(true)
    }
    loadData()
    return onLocalDbChange(loadData)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/settings" />
      <PageHeader
        backHref="/settings"
        title="Laser & Sticker Materials"
        description="Sheets, rolls and blanks — each priced per sheet, area, length or piece"
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {loaded && <LaserMaterialsList materials={materials} />}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Add the settings card** in `app/settings/page.tsx`

Import `Layers` from `lucide-react` (extend the existing lucide import) and add to `SECTIONS` after the filaments entry:

```ts
  {
    href: "/settings/materials",
    icon: Layers,
    title: "Laser & Sticker Materials",
    description: "Sheets, vinyl rolls and blanks with per-sheet, per-area or per-piece pricing.",
  },
```

Also update the filaments card description to drop the laser mention: `"Filament spools, brands, colors and prices."`

- [ ] **Step 4: Remove the legacy materials section from the filaments page**

In `app/settings/filaments/page.tsx`: delete the `materials` state, the second query (`.eq("material_type", "material")`), and the `materials={materials}` prop. Change the `PageHeader` description to `"Spools, colors and pricing"`.

In `components/filaments-list.tsx`: make the `materials` prop optional and unused — locate it via `grep -n "materials" components/filaments-list.tsx`, remove `materials` from the props interface and destructuring (its default `= []` at line ~76), and delete the JSX section that renders the materials list (find it via `materials.map` / a "materials" heading). If any add-form logic writes `material_type: "material"` rows, delete that path too. The component must compile with only `filaments`.

- [ ] **Step 5: Verify**

Run: `pnpm build`
Expected: build succeeds.

Manual check: `pnpm dev`, open `http://localhost:4001/settings/materials` — legacy laser materials (if any existed in the filaments table) appear as sheet-priced rows; add/edit/delete works; `/settings/filaments` no longer shows a materials section.

- [ ] **Step 6: Commit**

```bash
git add components/laser-materials-list.tsx app/settings/materials/page.tsx app/settings/page.tsx app/settings/filaments/page.tsx components/filaments-list.tsx
git commit -m "feat: laser materials catalog settings page, retire filament-table materials"
```

---

### Task 6: Machine type on printers + laser levers in global settings

**Files:**
- Modify: `components/printers-list.tsx`
- Modify: `components/global-settings-form.tsx`

**Interfaces:**
- Consumes: `Printer.machine_type`, `GlobalSettings` lever fields (Task 4), `LASER_DEFAULTS`.
- Produces: printers can be saved as `"laser"` / `"sticker-printer"`; global settings form persists `laser_min_job_price`, `sticker_min_job_price`, `default_setup_fee`, `qty_discount_tiers`.

- [ ] **Step 1: Add machine type to the printer form**

`components/printers-list.tsx` uses one shared form block (fields at ~lines 194–319) driven by a `data`/`onChange` pair with string values, and separate add/edit state initializers (`has_enclosure: "false"` at ~46 and ~123, save mapping at ~102/~158, edit hydration at ~186). Make these changes:

1. Add `machine_type: "3d-printer"` to both empty-form initializers, `machine_type: printer.machine_type || "3d-printer"` to the edit hydration, and `machine_type: newPrinter.machine_type || "3d-printer"` (resp. `editData.machine_type`) to both save payloads.
2. Import `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from `@/components/ui/select` and add this field to the shared form block, right before the enclosure checkbox:

```tsx
      <div>
        <Label>Machine Type</Label>
        <Select value={data.machine_type || "3d-printer"} onValueChange={(v) => onChange({ ...data, machine_type: v })}>
          <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3d-printer">3D Printer</SelectItem>
            <SelectItem value="laser">Laser (engraver / cutter)</SelectItem>
            <SelectItem value="sticker-printer">Sticker Printer / Cutter</SelectItem>
          </SelectContent>
        </Select>
      </div>
```

3. In the printer card display, next to where `has_enclosure` renders a badge (~line 390), add a small muted label for non-3D machines: `{printer.machine_type === "laser" && <span className="text-xs text-muted-foreground">Laser</span>}{printer.machine_type === "sticker-printer" && <span className="text-xs text-muted-foreground">Sticker printer</span>}`.

- [ ] **Step 2: Add the Laser & Stickers section to `components/global-settings-form.tsx`**

Follow the form's existing field pattern (string-typed form state hydrated from the settings row, written back on save). Add to the form state, hydration and save payload:

- `laser_min_job_price` (number input, default display from `settings.laser_min_job_price ?? 15`)
- `sticker_min_job_price` (default 10)
- `default_setup_fee` (default 5)
- `qty_discount_tiers` (array state `{ min_qty: string; discount_pct: string }[]`, hydrated from `settings.qty_discount_tiers ?? LASER_DEFAULTS.qty_discount_tiers`, saved as numbers with empty/invalid rows dropped)

Import `LASER_DEFAULTS` from `@/lib/laser-pricing`. Render a new Card section titled **"Laser & Stickers"** after the existing rate fields:

```tsx
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Laser minimum job price (€)</Label>
          <Input type="number" min="0" step="0.5" value={form.laser_min_job_price}
            onChange={(e) => setForm({ ...form, laser_min_job_price: e.target.value })} className="bg-card" />
        </div>
        <div>
          <Label>Sticker minimum job price (€)</Label>
          <Input type="number" min="0" step="0.5" value={form.sticker_min_job_price}
            onChange={(e) => setForm({ ...form, sticker_min_job_price: e.target.value })} className="bg-card" />
        </div>
        <div>
          <Label>Default setup fee (€)</Label>
          <Input type="number" min="0" step="0.5" value={form.default_setup_fee}
            onChange={(e) => setForm({ ...form, default_setup_fee: e.target.value })} className="bg-card" />
        </div>
      </div>
      <div className="mt-4">
        <Label>Quantity discounts</Label>
        <p className="text-xs text-muted-foreground mb-2">Items whose quantity reaches a tier get that discount on their line price.</p>
        {form.qty_discount_tiers.map((tier, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <Input type="number" min="1" step="1" value={tier.min_qty} placeholder="Min qty" className="w-28 bg-card"
              onChange={(e) => setForm({ ...form, qty_discount_tiers: form.qty_discount_tiers.map((t, j) => (j === i ? { ...t, min_qty: e.target.value } : t)) })} />
            <span className="text-sm text-muted-foreground">pcs →</span>
            <Input type="number" min="0" max="95" step="1" value={tier.discount_pct} placeholder="%" className="w-24 bg-card"
              onChange={(e) => setForm({ ...form, qty_discount_tiers: form.qty_discount_tiers.map((t, j) => (j === i ? { ...t, discount_pct: e.target.value } : t)) })} />
            <span className="text-sm text-muted-foreground">% off</span>
            <Button size="icon" variant="ghost" aria-label="Remove tier"
              onClick={() => setForm({ ...form, qty_discount_tiers: form.qty_discount_tiers.filter((_, j) => j !== i) })}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline"
          onClick={() => setForm({ ...form, qty_discount_tiers: [...form.qty_discount_tiers, { min_qty: "", discount_pct: "" }] })}>
          <Plus className="w-4 h-4 mr-2" />Add tier
        </Button>
      </div>
```

Save mapping (in the existing save handler's payload):

```ts
      laser_min_job_price: Number.parseFloat(form.laser_min_job_price) || 0,
      sticker_min_job_price: Number.parseFloat(form.sticker_min_job_price) || 0,
      default_setup_fee: Number.parseFloat(form.default_setup_fee) || 0,
      qty_discount_tiers: form.qty_discount_tiers
        .map((t) => ({ min_qty: Number.parseInt(t.min_qty, 10) || 0, discount_pct: Number.parseFloat(t.discount_pct) || 0 }))
        .filter((t) => t.min_qty > 0 && t.discount_pct > 0),
```

- [ ] **Step 3: Verify**

Run: `pnpm build`
Expected: success. Manual: save a printer as Laser type; save laser settings and reload the page — values persist.

- [ ] **Step 4: Commit**

```bash
git add components/printers-list.tsx components/global-settings-form.tsx
git commit -m "feat: machine types for printers, laser pricing levers in global settings"
```

---

### Task 7: Shared labor/packaging line tables

**Files:**
- Create: `components/quote-line-tables.tsx`

**Interfaces:**
- Consumes: ui primitives only.
- Produces: `LaborItemRow { id: string; action: string; hours: number; hourly_cost: number }`, `PackagingItemRow { id: string; name: string; quantity: number; unit_cost: number }`, `LaborTable({ items, onChange, defaultHourlyRate })`, `PackagingTable({ items, onChange })`. Task 8 consumes these; the persisted shapes match what `quotes.labor_items` / `packaging_items` already contain (the 3D calculator saves the same field names).

- [ ] **Step 1: Create `components/quote-line-tables.tsx`**

```tsx
"use client"

// Controlled labor/packaging line tables shared by calculators. The row field
// names match what saved quotes already store in labor_items/packaging_items.

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Plus, Trash2 } from "lucide-react"

export type LaborItemRow = { id: string; action: string; hours: number; hourly_cost: number }
export type PackagingItemRow = { id: string; name: string; quantity: number; unit_cost: number }

const th = "p-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"

export function LaborTable({
  items,
  onChange,
  defaultHourlyRate,
}: {
  items: LaborItemRow[]
  onChange: (items: LaborItemRow[]) => void
  defaultHourlyRate: number
}) {
  const patch = (i: number, p: Partial<LaborItemRow>) =>
    onChange(items.map((row, j) => (j === i ? { ...row, ...p } : row)))
  return (
    <Card className="p-5 sm:p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Labor</h2>
        <Button size="sm" className="shadow-sm"
          onClick={() => onChange([...items, { id: crypto.randomUUID(), action: "", hours: 0, hourly_cost: defaultHourlyRate }])}>
          <Plus className="w-4 h-4 mr-2" />Add Labor
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Design and artwork prep time goes here, at your hourly rate.</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[480px]">
          <thead>
            <tr className="bg-muted/60 border-b border-border">
              <th className={th}>Action</th>
              <th className={th}>Hours</th>
              <th className={th}>€/hr</th>
              <th className={th}>Cost (€)</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={row.id} className="border-b border-border/60 transition-colors hover:bg-muted/30">
                <td className="p-2"><Input value={row.action} placeholder="Design work" className="bg-card" onChange={(e) => patch(i, { action: e.target.value })} /></td>
                <td className="p-2"><Input type="number" min="0" step="0.25" className="w-24 bg-card" value={row.hours || ""} onChange={(e) => patch(i, { hours: Number.parseFloat(e.target.value) || 0 })} /></td>
                <td className="p-2"><Input type="number" min="0" step="0.5" className="w-24 bg-card" value={row.hourly_cost || ""} onChange={(e) => patch(i, { hourly_cost: Number.parseFloat(e.target.value) || 0 })} /></td>
                <td className="p-2 tabular-nums text-sm">{(row.hours * row.hourly_cost).toFixed(2)}</td>
                <td className="p-2 text-center">
                  <Button size="icon" variant="ghost" aria-label="Remove labor row" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export function PackagingTable({
  items,
  onChange,
}: {
  items: PackagingItemRow[]
  onChange: (items: PackagingItemRow[]) => void
}) {
  const patch = (i: number, p: Partial<PackagingItemRow>) =>
    onChange(items.map((row, j) => (j === i ? { ...row, ...p } : row)))
  return (
    <Card className="p-5 sm:p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Packaging</h2>
        <Button size="sm" className="shadow-sm"
          onClick={() => onChange([...items, { id: crypto.randomUUID(), name: "", quantity: 1, unit_cost: 0 }])}>
          <Plus className="w-4 h-4 mr-2" />Add Packaging
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[480px]">
          <thead>
            <tr className="bg-muted/60 border-b border-border">
              <th className={th}>Item</th>
              <th className={th}>Qty</th>
              <th className={th}>Unit Cost (€)</th>
              <th className={th}>Cost (€)</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={row.id} className="border-b border-border/60 transition-colors hover:bg-muted/30">
                <td className="p-2"><Input value={row.name} placeholder="Box" className="bg-card" onChange={(e) => patch(i, { name: e.target.value })} /></td>
                <td className="p-2"><Input type="number" min="0" step="1" className="w-20 bg-card" value={row.quantity || ""} onChange={(e) => patch(i, { quantity: Number.parseFloat(e.target.value) || 0 })} /></td>
                <td className="p-2"><Input type="number" min="0" step="0.05" className="w-24 bg-card" value={row.unit_cost || ""} onChange={(e) => patch(i, { unit_cost: Number.parseFloat(e.target.value) || 0 })} /></td>
                <td className="p-2 tabular-nums text-sm">{(row.quantity * row.unit_cost).toFixed(2)}</td>
                <td className="p-2 text-center">
                  <Button size="icon" variant="ghost" aria-label="Remove packaging row" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
```

- [ ] **Step 2: Verify build, commit**

Run: `pnpm build` — success.

```bash
git add components/quote-line-tables.tsx
git commit -m "feat: shared controlled labor and packaging line tables"
```

---

### Task 8: The LaserCalculator component

**Files:**
- Create: `components/laser-calculator.tsx`

**Interfaces:**
- Consumes: `computeLaserQuote`, `LaserItem`, `LASER_DEFAULTS`, `usageUnitLabel`, `pricingUnitLabel`, `itemQty` from `@/lib/laser-pricing`; `LaborTable`/`PackagingTable` (Task 7); `ClientSelector` (`value`, `onChange(name, id?)`, `clients`, `onClientsUpdate`); row types from `@/types/db`.
- Produces: `LaserCalculator({ machines, materials, globalSettings, clients, mode, editingQuoteId })`. Saves quote rows with `quote_type_mode: "laser"`, `laser_items` (denormalized: `material_name`, `machine_name`, `cost_per_piece`, `sell_per_piece`, `line_sell`, `discount_pct` on each item), `setup_fee`, `discount_amount`, `min_job_price`, `min_price_applied`, `min_price_adjustment`, and **always** an authoritative `final_price`. Tasks 9/11/12/13 rely on exactly these persisted fields.

- [ ] **Step 1: Create `components/laser-calculator.tsx`**

```tsx
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
              <p>No laser or sticker machines yet — add one under <a href="/settings/printers" className="underline">Settings → Printers & Machines</a> with machine type “Laser” or “Sticker Printer”.</p>
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
```

- [ ] **Step 2: Verify**

Run: `pnpm test` (module tests still green) then `pnpm build`
Expected: both succeed. (The component isn't routed yet — that's Task 9.)

- [ ] **Step 3: Commit**

```bash
git add components/laser-calculator.tsx
git commit -m "feat: dedicated laser & stickers calculator component"
```

---

### Task 9: Page-level calculator toggle + edit routing + legacy banner

**Files:**
- Modify: `app/business/page.tsx`
- Modify: `app/personal/page.tsx`

**Interfaces:**
- Consumes: `LaserCalculator` (Task 8), `ExcelCalculator`, `Printer.machine_type`, `laser_materials` table.
- Produces: `?type=laser` URL param convention; editing routes laser quotes to `LaserCalculator` and legacy laser quotes to a banner.

- [ ] **Step 1: Rework `app/business/page.tsx`**

Extend the existing loader and render. Changes to `BusinessPageInner`:

1. Add imports: `LaserCalculator` from `@/components/laser-calculator`, `Card` from `@/components/ui/card`.
2. Load materials and the editing quote:

```tsx
  const [laserMaterials, setLaserMaterials] = useState<any[]>([])
  const [editingQuote, setEditingQuote] = useState<any>(null)
```

Inside `loadData`, add:

```tsx
      const { data: laserMaterialsData } = await supabase.from("laser_materials").select("*").order("created_at", { ascending: true })
      setLaserMaterials(laserMaterialsData || [])
      if (editingQuoteId) {
        const { data: quoteRow } = await supabase.from("quotes").select("*").eq("id", editingQuoteId).maybeSingle()
        setEditingQuote(quoteRow ?? null)
      } else {
        setEditingQuote(null)
      }
```

(Add `editingQuoteId` to the effect's dependency array.)

3. Derive the calculator type. `?type=laser` selects laser for new quotes; an edited quote's stored mode wins:

```tsx
  const typeParam = searchParams.get("type")
  const LEGACY_LASER_MODES = ["laser-engraving", "laser-cutting", "stickers"]
  const editingMode = editingQuote?.quote_type_mode as string | undefined
  const calcType: "3d-print" | "laser" | "legacy-laser" =
    editingQuoteId && editingQuote
      ? editingMode === "laser"
        ? "laser"
        : LEGACY_LASER_MODES.includes(editingMode ?? "")
          ? "legacy-laser"
          : "3d-print"
      : typeParam === "laser"
        ? "laser"
        : "3d-print"

  const printers3d = printers.filter((p) => !p.machine_type || p.machine_type === "3d-printer")
  const laserMachines = printers.filter((p) => p.machine_type === "laser" || p.machine_type === "sticker-printer")
```

4. Render the toggle above the template picker (hidden while editing), and route the three cases:

```tsx
          {!editingQuoteId && (
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
              <div className="inline-flex rounded-lg border border-border bg-card p-1 gap-1">
                <Button size="sm" variant={calcType === "3d-print" ? "default" : "ghost"}
                  onClick={() => router.push("/business")}>3D Print</Button>
                <Button size="sm" variant={calcType === "laser" ? "default" : "ghost"}
                  onClick={() => router.push("/business?type=laser")}>Laser &amp; Stickers</Button>
              </div>
            </div>
          )}
```

(Import `Button` from `@/components/ui/button`. Keep the template picker rendered only when `calcType === "3d-print"` — templates are a 3D-quote feature.)

Replace the single `<ExcelCalculator …/>` render with:

```tsx
          {calcType === "legacy-laser" && (
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
              <Card className="p-6 space-y-3">
                <h2 className="text-lg font-semibold">This quote uses the old laser format</h2>
                <p className="text-sm text-muted-foreground">
                  Quotes saved before the laser rework can still be viewed in history and as documents, but can't be
                  edited here. Start a fresh laser quote instead — your client is one click away.
                </p>
                <Button onClick={() => router.push("/business?type=laser")}>Start new laser quote</Button>
              </Card>
            </div>
          )}
          {calcType === "laser" && (
            <LaserCalculator
              mode="business"
              machines={laserMachines}
              materials={laserMaterials}
              globalSettings={globalSettings}
              clients={clients}
              editingQuoteId={editingQuoteId}
            />
          )}
          {calcType === "3d-print" && (
            <TooltipProvider>
              <ExcelCalculator
                mode="business"
                printers={printers3d}
                filaments={filaments}
                globalSettings={globalSettings}
                clients={clients}
                editingQuoteId={editingQuoteId}
                templateId={templateId}
              />
            </TooltipProvider>
          )}
```

5. While `editingQuoteId` is set but `editingQuote` hasn't loaded, keep showing `PageLoading` (add `|| (editingQuoteId && !editingQuote)` to the loading condition) so the wrong calculator never flashes.

- [ ] **Step 2: Apply the same changes to `app/personal/page.tsx`**

Same structure with `mode="personal"` and routes `/personal` / `/personal?type=laser`. (The personal page has no VAT and possibly no templates section — adapt to what's there; the toggle, data loading, and three-way routing are identical.)

- [ ] **Step 3: Verify**

Run: `pnpm build` — success.
Manual: toggle between calculators on `/business`; create a laser quote with a sheet material and a dimensioned vinyl (area) material; save; reopen from history → edit loads the laser calculator with state restored.

- [ ] **Step 4: Commit**

```bash
git add app/business/page.tsx app/personal/page.tsx
git commit -m "feat: calculator type toggle with laser edit routing and legacy banner"
```

---

### Task 10: Strip laser modes from the 3D calculator

**Files:**
- Modify: `components/excel-calculator.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ExcelCalculator` is 3D-print-only; saves `quote_type_mode: "3d-print"` always.

- [ ] **Step 1: Remove `calculatorType` and every laser branch**

Work through these anchors (verify each with grep before editing; line numbers drift):

1. Delete the state (~line 105–108): the `const [calculatorType, setCalculatorType] = useState<…>("3d-print")` block.
2. `availableFilaments` (~156): simplify to

```ts
  const availableFilaments = filaments.filter((f) => !f.material_type || f.material_type === "filament")
```

3. `computePartPrintingCost` (~482): delete the `if (calculatorType !== "3d-print") {…}` branch (keep only `partFilamentCost += (filament.price_per_kg * filamentEntry.grams) / 1000`), remove `calculatorType` from the `useCallback` deps, and update the comment above it to drop the laser sentence.
4. `partsLabel` / `batchesLabel` (~1038–1051): replace both ternaries with constants:

```ts
  const partsLabel = "Printed Parts (Filament Input)"
  const batchesLabel = "Dried Batches"
```

5. The 4-button mode toggle (~1240–1266): delete the whole wrapping element containing the four `setCalculatorType(…)` buttons (find via `grep -n "setCalculatorType" components/excel-calculator.tsx` — after this step that grep must return nothing).
6. Parts table (~1358–1363): unwrap `{calculatorType === "3d-print" && (<th …>Printer</th>)}` to render the `<th>` unconditionally; the Filament/Material header ternary becomes `Filament`. Do the same for the printer `<td>` cell wrapper (~1398).
7. Dried batches section (~1695–1698): remove the `calculatorType !== …` condition so the Card always renders. Also remove the `{/* Displaying all filaments as materials for non-3D print scenarios */}` comment if it survives.
8. Both save paths (~830 and ~961): `quote_type_mode: calculatorType` → `quote_type_mode: "3d-print"`.
9. Grep for any remaining reads: `grep -n "calculatorType" components/excel-calculator.tsx` must return nothing — the quote-loading/template effects (~250–430) may set it from saved data; delete those assignments.

- [ ] **Step 2: Verify**

Run: `pnpm build` and `grep -c "calculatorType\|laser" components/excel-calculator.tsx`
Expected: build succeeds; grep count 0.

Manual: `/business` 3D calculator computes and saves a normal 3D quote exactly as before.

- [ ] **Step 3: Commit**

```bash
git add components/excel-calculator.tsx
git commit -m "refactor: excel calculator is 3d-print only, drop x11 laser formula"
```

---

### Task 11: Detailed quote view — laser branch

**Files:**
- Modify: `app/quote/[id]/detailed/page.tsx`

**Interfaces:**
- Consumes: persisted `laser_items` fields from Task 8 (`material_name`, `machine_name`, `quantity`, `machine_minutes`, `cost_per_piece`, `sell_per_piece`, `line_sell`, `discount_pct`), plus quote-level `setup_fee`, `min_price_applied`, `min_price_adjustment`, `final_price`.
- Produces: laser quotes render an items table with per-piece figures; legacy laser quotes keep the existing weight-split fallback path untouched.

- [ ] **Step 1: Add a laser items section component** (top-level in the file, above the default export)

```tsx
function LaserItemsSection({ quote, money }: { quote: any; money: (n: number) => string }) {
  const items: any[] = quote.laser_items || []
  return (
    <section className="mb-12">
      <p className={sectionLabel}>Laser &amp; Sticker Items</p>
      <table className="w-full">
        <thead>
          <tr>
            <th className={th}>Item</th>
            <th className={th}>Material</th>
            <th className={th}>Machine</th>
            <th className={thRight}>Qty</th>
            <th className={thRight}>Cost / pc</th>
            <th className={thRight}>Sell / pc</th>
            <th className={thRight}>Line Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((it, i) => (
            <tr key={it.id || i}>
              <td className={td}>{it.name || "Unnamed item"}</td>
              <td className={tdMuted}>{it.material_name || "—"}</td>
              <td className={tdMuted}>{it.machine_name || "—"}{it.machine_minutes ? ` · ${it.machine_minutes} min/pc` : ""}</td>
              <td className={tdNum}>{Number(it.quantity) || 0}</td>
              <td className={tdNum}>{money(Number(it.cost_per_piece) || 0)}</td>
              <td className={tdNum}>
                {money(Number(it.sell_per_piece) || 0)}
                {Number(it.discount_pct) > 0 ? ` (−${it.discount_pct}%)` : ""}
              </td>
              <td className={tdNumStrong}>{money(Number(it.line_sell) || 0)}</td>
            </tr>
          ))}
          {Number(quote.setup_fee) > 0 && (
            <tr>
              <td className={td} colSpan={6}>Design / setup fee</td>
              <td className={tdNumStrong}>{money(Number(quote.setup_fee) || 0)}</td>
            </tr>
          )}
          {quote.min_price_applied && (
            <tr>
              <td className={td} colSpan={6}>Minimum job price adjustment</td>
              <td className={tdNumStrong}>{money(Number(quote.min_price_adjustment) || 0)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}
```

(`sectionLabel`, `th`, `thRight`, `td`, `tdMuted`, `tdNum`, `tdNumStrong` already exist at the top of the file. Define `money` in the page body as `const money = (n: number) => formatMoney(n, settings?.currency_symbol || "€")` if not already present.)

- [ ] **Step 2: Route laser quotes to it**

In the page render, where the printed-parts section renders (find the parts table heading via `grep -n "Printed Parts\|printed_parts.map\|parts table" app/quote/[id]/detailed/page.tsx` and inspect), wrap so `quote.quote_type_mode === "laser"` renders `<LaserItemsSection quote={quote} money={money} />` *instead of* the printed-parts and dried-batches sections. All other sections (labor, packaging, totals) stay shared. The loader's filament enrichment (~lines 107–170) must be skipped for laser quotes (guard with `if (data.quote_type_mode !== "laser" && data.printed_parts && …)`); laser items are already denormalized. Legacy laser modes take the existing non-3d fallback path untouched.

- [ ] **Step 3: Verify**

Run: `pnpm build` — success.
Manual: open a saved laser quote's detailed view — items, per-piece figures, setup fee and min-price lines render; a legacy laser quote (if present) still renders via the old path; a 3D quote is unchanged.

- [ ] **Step 4: Commit**

```bash
git add "app/quote/[id]/detailed/page.tsx"
git commit -m "feat: detailed quote view renders laser items with per-piece pricing"
```

---

### Task 12: Quotation document (PDF) — laser branch

**Files:**
- Modify: `components/quotation-document.tsx`

**Interfaces:**
- Consumes: same persisted quote fields as Task 11. `quote.final_price` is always set for laser quotes (authoritative, VAT-inclusive).
- Produces: laser quotes print an itemized document.

- [ ] **Step 1: Add the laser line-items rendering**

In `QuotationDocument`, add after the existing cost constants:

```tsx
  const isLaserQuote = quote.quote_type_mode === "laser"
  const laserItems: any[] = isLaserQuote ? quote.laser_items || [] : []
```

Then in the JSX, make the entire "Cost Breakdown" `<section>` conditional: keep the existing block for non-laser quotes, and for laser quotes render this instead (same `section` classes, before the Total bar which stays shared):

```tsx
            {isLaserQuote ? (
              <div className="divide-y divide-slate-100">
                {laserItems.map((it: any, i: number) => (
                  <div key={it.id || i} className="flex items-baseline justify-between gap-8 py-4">
                    <div>
                      <p className="text-slate-900">{it.name || "Unnamed item"} × {Number(it.quantity) || 0}</p>
                      <p className="text-sm text-slate-400 mt-0.5">
                        {it.material_name}{it.machine_name ? ` · ${it.machine_name}` : ""}
                        {Number(it.discount_pct) > 0 ? ` · ${it.discount_pct}% quantity discount` : ""}
                        {` · ${money(Number(it.sell_per_piece) || 0)} each`}
                      </p>
                    </div>
                    <p className="tabular-nums text-slate-900 whitespace-nowrap">{money(Number(it.line_sell) || 0)}</p>
                  </div>
                ))}
                {Number(quote.setup_fee) > 0 && (
                  <div className="flex items-baseline justify-between gap-8 py-4">
                    <div>
                      <p className="text-slate-900">Design &amp; setup fee</p>
                      <p className="text-sm text-slate-400 mt-0.5">Artwork preparation and machine setup</p>
                    </div>
                    <p className="tabular-nums text-slate-900 whitespace-nowrap">{money((Number(quote.setup_fee) || 0) * displayMultiplier)}</p>
                  </div>
                )}
                {(Number(quote.labor_cost) > 0 || Number(quote.packaging_cost) + Number(quote.fuel_cost) > 0) && (
                  <div className="flex items-baseline justify-between gap-8 py-4">
                    <div>
                      <p className="text-slate-900">Labor, Packaging &amp; Transport</p>
                      <p className="text-sm text-slate-400 mt-0.5">Included in the item prices above</p>
                    </div>
                    <p className="tabular-nums text-slate-400 whitespace-nowrap">included</p>
                  </div>
                )}
                {quote.min_price_applied && (
                  <div className="flex items-baseline justify-between gap-8 py-4">
                    <p className="text-slate-900">Minimum job price adjustment</p>
                    <p className="tabular-nums text-slate-900 whitespace-nowrap">{money(Number(quote.min_price_adjustment) || 0)}</p>
                  </div>
                )}
                {quote.is_emergency && emergencyFeeCost > 0 && (
                  <div className="flex items-baseline justify-between gap-8 py-4">
                    <p className="text-slate-900">Emergency Fee</p>
                    <p className="tabular-nums text-slate-900 whitespace-nowrap">{money(emergencyFeeCost)}</p>
                  </div>
                )}
                {vatApplies && (
                  <div className="flex items-baseline justify-between gap-8 py-4">
                    <p className="text-slate-900">VAT ({vatPercentLabel}%)</p>
                    <p className="tabular-nums text-slate-900 whitespace-nowrap">{money(vatAmount)}</p>
                  </div>
                )}
              </div>
            ) : (
              /* existing non-laser divide-y block, unchanged */
            )}
```

Also change the first Notes bullet for laser quotes: `This quotation includes all costs associated with the laser cutting, engraving and printing service, including materials, machine time, labor, packaging, and delivery.` (ternary on `isLaserQuote`).

The Total bar needs no change — `finalPrice` already prefers `quote.final_price`, which laser quotes always store.

- [ ] **Step 2: Verify**

Run: `pnpm build`. Manual: open a laser quote's document view (`/quote/<id>`), check line items, setup fee, min adjustment, VAT and total against the calculator summary; print preview looks sane; a 3D quote document is unchanged.

- [ ] **Step 3: Commit**

```bash
git add components/quotation-document.tsx
git commit -m "feat: quotation document renders laser line items, setup fee and min price"
```

---

### Task 13: History cards — laser badge and search

**Files:**
- Modify: `components/quote-history.tsx`

**Interfaces:**
- Consumes: `quote.quote_type_mode`, `quote.laser_items`.
- Produces: laser quotes are identifiable and searchable in history.

- [ ] **Step 1: Add a laser helper and badge**

Near the top of the component add:

```ts
  const isLaserQuote = (q: any) =>
    q.quote_type_mode === "laser" || ["laser-engraving", "laser-cutting", "stickers"].includes(q.quote_type_mode)
```

Where the quote card title renders (find via `grep -n "quote_name" components/quote-history.tsx` and pick the card header occurrence), append after the name:

```tsx
  {isLaserQuote(quote) && (
    <span className="ml-2 inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      Laser
    </span>
  )}
```

- [ ] **Step 2: Include laser item names in search**

In the search filter where `partNames` is built from `quote.printed_parts` (~line 503), extend:

```ts
      const laserNames = (quote.laser_items || [])
        .map((it: any) => it.name || "")
        .join(" ")
```

and include `laserNames` in the searched string alongside `partNames`.

- [ ] **Step 3: Verify, commit**

Run: `pnpm build`. Manual: history shows the Laser badge on new and legacy laser quotes; searching a laser item name finds the quote; status changes on a laser quote don't touch filament stock (laser quotes have empty `printed_parts`, so the stock-deduction path is naturally a no-op).

```bash
git add components/quote-history.tsx
git commit -m "feat: laser badge and item-name search in quote history"
```

---

### Task 14: Final verification sweep

**Files:** none new.

- [ ] **Step 1: Full test + lint + build**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all green. Fix anything that isn't.

- [ ] **Step 2: Manual E2E pass** (dev server `pnpm dev`, port 4001)

1. Settings: add a laser machine (type Laser), a sticker printer, three materials (per sheet with dimensions, per area, per piece), set minimums/setup fee/tiers.
2. Business → Laser & Stickers: build a quote with one item per pricing unit, qty 50 on one item (discount appears), watch min-price line on a tiny quote, target-price mode, save.
3. History: badge, search by item name, edit → calculator restores state, detailed view + PDF document correct.
4. 3D Print calculator: unchanged behavior, saves with `quote_type_mode: "3d-print"`.
5. Legacy laser quote (if one exists in storage): history renders, detailed view renders, edit shows the banner.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "fix: laser rework verification fixes"
```
