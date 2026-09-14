# Single / Dual Calculator + VAT + Task-Aware Invoice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Personal/Business calculator split with a Single/Dual (owner-count) split, give both an optional editable 23% VAT, and make order invoices detect task VAT correctly and render as professional itemised documents.

**Architecture:** Pure logic first (naming/VAT helpers, owner-split helper, invoice tax-basis helpers) with unit tests, then decouple every legacy VAT gate onto the new helpers, then the three calculators (mode rename, VAT gate on `vatEnabled`, split gate on `dual`, editable rate, shared split helper), then UI consolidation to one `/calculator` page, then the orders invoice flow (auto-detect + order-total sync + labour snapshot + itemised document).

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Vitest (`npm test`), Supabase-shaped data layer (localStorage / node:sqlite / Supabase behind `lib/supabase/client`).

**Spec:** `docs/superpowers/specs/2026-09-14-single-dual-calculator-vat-invoice-design.md`

## Global Constraints

- `quote_type` stored values are `"single" | "dual"`; reads must accept legacy `"business"→dual`, `"personal"→single` via `normalizeOwnerMode`.
- VAT is independent of owner mode. Never gate VAT on `quote_type` again — use `quoteVatApplies`.
- Owner-split role assignment: **Owner A** = electricity + labour + fuel + setup fee; **Owner B** = materials/filament/ink + packaging + machine capital + VAT; profit & emergency split 50/50 (`PROFIT_SPLIT_RATIO`/`EMERGENCY_SPLIT_RATIO` from `lib/business-config.ts`, currently 0.5).
- Machine capital is attributed per machine by the `owner` field; unset owner defaults to Owner B (matches 3D lines 660/707).
- Invoice line amounts are always **ex-VAT**; `computeInvoiceTotals` applies the invoice rate exactly once. Cancelled tasks (`status === "cancelled"`) are excluded from VAT detection, line items, totals, and labour.
- Money rounding uses `round2` (cents).
- `owner_a_receives`/`owner_b_receives` stored only when `mode === "dual"`, else `null`.
- No DB migration (all rows are JSON documents; new invoice fields need no schema change).
- `npm run build` must pass before any PR.

---

### Task 1: Naming & VAT-applies helpers

**Files:**
- Modify: `lib/quote-modes.ts`
- Test: `lib/quote-modes.test.ts` (create)

**Interfaces:**
- Produces: `type OwnerMode = "single" | "dual"`; `normalizeOwnerMode(quoteType?: string | null): OwnerMode`; `quoteVatApplies(q: { vat_enabled?: boolean; quote_type?: string | null }): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/quote-modes.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { normalizeOwnerMode, quoteVatApplies } from "./quote-modes"

describe("normalizeOwnerMode", () => {
  it("maps legacy and new values", () => {
    expect(normalizeOwnerMode("business")).toBe("dual")
    expect(normalizeOwnerMode("dual")).toBe("dual")
    expect(normalizeOwnerMode("personal")).toBe("single")
    expect(normalizeOwnerMode("single")).toBe("single")
    expect(normalizeOwnerMode(undefined)).toBe("single")
    expect(normalizeOwnerMode("weird")).toBe("single")
  })
})

describe("quoteVatApplies", () => {
  it("honours the explicit flag regardless of owner mode", () => {
    expect(quoteVatApplies({ vat_enabled: true, quote_type: "single" })).toBe(true)
    expect(quoteVatApplies({ vat_enabled: false, quote_type: "dual" })).toBe(false)
  })
  it("falls back to legacy behaviour when the flag is absent", () => {
    expect(quoteVatApplies({ quote_type: "business" })).toBe(true)
    expect(quoteVatApplies({ quote_type: "personal" })).toBe(false)
    expect(quoteVatApplies({})).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/quote-modes.test.ts`
Expected: FAIL — `normalizeOwnerMode`/`quoteVatApplies` are not exported.

- [ ] **Step 3: Add the helpers**

Append to `lib/quote-modes.ts`:

```ts
export type OwnerMode = "single" | "dual"

/** Map any stored quote_type (including legacy personal/business) to an owner mode. */
export function normalizeOwnerMode(quoteType?: string | null): OwnerMode {
  if (quoteType === "dual" || quoteType === "business") return "dual"
  return "single"
}

/**
 * Whether a quote charges VAT — independent of owner mode. New rows always
 * store vat_enabled explicitly; legacy rows without it keep the historical
 * default (business charged VAT, personal did not).
 */
export function quoteVatApplies(q: { vat_enabled?: boolean; quote_type?: string | null }): boolean {
  if (q.vat_enabled === true) return true
  if (q.vat_enabled === false) return false
  return q.quote_type === "business"
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/quote-modes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/quote-modes.ts lib/quote-modes.test.ts
git commit -m "feat: add owner-mode and vat-applies quote helpers"
```

---

### Task 2: Shared owner-split helper

**Files:**
- Create: `lib/owner-split.ts`
- Test: `lib/owner-split.test.ts`

**Interfaces:**
- Consumes: `PROFIT_SPLIT_RATIO`, `EMERGENCY_SPLIT_RATIO` from `lib/business-config.ts`
- Produces:
  ```ts
  interface OwnerSplitBuckets {
    ownerAMachine: number; ownerBMachine: number; electricity: number
    ownerALabour: number; ownerBMaterials: number
    profit: number; emergency: number; vat: number
  }
  function computeOwnerSplit(b: OwnerSplitBuckets, profitRatio?: number, emergencyRatio?: number):
    { ownerAReceives: number; ownerBReceives: number }
  ```

- [ ] **Step 1: Write the failing test**

Create `lib/owner-split.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { computeOwnerSplit } from "./owner-split"

describe("computeOwnerSplit", () => {
  it("assigns each bucket to the correct owner and splits profit/emergency 50/50", () => {
    const r = computeOwnerSplit({
      ownerAMachine: 5, ownerBMachine: 15, electricity: 4,
      ownerALabour: 20, ownerBMaterials: 30, profit: 40, emergency: 10, vat: 25,
    })
    // A = 5 + 4 + 20 + 20(profit) + 5(emergency) = 54
    expect(r.ownerAReceives).toBe(54)
    // B = 15 + 30 + 20(profit) + 5(emergency) + 25(vat) = 95
    expect(r.ownerBReceives).toBe(95)
  })

  it("reproduces the current 3D formula for a worked example", () => {
    // Mirrors excel-calculator lines 827-843 with a concrete set of numbers.
    const ownerAMachine = 2, ownerBMachine = 3, electricity = 1.5, drying = 0.5
    const labor = 8, fuel = 2, filament = 6, materials = 4, packaging = 1.5
    const profit = 18, emergency = 6, vat = 12
    const r = computeOwnerSplit({
      ownerAMachine, ownerBMachine, electricity,
      ownerALabour: labor + fuel + drying,
      ownerBMaterials: filament + materials + packaging,
      profit, emergency, vat,
    })
    const expectedA = ownerAMachine + electricity + labor + fuel + drying + profit / 2 + emergency / 2
    const expectedB = ownerBMachine + filament + materials + packaging + profit / 2 + emergency / 2 + vat
    expect(r.ownerAReceives).toBeCloseTo(expectedA, 6)
    expect(r.ownerBReceives).toBeCloseTo(expectedB, 6)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/owner-split.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `lib/owner-split.ts`:

```ts
// Shared 50/50 owner-split rule used by the 3D, laser, and UV calculators when
// a quote is in Dual mode. Role assignment: Owner A = electricity + labour +
// fuel + setup (whatever the caller folds into ownerALabour); Owner B =
// materials/ink + packaging + machine capital + VAT. Profit and emergency are
// split by the configured ratios. Pure and DOM-free so it is unit-tested.

import { PROFIT_SPLIT_RATIO, EMERGENCY_SPLIT_RATIO } from "@/lib/business-config"

export interface OwnerSplitBuckets {
  /** Machine capital attributed to Owner A's machines (by machine owner). */
  ownerAMachine: number
  /** Machine capital attributed to Owner B's machines (default when owner unset). */
  ownerBMachine: number
  /** All electricity → Owner A. */
  electricity: number
  /** Owner A's cost pot: labour + fuel (+ drying for 3D, + setup for laser/UV). */
  ownerALabour: number
  /** Owner B's cost pot: materials/filament + ink + packaging. */
  ownerBMaterials: number
  /** Markup (sell ex-VAT minus base cost). Split by profitRatio. */
  profit: number
  /** Emergency fee. Split by emergencyRatio. */
  emergency: number
  /** VAT charged → Owner B. */
  vat: number
}

export function computeOwnerSplit(
  b: OwnerSplitBuckets,
  profitRatio: number = PROFIT_SPLIT_RATIO,
  emergencyRatio: number = EMERGENCY_SPLIT_RATIO,
): { ownerAReceives: number; ownerBReceives: number } {
  const ownerAReceives =
    b.ownerAMachine + b.electricity + b.ownerALabour +
    b.profit * profitRatio + b.emergency * emergencyRatio
  const ownerBReceives =
    b.ownerBMachine + b.ownerBMaterials +
    b.profit * (1 - profitRatio) + b.emergency * (1 - emergencyRatio) + b.vat
  return { ownerAReceives, ownerBReceives }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/owner-split.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/owner-split.ts lib/owner-split.test.ts
git commit -m "feat: shared owner-split helper for dual-mode quotes"
```

---

### Task 3: Laser electricity slice

**Files:**
- Modify: `lib/laser-pricing.ts`
- Test: `lib/laser-pricing.test.ts:end` (append)

**Interfaces:**
- Consumes: `machineCostPerHour`, `COST_BUFFER_FACTOR`, `LaserItem`, `LaserMachineLike`, `itemQty`, `itemMachineCost`
- Produces: `itemElectricityCost(item: LaserItem, machine: LaserMachineLike | undefined, electricityCostPerKwh: number): number` — the power-draw slice of `itemMachineCost` (so capital = `itemMachineCost - itemElectricityCost`).

- [ ] **Step 1: Write the failing test**

Append to `lib/laser-pricing.test.ts`:

```ts
import { itemElectricityCost, itemMachineCost, machineCostPerHour } from "./laser-pricing"

describe("itemElectricityCost", () => {
  const machine = {
    id: "m1", name: "Laser", printer_cost: 2000, additional_upfront_cost: 0,
    estimated_annual_maintenance: 100, estimated_life_years: 5,
    estimated_printer_uptime_percent: 0.5, average_power_consumption_watts: 1000,
  }
  const item = { id: "i", name: "x", quantity: 2, material_id: "", usage: 0, machine_id: "m1", machine_minutes: 30 }

  it("is the power-draw slice and never exceeds the machine cost", () => {
    const elec = itemElectricityCost(item, machine, 0.25)
    const total = itemMachineCost(item, machine, 0.25)
    expect(elec).toBeGreaterThan(0)
    expect(elec).toBeLessThanOrEqual(total + 1e-9)
    // Electricity slice matches the electricity term of the per-hour rate.
    const perHour = (1000 / 1000) * 0.25 * 1.3
    expect(elec).toBeCloseTo((30 / 60) * perHour * 2, 6)
  })

  it("is 0 without a machine", () => {
    expect(itemElectricityCost(item, undefined, 0.25)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/laser-pricing.test.ts`
Expected: FAIL — `itemElectricityCost` not exported.

- [ ] **Step 3: Implement the function**

Add to `lib/laser-pricing.ts` after `itemMachineCost` (≈ line 111):

```ts
/**
 * The power-draw slice of an item's machine cost — the part of itemMachineCost
 * that comes from the printer's wattage rather than depreciation. Buffered by
 * the same COST_BUFFER_FACTOR the machine rate uses so capital + electricity
 * still sum to exactly itemMachineCost.
 */
export function itemElectricityCost(
  item: LaserItem,
  machine: LaserMachineLike | undefined,
  electricityCostPerKwh: number,
): number {
  if (!machine) return 0
  const perHour = (pos(machine.average_power_consumption_watts) / 1000) * pos(electricityCostPerKwh)
  return (pos(item.machine_minutes) / 60) * perHour * COST_BUFFER_FACTOR * itemQty(item)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/laser-pricing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/laser-pricing.ts lib/laser-pricing.test.ts
git commit -m "feat: expose laser electricity slice for owner split"
```

---

### Task 4: Invoice tax-basis + VAT-state helpers

**Files:**
- Modify: `lib/orders/compute.ts`
- Test: `lib/orders/compute.test.ts` (append)

**Interfaces:**
- Consumes: `round2`, existing `computeInvoiceTotals`; `OrderTask` from `@/types/orders`
- Produces:
  ```ts
  type TaskVatState = "empty" | "all" | "none" | "mixed"
  function activeTasks(tasks: readonly OrderTask[]): OrderTask[]
  function taskVatState(tasks: readonly OrderTask[]): TaskVatState
  function taskExVatAmount(task: OrderTask): number
  function taskVatRate(tasks: readonly OrderTask[]): number | null  // uniform rate across VAT tasks, else null
  function invoiceLinesFromTasks(tasks: readonly OrderTask[]):
    Array<{ description: string; quantity: number; unit_price: number; amount: number }>
  ```

- [ ] **Step 1: Write the failing test**

Append to `lib/orders/compute.test.ts`:

```ts
import { taskVatState, invoiceLinesFromTasks, taskExVatAmount, activeTasks, computeInvoiceTotals } from "./compute"

const task = (over: any) => ({
  id: over.id ?? "t", order_id: "o", name: over.name ?? "Task", type: "3d_print",
  status: over.status ?? "queued", quantity: over.quantity ?? 1, sequence: 0,
  price: over.price ?? null, calc_payload: over.calc_payload ?? null, created_at: "",
})

describe("taskVatState", () => {
  it("classifies all/none/mixed/empty, ignoring cancelled tasks", () => {
    expect(taskVatState([])).toBe("empty")
    expect(taskVatState([task({ calc_payload: { vat_enabled: true } })])).toBe("all")
    expect(taskVatState([task({ calc_payload: { vat_enabled: false } })])).toBe("none")
    expect(taskVatState([task({ calc_payload: {} })])).toBe("none")
    expect(taskVatState([
      task({ id: "a", calc_payload: { vat_enabled: true } }),
      task({ id: "b", calc_payload: { vat_enabled: false } }),
    ])).toBe("mixed")
    expect(taskVatState([
      task({ id: "a", calc_payload: { vat_enabled: true } }),
      task({ id: "b", status: "cancelled", calc_payload: { vat_enabled: false } }),
    ])).toBe("all")
  })
})

describe("invoiceLinesFromTasks + computeInvoiceTotals", () => {
  it("does not double-charge VAT: a €100 VAT-inclusive task yields an €81.30 line", () => {
    const tasks = [task({ price: 100, quantity: 1, calc_payload: { vat_enabled: true, vat_rate: 0.23 } })]
    const lines = invoiceLinesFromTasks(tasks)
    expect(lines[0].amount).toBe(81.3) // 100 / 1.23 = 81.300... -> 81.30
    const totals = computeInvoiceTotals(lines, 0.23)
    expect(totals.subtotal).toBe(81.3)
    expect(totals.total).toBe(100.0) // 81.30 * 1.23 = 99.999 -> 100.00
  })

  it("passes ex-VAT task prices straight through", () => {
    const tasks = [task({ price: 50, quantity: 2, calc_payload: { vat_enabled: false } })]
    const lines = invoiceLinesFromTasks(tasks)
    expect(lines[0].amount).toBe(50)
    expect(lines[0].unit_price).toBe(25)
  })

  it("keeps item subtotal equal to the stored invoice subtotal (rounding + zero qty)", () => {
    const tasks = [
      task({ id: "a", price: 33.337, quantity: 3, calc_payload: { vat_enabled: false } }),
      task({ id: "b", price: 0, quantity: 0, calc_payload: { vat_enabled: false } }),
    ]
    const lines = invoiceLinesFromTasks(tasks)
    const totals = computeInvoiceTotals(lines, 0.23)
    const sumLines = lines.reduce((s, l) => s + l.amount, 0)
    expect(totals.subtotal).toBe(Math.round((sumLines + Number.EPSILON) * 100) / 100)
  })

  it("normalises a mixed set to ex-VAT per task's own rate", () => {
    const tasks = [
      task({ id: "a", price: 123, quantity: 1, calc_payload: { vat_enabled: true, vat_rate: 0.23 } }),
      task({ id: "b", price: 40, quantity: 1, calc_payload: { vat_enabled: false } }),
    ]
    const lines = invoiceLinesFromTasks(tasks)
    expect(lines[0].amount).toBe(100) // 123 / 1.23
    expect(lines[1].amount).toBe(40)
  })
})

describe("activeTasks", () => {
  it("drops cancelled tasks", () => {
    expect(activeTasks([task({ id: "a" }), task({ id: "b", status: "cancelled" })]).map(t => t.id)).toEqual(["a"])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/orders/compute.test.ts`
Expected: FAIL — new helpers not exported.

- [ ] **Step 3: Implement the helpers**

Add to `lib/orders/compute.ts` after `computeInvoiceTotals` (≈ line 130). Add `import type { OrderTask } from "@/types/orders"` to the existing type import block:

```ts
// ---------------------------------------------------------------------------
// Invoice line items derived from production tasks
// ---------------------------------------------------------------------------

export type TaskVatState = "empty" | "all" | "none" | "mixed"

/** Tasks that count toward billing — cancelled tasks are excluded everywhere. */
export function activeTasks(tasks: readonly OrderTask[]): OrderTask[] {
  return tasks.filter((t) => t.status !== "cancelled")
}

const taskChargedVat = (t: OrderTask): boolean => t.calc_payload?.vat_enabled === true

/** all = every active task charged VAT; none = zero did; mixed = some; empty = no active tasks. */
export function taskVatState(tasks: readonly OrderTask[]): TaskVatState {
  const active = activeTasks(tasks)
  if (active.length === 0) return "empty"
  const withVat = active.filter(taskChargedVat).length
  if (withVat === active.length) return "all"
  if (withVat === 0) return "none"
  return "mixed"
}

/** The uniform VAT rate across VAT-charging active tasks, or null if they differ / none charge. */
export function taskVatRate(tasks: readonly OrderTask[]): number | null {
  const rates = activeTasks(tasks)
    .filter(taskChargedVat)
    .map((t) => Number(t.calc_payload?.vat_rate) || 0)
  if (rates.length === 0) return null
  return rates.every((r) => r === rates[0]) ? rates[0] : null
}

/** A task's price with any VAT it charged backed out (ex-VAT). */
export function taskExVatAmount(task: OrderTask): number {
  const price = Number(task.price) || 0
  if (!taskChargedVat(task)) return price
  const rate = Number(task.calc_payload?.vat_rate) || 0
  return rate > 0 ? price / (1 + rate) : price
}

/** One ex-VAT invoice line per active task. Amounts are rounded to cents. */
export function invoiceLinesFromTasks(
  tasks: readonly OrderTask[],
): Array<{ description: string; quantity: number; unit_price: number; amount: number }> {
  return activeTasks(tasks).map((t) => {
    const amount = round2(taskExVatAmount(t))
    const qty = Number(t.quantity) || 0
    const unit_price = qty > 0 ? round2(amount / qty) : amount
    const desc = t.material_name ? `${t.name} — ${t.material_name}` : t.name
    return { description: desc, quantity: qty, unit_price, amount }
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/orders/compute.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/orders/compute.ts lib/orders/compute.test.ts
git commit -m "feat: task-derived ex-VAT invoice lines and VAT-state detection"
```

---

### Task 5: Decouple legacy VAT gates onto quoteVatApplies

**Files:**
- Modify: `lib/orders/compute.ts:145-163` (`quoteHeadlineTotals`)
- Modify: `components/quotation-document.tsx:86-90`
- Modify: `app/quote/[id]/invoice/page.tsx:121-125`
- Modify: `app/quote/[id]/detailed/page.tsx:363-367`
- Modify: `app/dashboard/page.tsx:44,53`
- Modify: `components/quote-history.tsx:86`
- Test: `lib/orders/compute.test.ts` (append)

**Interfaces:**
- Consumes: `quoteVatApplies`, `normalizeOwnerMode` from `@/lib/quote-modes`

- [ ] **Step 1: Write the failing test**

Append to `lib/orders/compute.test.ts`:

```ts
import { quoteHeadlineTotals } from "./compute"

describe("quoteHeadlineTotals VAT independence", () => {
  it("applies VAT for a single-mode quote with vat_enabled", () => {
    const q = { quote_type: "single", vat_enabled: true, vat_rate: 0.23, final_price: 123 }
    const r = quoteHeadlineTotals(q)
    expect(r.total).toBe(123)
    expect(r.subtotal).toBe(100)
    expect(r.vat).toBe(23)
  })
  it("charges no VAT for a dual-mode quote with vat disabled", () => {
    const q = { quote_type: "dual", vat_enabled: false, final_price: 100 }
    const r = quoteHeadlineTotals(q)
    expect(r.vat).toBe(0)
    expect(r.subtotal).toBe(100)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/orders/compute.test.ts`
Expected: FAIL — single-mode quote currently gets `vat === 0` because `quoteHeadlineTotals` gates on `quote_type === "business"`.

- [ ] **Step 3: Update quoteHeadlineTotals**

In `lib/orders/compute.ts`, add `import { quoteVatApplies } from "@/lib/quote-modes"` and replace lines 150–151:

```ts
  const vatApplies = quoteVatApplies(quote)
```

(delete the `const isBusiness = ...` line; keep `const vatRate = quote?.vat_rate ?? 0.23`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/orders/compute.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the document/analytics call sites**

Each currently reads `const isBusinessQuote = quote.quote_type === "business"` then `const vatApplies = isBusinessQuote && quote.vat_enabled !== false`. Replace both lines with a single `quoteVatApplies` call and import it from `@/lib/quote-modes`:

- `components/quotation-document.tsx` (86,90): `const vatApplies = quoteVatApplies(quote)`. Where the doc shows the owner split, gate it on `normalizeOwnerMode(quote.quote_type) === "dual"`.
- `app/quote/[id]/invoice/page.tsx` (121,125): `const vatApplies = quoteVatApplies(quote)`.
- `app/quote/[id]/detailed/page.tsx` (363,367): `const vatApplies = quoteVatApplies(quote)`; the owner-split section keys on `normalizeOwnerMode(quote.quote_type) === "dual"`.
- `app/dashboard/page.tsx` (44 and 53): replace both `q.quote_type === "business" && q.vat_enabled !== false` with `quoteVatApplies(q)`.
- `components/quote-history.tsx` (86): replace with `quoteVatApplies(quote)`.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no new errors.

```bash
git add lib/orders/compute.ts components/quotation-document.tsx "app/quote/[id]/invoice/page.tsx" "app/quote/[id]/detailed/page.tsx" app/dashboard/page.tsx components/quote-history.tsx lib/orders/compute.test.ts
git commit -m "refactor: gate quote VAT on quoteVatApplies, not owner mode"
```

---

### Task 6: Invoice snapshot fields on the type + creation input

**Files:**
- Modify: `types/orders.ts:309-336` (`Invoice`)
- Modify: `lib/orders/data.ts:897-941` (`CreateInvoiceInput`, `createInvoice`)
- Test: none (type + passthrough; covered by Task 7's behaviour and the build)

**Interfaces:**
- Produces: `Invoice.production_minutes?: number | null`, `Invoice.labor_cost?: number | null`; `CreateInvoiceInput.productionMinutes?`, `CreateInvoiceInput.laborCost?`

- [ ] **Step 1: Add the fields to the Invoice type**

In `types/orders.ts`, inside `Invoice` (after `total: number`, before `currency_symbol`):

```ts
  /** Snapshot of total production time (minutes) at issue, so the document never drifts. */
  production_minutes?: number | null
  /** Snapshot of total labour cost at issue. */
  labor_cost?: number | null
```

- [ ] **Step 2: Extend CreateInvoiceInput and createInvoice**

In `lib/orders/data.ts`, add to `CreateInvoiceInput`:

```ts
  productionMinutes?: number | null
  laborCost?: number | null
```

And in the `row: Invoice = { ... }` literal inside `createInvoice`, add:

```ts
    production_minutes: input.productionMinutes ?? null,
    labor_cost: input.laborCost ?? null,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add types/orders.ts lib/orders/data.ts
git commit -m "feat: persist labour + production-time snapshot on invoices"
```

---

### Task 7: createInvoice builds task line items + labour snapshot

**Files:**
- Modify: `lib/orders/data.ts:907-941` (`createInvoice`)
- Test: `lib/orders/data` is DB-coupled; test the pure pieces via Task 4 helpers. Add an integration-style check only if a data test harness exists (skip otherwise).

**Interfaces:**
- Consumes: `invoiceLinesFromTasks`, `activeTasks`, `aggregateEstimatedMinutes` from `@/lib/orders/compute`; `listTasks`/order tasks accessor already in `data.ts`
- Produces: `createInvoice` still returns `Invoice`; when `input.items` is empty it derives lines + labour from the order's active tasks.

- [ ] **Step 1: Locate the task accessor**

In `lib/orders/data.ts`, confirm the function that lists an order's tasks (search for `from("order_tasks")` or an exported `listTasks(orderId)`／`getTasks`). Use it below as `getOrderTasks(orderId)`.

- [ ] **Step 2: Derive lines + labour when items are not supplied**

At the top of `createInvoice`, after `const order = await getOrder(input.orderId)`:

```ts
  const tasks = await getOrderTasks(input.orderId)
  const active = activeTasks(tasks)
  const derivedLines = active.length > 0 ? invoiceLinesFromTasks(tasks) : null
  const sourceItems = input.items.length > 0 ? input.items : derivedLines ?? [
    { description: order?.title ?? "Order", quantity: 1, unit_price: 0 },
  ]
  const productionMinutes = input.productionMinutes ?? aggregateEstimatedMinutes(active)
  const laborCost = input.laborCost ?? round2(active.reduce((s, t) => s + (Number(t.calc_payload?.labor_cost) || 0), 0))
```

Change the `items` map to build from `sourceItems`, and set `production_minutes: productionMinutes`, `labor_cost: laborCost` in the row. Add the imports:

```ts
import { activeTasks, invoiceLinesFromTasks, aggregateEstimatedMinutes } from "@/lib/orders/compute"
```

(`round2` is already imported in `data.ts`.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/orders/data.ts
git commit -m "feat: createInvoice itemises tasks and snapshots labour"
```

---

### Task 8: 3D calculator — Single/Dual, VAT gate, editable rate, shared split

**Files:**
- Modify: `components/excel-calculator.tsx` (prop type 108; VAT gates 493,759-782; owner gates 953-954,1097-1098,2531+; split formula 819-843; save payload)
- Test: manual + build (component; logic parity covered by Task 2)

**Interfaces:**
- Consumes: `computeOwnerSplit` from `@/lib/owner-split`; `OwnerMode` from `@/lib/quote-modes`
- Produces: `ExcelCalculator` `mode: OwnerMode` ("single" | "dual")

- [ ] **Step 1: Change the mode type**

Line 108: `mode: "single" | "dual"`. Import `import type { OwnerMode } from "@/lib/quote-modes"` and use `OwnerMode` if preferred.

- [ ] **Step 2: Make VAT independent of mode**

Add editable rate state near the other VAT state:

```ts
const [vatRate, setVatRate] = useState<number>(globalSettings?.vat_rate ?? 0.23)
```

Replace every `mode === "business" && vatEnabled` with `vatEnabled` (lines 759, 763-768, 771-775, 780-782, 791). Delete the local `const vatRate = globalSettings?.vat_rate ?? 0.23` at line 754 (now state). On hydrate (lines 344, 433) also `setVatRate(quote.vat_rate ?? globalSettings?.vat_rate ?? 0.23)`. Line 493 blank-sheet default becomes `setVatEnabled(payload.vat_enabled !== undefined ? payload.vat_enabled : true)`.

- [ ] **Step 3: Render the editable rate input**

Beside the existing VAT toggle, add (shown whenever `vatEnabled`):

```tsx
{vatEnabled && (
  <input type="number" min={0} step="0.5" value={Math.round(vatRate * 10000) / 100}
    onChange={(e) => setVatRate((parseFloat(e.target.value) || 0) / 100)}
    className="w-20 rounded border border-border bg-card px-2 py-1 text-sm" aria-label="VAT %" />
)}
```

- [ ] **Step 4: Gate the owner split on dual and use the shared helper**

Replace the inline `ownerAReceives`/`ownerBReceives` (827-843) with:

```ts
const { ownerAReceives, ownerBReceives } = computeOwnerSplit({
  ownerAMachine: ownerAMachineCost,
  ownerBMachine: ownerBMachineCost,
  electricity: electricityCost,
  ownerALabour: totalLaborCost + fuelCost + totalDryingCost,
  ownerBMaterials: totalPrintingCost + totalMaterialsCost + totalPackagingCost,
  profit: totalProfit,
  emergency: emergencyFee,
  vat: vatAmountFromSellingPrice,
})
```

Owner panel visibility (2531+) and the save fields `owner_a_receives`/`owner_b_receives` (953-954, 1097-1098) gate on `mode === "dual"` instead of `mode === "business"`. Any remaining `mode === "business"` UI branch that showed margins (e.g. 1434, 2338) becomes unconditional (both modes have margins).

- [ ] **Step 5: Persist quote_type and vat_rate**

`quote_type: mode` (916, 1060) now stores `"single"|"dual"`. Ensure `vat_rate: vatRate` uses the state (957, 1101).

- [ ] **Step 6: Typecheck, build, manual check**

Run: `npx tsc --noEmit` then `npm run build`.
Manual: open `/calculator`, 3D, toggle Single/Dual — split panel shows only for Dual; toggle VAT off/on and edit the rate; totals update.

- [ ] **Step 7: Commit**

```bash
git add components/excel-calculator.tsx
git commit -m "feat: 3D calculator single/dual modes with independent editable VAT"
```

---

### Task 9: Laser calculator — Single/Dual, VAT gate, editable rate, split

**Files:**
- Modify: `components/laser-calculator.tsx` (mode prop; `vatApplies` 152; owner gate 363/480+; save payload)
- Test: manual + build

**Interfaces:**
- Consumes: `computeOwnerSplit`, `itemMachineCost`, `itemElectricityCost` from `@/lib/laser-pricing`

- [ ] **Step 1: Mode type + VAT independence**

Change the `mode` prop to `"single" | "dual"`. Line 152: `const vatApplies = vatEnabled` (drop `mode === "business"`). Add editable `vatRate` state initialised from `globalSettings?.vat_rate ?? 0.23` (and from `data.vat_rate` on hydrate at 241/286); feed `vatApplies ? vatRate : 0` into `computeLaserQuote` and the target-price effect instead of the read-only `vatRate`. Render the same VAT % input as Task 8 Step 3.

- [ ] **Step 2: Compute per-owner machine capital + electricity**

After `breakdown` is computed, add a memo:

```ts
const ownerMachine = useMemo(() => {
  let a = 0, b = 0, electricity = 0
  for (const it of items) {
    const machine = machinesById.get(it.machine_id)
    const total = itemMachineCost(it, machine, globalSettings?.electricity_cost_per_kwh ?? 0)
    const elec = itemElectricityCost(it, machine, globalSettings?.electricity_cost_per_kwh ?? 0)
    electricity += elec
    const capital = total - elec
    const owner = (machine?.owner ?? "").toLowerCase()
    if (owner === OWNER_A_KEY.toLowerCase()) a += capital
    else b += capital
  }
  return { a, b, electricity }
}, [items, machinesById, globalSettings])
```

Import `itemMachineCost`, `itemElectricityCost` from `@/lib/laser-pricing` and `OWNER_A_KEY` from `@/lib/business-config`. Note: `LaserMachineLike` has no `owner`; read it off the raw machine row (`machinesById` stores full rows), so cast as `any` for `.owner` or extend the local map to keep `owner`.

- [ ] **Step 3: Owner split (dual only)**

```ts
const profit = breakdown.sellExVat - breakdown.baseCost
const { ownerAReceives, ownerBReceives } = computeOwnerSplit({
  ownerAMachine: ownerMachine.a,
  ownerBMachine: ownerMachine.b,
  electricity: ownerMachine.electricity,
  ownerALabour: laborCost + fuelCost + breakdown.setupFee,
  ownerBMaterials: breakdown.materialCost + packagingCost,
  profit,
  emergency: emergencyFee,
  vat: breakdown.vatAmount,
})
```

Render an owner-split panel (mirror the 3D panel markup) only when `mode === "dual"`. Save `owner_a_receives`/`owner_b_receives` = `mode === "dual" ? ownerAReceives : null` (replace the hardcoded `null` at 363-364), and `quote_type: mode`, `vat_rate: vatRate`.

- [ ] **Step 4: Typecheck, build, manual check**

Run: `npx tsc --noEmit` then `npm run build`.
Manual: `/calculator` → Laser → Dual shows split summing to the total; Single hides it; VAT toggle + rate work.

- [ ] **Step 5: Commit**

```bash
git add components/laser-calculator.tsx lib/laser-pricing.ts
git commit -m "feat: laser calculator single/dual modes with owner split and editable VAT"
```

---

### Task 10: UV calculator — Single/Dual, VAT gate, editable rate, split

**Files:**
- Modify: `components/uv-calculator.tsx` (mode prop; `vatApplies` 140; owner gate 461/578+; save payload)
- Test: manual + build

**Interfaces:**
- Consumes: `computeOwnerSplit`; `breakdown.items[].machineCost`, `.electricityCost`, `.materialCost`, `.inkBilled`, `breakdown.overheadCost`

- [ ] **Step 1: Mode type + VAT independence**

Change `mode` to `"single" | "dual"`. Line 140: `const vatApplies = vatEnabled`. Add editable `vatRate` state (init from `globalSettings?.vat_rate`, and `data.vat_rate` on hydrate 220/257); feed `vatApplies ? vatRate : 0` into `computeUvQuote`. Render the VAT % input (as Task 8 Step 3).

- [ ] **Step 2: Per-owner machine capital**

```ts
const ownerMachine = useMemo(() => {
  let a = 0, b = 0
  for (const line of breakdown.items) {
    const machineRow = machinesById.get(items.find((it) => it.id === line.id)?.machine_id ?? "")
    const owner = ((machineRow as any)?.owner ?? "").toLowerCase()
    if (owner === OWNER_A_KEY.toLowerCase()) a += line.machineCost
    else b += line.machineCost
  }
  return { a, b }
}, [breakdown, items, machinesById])
```

`breakdown.electricityCost` is the total electricity (→ A). Labour = the sum of labour-kind operations; if not separately exposed, use `breakdown.operationsCost` as the labour pot (UV operations of kind "labour" are the labour; "cost" operations are consumables — acceptable to fold into A as labour/handling for this split, documented).

- [ ] **Step 3: Owner split (dual only)**

```ts
const profit = breakdown.sellExVat - breakdown.baseCost
const { ownerAReceives, ownerBReceives } = computeOwnerSplit({
  ownerAMachine: ownerMachine.a,
  ownerBMachine: ownerMachine.b,
  electricity: breakdown.electricityCost,
  ownerALabour: breakdown.operationsCost + fuelCost + breakdown.setupFee,
  ownerBMaterials: breakdown.materialCost + breakdown.inkCostBilled + packagingCost,
  profit,
  emergency: emergencyFee,
  vat: breakdown.vatAmount,
})
```

Render the owner-split panel only when `mode === "dual"`; save receipts `mode === "dual" ? ... : null` (replace the `null` at 461), `quote_type: mode`, `vat_rate: vatRate`.

- [ ] **Step 4: Typecheck, build, manual check**

Run: `npx tsc --noEmit` then `npm run build`.
Manual: `/calculator` → UV → Dual split vs Single; VAT toggle + rate.

- [ ] **Step 5: Commit**

```bash
git add components/uv-calculator.tsx
git commit -m "feat: uv calculator single/dual modes with owner split and editable VAT"
```

---

### Task 11: Consolidated /calculator page + redirects

**Files:**
- Create: `app/calculator/page.tsx`
- Rewrite: `app/personal/page.tsx`, `app/business/page.tsx` (redirects)
- Test: manual + build

**Interfaces:**
- Consumes: `resolveCalcType`, `normalizeOwnerMode`, `OwnerMode`; the three calculators with `mode: OwnerMode`

- [ ] **Step 1: Build the consolidated page**

Copy `app/business/page.tsx` to `app/calculator/page.tsx`. Change:
- `SiteHeader active="/calculator"`, title `"Calculator"`, description e.g. `"Cost and quote 3D prints, laser & sticker jobs, and UV prints — single owner or a two-owner split"`.
- Read `const ownerParam = searchParams.get("owner")`. Compute:
  ```ts
  const ownerMode: OwnerMode = editingQuote
    ? normalizeOwnerMode(editingQuote.quote_type)
    : ownerParam === "dual" ? "dual" : "single"
  ```
- Add a Single/Dual toggle (only when not editing) beside the 3D/Laser/UV type tabs, routing to `/calculator?owner=single|dual` (preserving `type`).
- Route the type tabs to `/calculator?...` and templates to `/calculator?template=...`.
- Pass `mode={ownerMode}` to `ExcelCalculator`, `LaserCalculator`, `UvCalculator`.

- [ ] **Step 2: Replace the old pages with redirects**

`app/personal/page.tsx` and `app/business/page.tsx` become:

```tsx
"use client"
import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageLoading } from "@/components/page-loading"

function Redirect({ owner }: { owner: "single" | "dual" }) {
  const router = useRouter()
  const params = useSearchParams()
  useEffect(() => {
    const q = new URLSearchParams(params.toString())
    if (!q.get("owner") && !q.get("edit")) q.set("owner", owner)
    router.replace(`/calculator?${q.toString()}`)
  }, [router, params, owner])
  return <PageLoading />
}

export default function Page() {
  // personal -> single ; business -> dual
  return <Suspense fallback={<PageLoading />}><Redirect owner="single" /></Suspense>
}
```

(business/page.tsx identical but `owner="dual"`.) When `?edit=` is present, drop the injected owner param so the editing quote's own mode wins.

- [ ] **Step 3: Build + manual check**

Run: `npm run build`.
Manual: `/calculator`, `/personal` → redirects to `/calculator?owner=single`, `/business` → `?owner=dual`; editing an old quote link still opens the right calculator.

- [ ] **Step 4: Commit**

```bash
git add app/calculator/page.tsx app/personal/page.tsx app/business/page.tsx
git commit -m "feat: consolidate calculators into /calculator with single/dual toggle"
```

---

### Task 12: Nav, landing, and quote-history wiring

**Files:**
- Modify: `components/site-header.tsx:7-8`
- Modify: `app/page.tsx:21-28,107-114,215-216`
- Modify: `components/quote-history.tsx:336-382,522-535,1043-1044,1215-1218,1304-1306`
- Test: manual + build

**Interfaces:**
- Consumes: `normalizeOwnerMode`

- [ ] **Step 1: Nav**

`components/site-header.tsx`: replace the two entries (7-8) with one:

```ts
{ href: "/calculator", label: "Calculator", icon: Calculator },
```

(remove the now-unused `Briefcase` import if nothing else uses it).

- [ ] **Step 2: Landing page**

`app/page.tsx`: point the two hero cards / links (21-28, 107-114) and footer links (215-216) at `/calculator` (single card labelled "Calculator", or keep two cards linking `?owner=single` and `?owner=dual` — choose one card to reduce clutter).

- [ ] **Step 3: quote-history routes + badge + convert**

- Edit route (382): `` const route = `/calculator?edit=${quote.id}&owner=${normalizeOwnerMode(quote.quote_type)}` `` (drop the personal/business branch).
- Empty-state buttons (~713/716): point at `/calculator` (one button, or `?owner=single`/`?owner=dual`).
- Badge (1043-1044): show `normalizeOwnerMode(quote.quote_type)` capitalised (`Single`/`Dual`); variant `default` when `dual`.
- `convertQuoteType` (522-535): compute `const current = normalizeOwnerMode(currentType); const newType = current === "single" ? "dual" : "single"`; update `quote_type: newType`; toast text uses those words. Leave `vat_enabled` untouched.
- Convert button labels/titles (1215-1218, 1304-1306): `Convert to {normalizeOwnerMode(quote.quote_type) === "single" ? "Dual" : "Single"}`.
- Owner-split display (1805): gate on `normalizeOwnerMode(quote.quote_type) === "dual" && Boolean(quote.owner_a_receives || quote.owner_b_receives)`.

- [ ] **Step 4: Build + manual check**

Run: `npm run build`.
Manual: nav shows one Calculator tab; history badges read Single/Dual; convert flips single↔dual and keeps VAT; edit opens `/calculator` with the right toggle.

- [ ] **Step 5: Commit**

```bash
git add components/site-header.tsx app/page.tsx components/quote-history.tsx
git commit -m "feat: wire nav, landing, and history to /calculator single/dual"
```

---

### Task 13: Task calculator dialog — single/dual toggle

**Files:**
- Modify: `components/orders/task-calculator-dialog.tsx:28,51-53,171-191,273-312`
- Test: manual + build

**Interfaces:**
- Consumes: `normalizeOwnerMode`; calculators with `mode: OwnerMode`

- [ ] **Step 1: Switch the toggle**

- Line 28: `type CalcMode = "single" | "dual"`.
- Initial state (51-53): `useState<CalcMode>(() => normalizeOwnerMode(task?.calc_payload?.quote_type))`.
- Toggle buttons (171-191): iterate `(["single", "dual"] as CalcMode[])`; label copy drops "at-cost"; description e.g. `dual ? "Dual — two-owner 50/50 split." : "Single — one owner."`.
- Pass `mode={calcMode}` to all three calculators (already wired, values change).

- [ ] **Step 2: Build + manual check**

Run: `npm run build`.
Manual: Orders → add task → Single/Dual toggle costs the task; editing a task built as business opens on Dual.

- [ ] **Step 3: Commit**

```bash
git add components/orders/task-calculator-dialog.tsx
git commit -m "feat: task calculator dialog single/dual toggle"
```

---

### Task 14: Invoice dialog VAT auto-detect + order-total sync

**Files:**
- Modify: `components/orders/order-financials-panel.tsx:39-66,257-264,381-475`
- Modify: `components/orders/order-detail.tsx` (pass `tasks` to `OrderFinancialsPanel`)
- Test: manual + build (logic covered by Task 4)

**Interfaces:**
- Consumes: `taskVatState`, `taskVatRate`, `invoiceLinesFromTasks`, `activeTasks`, `aggregateEstimatedMinutes` from `@/lib/orders/compute`; `createInvoice`, `updateOrder` from `@/lib/orders/data`
- Produces: `OrderFinancialsPanel` accepts `tasks: OrderTask[]`

- [ ] **Step 1: Thread tasks into the panel**

`order-detail.tsx`: pass `tasks={tasks}` to `<OrderFinancialsPanel ... />` (the component already loads `tasks`; confirm the variable name). Add `tasks: OrderTask[]` to `OrderFinancialsPanel`'s props and forward to `CreateInvoiceDialog`.

- [ ] **Step 2: Rework CreateInvoiceDialog**

Replace the single-line pre-fill with task-derived state:

```ts
const active = activeTasks(tasks)
const vatState = taskVatState(tasks)
const detectedRate = taskVatRate(tasks)
const lines = active.length > 0 ? invoiceLinesFromTasks(tasks) : [
  { description: order.title, quantity: 1, unit_price: order.subtotal ?? order.total ?? 0, amount: order.subtotal ?? order.total ?? 0 },
]
const [vatPct, setVatPct] = useState<number>(
  vatState === "all" ? Math.round((detectedRate ?? defaultVatRate) * 100) : 0,
)
const productionMinutes = aggregateEstimatedMinutes(active)
const laborCost = round2(active.reduce((s, t) => s + (Number(t.calc_payload?.labor_cost) || 0), 0))
const totals = computeInvoiceTotals(lines, vatPct / 100)
```

Render the line items (read-only list), the VAT % input, the live totals, and — when `vatState === "mixed"` — a warning note: *"Tasks disagree on VAT; lines were normalised to ex-VAT and the rate above is applied once."*

- [ ] **Step 3: Create + sync order total**

```ts
async function submit() {
  await createInvoice({
    orderId: order.id,
    items: lines.map(({ description, quantity, unit_price }) => ({ description, quantity, unit_price })),
    vatRate: vatPct / 100,
    currencySymbol: currency,
    externalReference: external.trim() || null,
    productionMinutes,
    laborCost,
  })
  // If the task base carried no VAT and the operator added VAT, the order total
  // must reflect the VAT-inclusive invoice figure (spec rule).
  if ((vatState === "none" || vatState === "mixed") && vatPct > 0) {
    await updateOrder(order.id, {
      total: totals.total, subtotal: totals.subtotal,
      vat_rate: vatPct / 100, vat_amount: totals.vatAmount, pricing_source: "manual",
    })
  }
  onOpenChange(false); onDone()
}
```

Import `updateOrder` (already imported in this file) and the compute helpers.

- [ ] **Step 4: Build + manual check**

Run: `npm run build`.
Manual: order with all-VAT tasks → invoice pre-fills the detected rate, total ≈ order total, order total unchanged; order with no-VAT tasks → VAT field 0, set 23% → invoice total = tasks×1.23 and the Financials Total updates to match; mixed → warning shown.

- [ ] **Step 5: Commit**

```bash
git add components/orders/order-financials-panel.tsx components/orders/order-detail.tsx
git commit -m "feat: invoice VAT auto-detection and order-total sync"
```

---

### Task 15: Professional itemised invoice document

**Files:**
- Modify: `app/orders/[id]/invoice/[invoiceId]/page.tsx:99-160`
- Test: manual + build

**Interfaces:**
- Consumes: `Invoice.production_minutes`, `Invoice.labor_cost`; `formatDuration` from `@/lib/orders/compute`

- [ ] **Step 1: Render stored labour + tidy layout**

The items table already maps `invoice.items` (now multiple task lines). After the totals block, add an informational labour/production summary from the stored snapshot:

```tsx
{(invoice.production_minutes || invoice.labor_cost) && (
  <div className="mt-6 rounded-md border border-slate-200 px-4 py-3 text-sm text-slate-600">
    <div className="flex justify-between"><span>Total production time</span><span>{formatDuration(invoice.production_minutes)}</span></div>
    <div className="flex justify-between"><span>Total labour</span><span>{money(invoice.labor_cost || 0)}</span></div>
  </div>
)}
```

Import `formatDuration`. Refine spacing/typography (heading weights, row padding) for a cleaner look; keep the existing letterhead, bill-to, totals box, paid/balance rows, and `@page`/print styles. Do not recompute labour from live tasks — use the stored fields so historical invoices never drift.

- [ ] **Step 2: Build + manual check**

Run: `npm run build`.
Manual: open an order invoice — each task is its own line; the labour summary shows the snapshot; print/PDF still lays out on A4.

- [ ] **Step 3: Commit**

```bash
git add "app/orders/[id]/invoice/[invoiceId]/page.tsx"
git commit -m "feat: itemised professional order invoice with labour summary"
```

---

### Task 16: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all green, including the new `quote-modes`, `owner-split`, `laser-pricing`, and `compute` cases.

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: clean (this is the pre-PR gate).

- [ ] **Step 3: Manual regression pass**

- Create a Single 3D quote with VAT 23% → document shows VAT, no owner split.
- Create a Dual 3D quote → owner receipts sum to the client total; VAT to Owner B.
- Repeat for Laser and UV.
- Open an old `business` quote from history → opens Dual; an old `personal` quote → Single.
- Convert a quote single↔dual in history → VAT unchanged.
- Order from all-VAT tasks → invoice detects rate, order total steady.
- Order from no-VAT tasks → add 23% VAT → order Total becomes the invoice total.
- Order invoice → itemised task lines + labour snapshot; print preview on A4.

- [ ] **Step 4: Commit any fixups, then stop for review**

```bash
git add -A && git commit -m "test: verify single/dual + invoice flows"
```
