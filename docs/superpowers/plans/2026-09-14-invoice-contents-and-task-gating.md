# Selectable Invoice Contents + Calculator-Gated Task Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the operator choose Simple vs Detailed invoices and pick which billable items (tasks + shipping) to include; and gate production-task creation so calculator-supported types must be costed with their calculator while generic tasks use a simple manual form.

**Architecture:** Pure, tested helpers first (invoice-line builder, task-field rules), then the two dialog reworks in `components/orders/`. Builds on the committed Single/Dual + task-aware-invoice work (do NOT redo it).

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Vitest (`npx vitest run <path>` — NOT `npm test -- <path>`, which misfires here).

**Spec:** the user's mid-session message (2026-09-14): selectable invoice contents + production-task creation gating.

## Global Constraints

- Cancelled tasks (`status === "cancelled"`) never appear in billable items, invoice lines, or totals.
- Invoice line amounts are ex-VAT; `computeInvoiceTotals` applies the rate once (reuse existing `invoiceLinesFromTasks`/`taskExVatAmount` from `lib/orders/compute.ts`). No double VAT.
- Invoice `items` on the row ARE the snapshot — later order/task edits must not change an existing invoice (already true; do not add live recompute).
- Order billable charges available today: each non-cancelled task's `price`, and `order.shipping_cost` (only when `> 0`). There are no other order-level billable charges in the model.
- Default invoice format is **Simple** (ruling, per user).
- Calculator-supported task types: `3d_print`→3d, `laser_cut`/`laser_engrave`→laser, `uv_print`→uv (`calcKindForTaskType`). Generic types: `design`, `post_processing`, `assembly`, `packaging`, `delivery`, `other`.
- **Ruling (calc-type Add UX):** for calculator types the Add/Edit dialog shows name + quantity + type only and REQUIRES the matching calculator to set price/cost/duration/VAT/machine/material/colour/`calc_payload`; there is no manual price field and no plain "Add" for these types. Generic types show name, quantity, estimated duration, notes, optional charge — and never machine/material/colour. Cost if wrong: user wanted manual machine/material selectors on calc types too; visible and correctable.
- On task type change, clear fields invalid for the new type (machine/`printer_id`/`machine_name`/`material_name`/`material_color`/`calc_payload`, and manual `price` where the new type forbids it).
- `npx tsc --noEmit` and `npx next build` must pass before the branch is done. Only the pre-existing `lib/server-db/store.test.ts` top-level-await tsc error is allowed.

---

### Task 1: Invoice-line builder from a selection

**Files:**
- Modify: `lib/orders/compute.ts` (add after `invoiceLinesFromTasks`)
- Test: `lib/orders/compute.test.ts` (append)

**Interfaces:**
- Consumes: `activeTasks`, `taskExVatAmount`, `invoiceLinesFromTasks`, `round2`; `OrderTask`
- Produces:
  ```ts
  type InvoiceFormat = "simple" | "detailed"
  interface InvoiceLineInput { description: string; quantity: number; unit_price: number; amount: number }
  function buildInvoiceLines(opts: {
    tasks: readonly OrderTask[]      // the SELECTED tasks (helper still drops cancelled)
    format: InvoiceFormat
    orderTitle: string
    shipping?: { include: boolean; cost: number; label?: string }
  }): InvoiceLineInput[]
  ```

- [ ] **Step 1: Write the failing test**

Append to `lib/orders/compute.test.ts`:

```ts
import { buildInvoiceLines } from "./compute"

const t = (over: any) => ({
  id: over.id ?? "t", order_id: "o", name: over.name ?? "Task", type: "3d_print",
  status: over.status ?? "queued", quantity: over.quantity ?? 1, sequence: 0,
  price: over.price ?? null, calc_payload: over.calc_payload ?? null, created_at: "",
  material_name: over.material_name ?? null,
})

describe("buildInvoiceLines", () => {
  const tasks = [
    t({ id: "a", name: "Print body", price: 100, quantity: 2, calc_payload: { vat_enabled: false } }),
    t({ id: "b", name: "Engrave lid", price: 50, quantity: 1, calc_payload: { vat_enabled: false } }),
  ]

  it("detailed = one line per task", () => {
    const lines = buildInvoiceLines({ tasks, format: "detailed", orderTitle: "Order X" })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ description: "Print body", quantity: 2, amount: 100 })
    expect(lines[1]).toMatchObject({ description: "Engrave lid", quantity: 1, amount: 50 })
  })

  it("simple = one combined line summing ex-VAT task amounts", () => {
    const lines = buildInvoiceLines({ tasks, format: "simple", orderTitle: "Order X" })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ description: "Order X", quantity: 1, unit_price: 150, amount: 150 })
  })

  it("adds a separate shipping line when included", () => {
    const detailed = buildInvoiceLines({ tasks, format: "detailed", orderTitle: "Order X", shipping: { include: true, cost: 12.5 } })
    expect(detailed).toHaveLength(3)
    expect(detailed[2]).toMatchObject({ description: "Shipping", quantity: 1, unit_price: 12.5, amount: 12.5 })
    const simple = buildInvoiceLines({ tasks, format: "simple", orderTitle: "Order X", shipping: { include: true, cost: 12.5 } })
    expect(simple).toHaveLength(2) // one combined task line + shipping
    expect(simple[1].description).toBe("Shipping")
  })

  it("omits shipping when not included or zero", () => {
    expect(buildInvoiceLines({ tasks, format: "simple", orderTitle: "X", shipping: { include: false, cost: 12.5 } })).toHaveLength(1)
    expect(buildInvoiceLines({ tasks, format: "simple", orderTitle: "X", shipping: { include: true, cost: 0 } })).toHaveLength(1)
  })

  it("excludes cancelled tasks even if passed in", () => {
    const withCancelled = [...tasks, t({ id: "c", name: "Void", price: 999, status: "cancelled", calc_payload: { vat_enabled: false } })]
    expect(buildInvoiceLines({ tasks: withCancelled, format: "detailed", orderTitle: "X" })).toHaveLength(2)
    expect(buildInvoiceLines({ tasks: withCancelled, format: "simple", orderTitle: "X" })[0].amount).toBe(150)
  })

  it("no tasks + shipping only = shipping line only", () => {
    expect(buildInvoiceLines({ tasks: [], format: "simple", orderTitle: "X", shipping: { include: true, cost: 5 } }))
      .toEqual([{ description: "Shipping", quantity: 1, unit_price: 5, amount: 5 }])
  })
})
```

- [ ] **Step 2: Run the test — expect FAIL** (`npx vitest run lib/orders/compute.test.ts`) — `buildInvoiceLines` not exported.

- [ ] **Step 3: Implement**

Add to `lib/orders/compute.ts`:

```ts
export type InvoiceFormat = "simple" | "detailed"
export interface InvoiceLineInput { description: string; quantity: number; unit_price: number; amount: number }

/**
 * Compose invoice lines from a selection of tasks plus optional shipping.
 * Cancelled tasks are always excluded. Amounts are ex-VAT; a single invoice
 * VAT rate is applied later by computeInvoiceTotals.
 */
export function buildInvoiceLines(opts: {
  tasks: readonly OrderTask[]
  format: InvoiceFormat
  orderTitle: string
  shipping?: { include: boolean; cost: number; label?: string }
}): InvoiceLineInput[] {
  const active = activeTasks(opts.tasks)
  const lines: InvoiceLineInput[] = []
  if (active.length > 0) {
    if (opts.format === "detailed") {
      lines.push(...invoiceLinesFromTasks(active))
    } else {
      const amount = round2(active.reduce((s, t) => s + taskExVatAmount(t), 0))
      lines.push({ description: opts.orderTitle || "Production", quantity: 1, unit_price: amount, amount })
    }
  }
  if (opts.shipping?.include) {
    const cost = round2(Number(opts.shipping.cost) || 0)
    if (cost > 0) lines.push({ description: opts.shipping.label || "Shipping", quantity: 1, unit_price: cost, amount: cost })
  }
  return lines
}
```

- [ ] **Step 4: Run the test — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add lib/orders/compute.ts lib/orders/compute.test.ts
git commit -m "feat: invoice-line builder for simple/detailed + shipping selection"
```

---

### Task 2: Selectable contents in CreateInvoiceDialog

**Files:**
- Modify: `components/orders/order-financials-panel.tsx` (`CreateInvoiceDialog`, ~393-511)
- Test: covered by Task 1's pure builder; this is UI wiring (tsc + manual)

**Interfaces:**
- Consumes: `buildInvoiceLines`, `InvoiceFormat`, `taskVatState`, `taskVatRate`, `activeTasks`, `aggregateEstimatedMinutes`, `computeInvoiceTotals`, `round2`, `createInvoice`, `updateOrder`

- [ ] **Step 1: Add selection + format state**

At the top of `CreateInvoiceDialog` (replacing the fixed `lines` derivation), add:

```tsx
const active = activeTasks(tasks)
const shippingCost = round2(Number(order.shipping_cost) || 0)
const hasShipping = shippingCost > 0
const [format, setFormat] = useState<InvoiceFormat>("simple")
const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(active.map((t) => t.id)))
const [includeShipping, setIncludeShipping] = useState<boolean>(hasShipping)

const selectedTasks = active.filter((t) => selectedIds.has(t.id))
const lines = buildInvoiceLines({
  tasks: selectedTasks,
  format,
  orderTitle: order.title,
  shipping: { include: includeShipping, cost: shippingCost },
})
const nothingSelected = lines.length === 0
```

Keep `vatState`/`detectedRate`/`vatPct`/`productionMinutes`/`laborCost`/`totals` as they are, but base `productionMinutes`/`laborCost` on `selectedTasks` (snapshot only what's billed) and `totals = computeInvoiceTotals(lines, vatPct / 100)` (already recomputes live as selection changes).

- [ ] **Step 2: Render the format toggle + checklist**

Above the existing "Line items" preview, add:
- A Simple/Detailed segmented control bound to `format`.
- A "Billable items" checklist: a "Select all" checkbox (checked when every task id ∈ selectedIds AND (includeShipping || !hasShipping); toggling it selects/clears all tasks and shipping), then one row per `active` task (checkbox + name + `formatMoney(task.price ?? 0)`), then a Shipping row when `hasShipping` (checkbox + `formatMoney(shippingCost)`). Toggling a row updates `selectedIds`/`includeShipping`.
- Keep the existing live "Line items" preview (now driven by `lines`) and the Subtotal/VAT/Total box.

- [ ] **Step 3: Block empty + wire submit**

Disable the Create button when `nothingSelected`. In `submit()`, build items from `lines` (already ex-VAT) exactly as now; keep the VAT auto-detect + order-total sync logic unchanged (it already reads `vatState`/`vatPct`). The `items` stored on the invoice are the snapshot.

- [ ] **Step 4: Verify**

`npx tsc --noEmit` (no new errors). Reason through: unchecking all tasks + no shipping → button disabled; switching Simple/Detailed reshapes the preview and totals live; cancelled tasks never appear (they're not in `active`).

- [ ] **Step 5: Commit**

```bash
git add components/orders/order-financials-panel.tsx
git commit -m "feat: choose simple/detailed invoice and select billable items"
```

---

### Task 3: Task-field rules (pure helpers)

**Files:**
- Create: `lib/orders/task-fields.ts`
- Test: `lib/orders/task-fields.test.ts`

**Interfaces:**
- Consumes: `calcKindForTaskType` from `@/lib/orders/status`; `OrderTaskType`, `OrderTask`
- Produces:
  ```ts
  function taskRequiresCalculator(type: OrderTaskType | string): boolean
  // Fields to null out when a task's type changes so no stale machine/material/
  // colour/payload (and manual price for calc types) survives.
  function clearIncompatibleTaskFields(type: OrderTaskType | string): {
    printer_id: null; machine_name: null; material_id: null; material_name: null; material_color: null; calc_payload: null
  } | Record<string, never>
  ```

- [ ] **Step 1: Write the failing test**

Create `lib/orders/task-fields.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { taskRequiresCalculator, clearIncompatibleTaskFields } from "./task-fields"

describe("taskRequiresCalculator", () => {
  it("is true for machine types, false for generic", () => {
    for (const ty of ["3d_print", "laser_cut", "laser_engrave", "uv_print"]) expect(taskRequiresCalculator(ty)).toBe(true)
    for (const ty of ["design", "post_processing", "assembly", "packaging", "delivery", "other"]) expect(taskRequiresCalculator(ty)).toBe(false)
  })
})

describe("clearIncompatibleTaskFields", () => {
  it("clears machine/material/colour/payload for a generic type", () => {
    expect(clearIncompatibleTaskFields("design")).toEqual({
      printer_id: null, machine_name: null, material_id: null, material_name: null, material_color: null, calc_payload: null,
    })
  })
  it("clears the same fields for a calc type (payload is kind-specific — force re-cost)", () => {
    expect(clearIncompatibleTaskFields("laser_cut")).toEqual({
      printer_id: null, machine_name: null, material_id: null, material_name: null, material_color: null, calc_payload: null,
    })
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run lib/orders/task-fields.test.ts`).

- [ ] **Step 3: Implement**

Create `lib/orders/task-fields.ts`:

```ts
// Rules for which fields a production task of a given type may carry, and which
// to clear when its type changes. Pure + DOM-free (unit-tested).
import type { OrderTaskType } from "@/types/orders"
import { calcKindForTaskType } from "@/lib/orders/status"

/** Machine types (3D/laser/UV) must be costed with their calculator. */
export function taskRequiresCalculator(type: OrderTaskType | string): boolean {
  return calcKindForTaskType(type) !== null
}

/**
 * Fields to null out when a task changes type, so no stale machine/material/
 * colour/payload survives across an incompatible switch. Always clears the
 * machine/material/colour/payload set: a generic type must not keep them, and a
 * calc type's payload is kind-specific so it must be re-costed after the switch.
 */
export function clearIncompatibleTaskFields(_type: OrderTaskType | string) {
  return {
    printer_id: null,
    machine_name: null,
    material_id: null,
    material_name: null,
    material_color: null,
    calc_payload: null,
  } as const
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add lib/orders/task-fields.ts lib/orders/task-fields.test.ts
git commit -m "feat: pure task-field rules for calculator gating and type-change clearing"
```

---

### Task 4: AddTaskDialog — conditional fields + calculator gating

**Files:**
- Modify: `components/orders/order-tasks-panel.tsx` (`AddTaskDialog`, ~329-491)
- Test: rules covered by Task 3; this is UI (tsc + manual)

**Interfaces:**
- Consumes: `taskRequiresCalculator` from `@/lib/orders/task-fields`; `calcKindForTaskType`, `CALC_KIND_LABEL`; existing `createTask`, `onOpenCalc`

- [ ] **Step 1: Gate the form by type**

In `AddTaskDialog`, compute `const requiresCalc = taskRequiresCalculator(type)`. Render:
- Always: Name, Type, Quantity.
- When `requiresCalc` (3D/laser/UV): DO NOT render machine/material/colour, estimated-time, or Price inputs. Render the existing "Cost with full [X] calculator" button as the primary, REQUIRED action (it calls `onOpenCalc({ name, type, quantity })`, which opens the calculator that creates the task). Remove the "Add quick task" footer button for these types (or disable it) — the calculator is the only create path. Update the helper copy to say the calculator sets price/machine/material.
- When `!requiresCalc` (generic): render Name, Quantity, Estimated time, Notes, and an optional Charge (price) field. NO machine/material/colour. The footer "Add" button calls `submit()` (manual create) with `printer_id: null, machine_name: null, material_name: null` and no colour.

- [ ] **Step 2: Clear stale state on type change**

When `type` changes, reset the now-hidden inputs in local state (e.g. `setMaterial("")`, `setPrinterId("none")`, `setPrice(0)`, `setEstimate("")` as appropriate) so a value typed under one type cannot leak into a create of another. (Local-state hygiene mirrors `clearIncompatibleTaskFields`.)

- [ ] **Step 3: submit() for generic only**

`submit()` stays but is reachable only for generic types; it must send `printer_id: null, machine_name: null, material_name: null` (no machine/material/colour) and the optional `price`.

- [ ] **Step 4: Verify**

`npx tsc --noEmit` (no new). Manual reasoning: selecting 3D/laser/UV hides manual price + machine/material and shows a required calculator button (no plain Add); selecting a generic type shows the simple form with optional charge and no machine/material/colour.

- [ ] **Step 5: Commit**

```bash
git add components/orders/order-tasks-panel.tsx
git commit -m "feat: gate calculator task types in Add task, simple fields for generic"
```

---

### Task 5: EditTaskDialog — conditional fields + type-change clearing

**Files:**
- Modify: `components/orders/order-tasks-panel.tsx` (`EditTaskDialog`, ~493-628)
- Test: rules covered by Task 3; UI (tsc + manual)

**Interfaces:**
- Consumes: `taskRequiresCalculator`, `clearIncompatibleTaskFields`; existing `updateTask`, `onReCost`

- [ ] **Step 1: Gate the edit form**

Compute `const requiresCalc = taskRequiresCalculator(type)`. When `requiresCalc`: hide manual machine/material/colour and Price; keep Name, Type, Quantity, Notes, and the "Cost/Re-cost with calculator" button. When generic: Name, Type, Quantity, Estimated time, Notes, optional Charge; no machine/material/colour.

- [ ] **Step 2: Clear incompatible fields on type change at save**

When the saved `type` differs from `task.type`, spread `clearIncompatibleTaskFields(type)` into the `updateTask` patch so `printer_id`/`machine_name`/`material_id`/`material_name`/`material_color`/`calc_payload` are nulled. For a generic type also drop machine/material regardless. Keep `price` only where allowed (generic optional charge; calc types keep the calculator-set price unless type changed away, in which case a manual charge applies).

- [ ] **Step 3: Verify**

`npx tsc --noEmit` (no new). Manual reasoning: editing a 3D task shows no manual price/material; changing a task from `3d_print` to `design` and saving nulls its machine/material/colour/calc_payload; changing `design`→`laser_cut` hides manual fields and requires re-costing.

- [ ] **Step 4: Commit**

```bash
git add components/orders/order-tasks-panel.tsx
git commit -m "feat: gate calculator task types in Edit task, clear stale fields on type change"
```

---

### Task 6: Full verification

- [ ] **Step 1:** `npx vitest run` — all green (incl. new `buildInvoiceLines` + `task-fields` suites).
- [ ] **Step 2:** `npx next build` — clean.
- [ ] **Step 3:** Manual regression: create Simple and Detailed invoices; deselect a task and shipping; confirm totals track and empty selection disables Create; add a 3D/laser/UV task (calculator required, no manual price); add a generic task (no machine/material/colour); change a task's type and confirm stale machine/material/colour/payload clear.
- [ ] **Step 4:** Commit any fixups.
