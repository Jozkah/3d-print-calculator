# UV Printing Calculator — Design

**Date:** 2026-07-26
**Status:** Approved in brainstorming (third calculator tab, all sections approved).

## Problem

UV printing is a third production process with a cost structure neither existing calculator
models:

- **Ink is the dominant consumable** and is bought per colour. The printer's RIP reports how many
  ml of each of six inks (cyan, magenta, yellow, black, white, gloss) a job will use, plus how
  long it will take. Nothing in the app can turn ml-per-colour into money.
- **Ink is bought two ways.** An OEM kit currently costs €174.99 (list €299.99) and contains
  380 ml of cleaner plus 100 ml of each of the six colours. Cartridges are then refilled with
  cheaper third-party ink until the OEM cartridge's expiry date, at which point the kit is
  rebought. Cleaner never prints anything — it is nozzle maintenance.
- **A print run is not a piece.** Several copies are nested on the bed and the RIP report covers
  the whole run, so per-piece cost has to be derived from a run figure.
- **Work happens at three different frequencies.** File prep happens once per job, jig loading
  and curing happen once per run, wiping/priming happens once per piece. Neither existing
  calculator can express that.

Goal: a dedicated UV calculator with a real ink cost model, run-aware quantities, and work steps
that carry their own scope — sharing the app's existing margin/discount/VAT/document machinery.

## Decisions made during brainstorming

1. **Placement:** third tab, `3D Print | Laser & Stickers | UV Printing`, on `/business` and
   `/personal` (`?type=uv`). Own calculator component, own pure pricing module. Quote type `"uv"`.
2. **Ink pricing:** every colour carries **two** prices — OEM and refill. A per-colour, per-item
   checkbox selects which one was actually loaded. **The client is always billed as if OEM ink was
   used;** the refill price only ever affects internal cost and profit. The saving is the operator's
   margin, and it is never shown on a client-facing document.
3. **Cleaner cost:** folded into the ink €/ml by dividing the whole kit price by the *printing* ml
   only (6 × 100 ml → €0.2917/ml). Maintenance cost is then recovered exactly in proportion to how
   much is printed, with nothing extra to maintain.
4. **Run model:** each item carries `pieces_per_run` (default 1), so a one-off and a nested job use
   the same form. `runs = ceil(quantity / pieces_per_run)`.
5. **Partial runs:** ink and machine time are **pro-rata per piece**. The rounded-up run count only
   drives per-run operations. Charging a full run of ink for a 2-piece tail would bill 60 pieces of
   ink for a 50-piece job.
6. **Operations:** a flat list of named work steps, each with a **scope** — once per quote / per run
   / per piece — priced either as labour minutes × hourly rate or as a fixed €.
7. **Substrate:** a **separate** `uv_materials` catalogue, not shared with laser materials.
8. **Pricing levers:** mirror the laser calculator — margin mode and target-price mode, shared
   quantity discount tiers, a new UV minimum job price, setup fee, emergency fee, VAT, client
   selector, distance/fuel via the existing route dialog.

## Data model

Storage is the localStorage data layer (`lib/local-db.ts`); "migrations" are read-time upgrades,
no SQL.

### `uv_inks` (new table)

Six rows, seeded on first use. One row per colour channel.

```ts
interface UvInk {
  id: string
  color_key: "cyan" | "magenta" | "yellow" | "black" | "white" | "gloss"
  name: string                  // display label, editable
  hex: string                   // swatch colour for the form
  oem_price: number             // price of one OEM bottle/share
  oem_volume_ml: number         // ml that price buys
  refill_price?: number | null  // third-party refill; null = no refill available
  refill_volume_ml?: number | null
  sort_order: number
  created_at: string
  updated_at?: string
}
```

Derived, never stored:

```
oemPerMl(ink)    = oem_price / oem_volume_ml            // 0 if volume is 0
refillPerMl(ink) = refill_volume_ml > 0
                     ? refill_price / refill_volume_ml
                     : oemPerMl(ink)                    // blank refill falls back to OEM
```

Managed on `/settings/uv-inks`. The page includes a **"Fill from kit"** helper: enter kit price,
number of colours, and ml per colour, and it writes `oem_price = kitPrice / colours` and
`oem_volume_ml = mlPerColour` to every row. Cleaner volume is deliberately *not* part of the
denominator — that is what folds its cost into the printing ml. The resulting €/ml is displayed
next to each row so the number is never a black box.

### `uv_materials` (new table)

Same shape as `laser_materials`, deliberately a separate catalogue:

```ts
interface UvMaterial {
  id: string
  name: string
  color?: string | null
  pricing_unit: "sheet" | "area" | "length" | "piece"
  price: number                    // €/sheet, €/cm², €/cm, €/piece
  sheet_width_cm?: number | null
  sheet_height_cm?: number | null
  stock_qty?: number | null
  notes?: string | null
  created_at: string
  updated_at?: string
}
```

Managed on `/settings/uv-materials`, styled like `/settings/materials`.

### `printers` — machine type

Add `"uv-printer"` to the `machine_type` union and to the printer form's selector, with a "UV
printer" label in the fleet list. The €/hour figure reuses the existing capital-amortization +
electricity + 1.3 buffer formula — `machineCostPerHour` is **imported from `lib/laser-pricing.ts`**,
not reimplemented.

### `global_settings`

One new optional field, defaulted at every read site:

```ts
uv_min_job_price?: number   // default 15
```

Everything else is shared with the laser calculator: `default_setup_fee`, `qty_discount_tiers`,
`labor_hourly_rate`, `material_efficiency_factor`, `electricity_cost_per_kwh`, `vat_rate`,
`emergency_fee_fixed`, `fuel_cost_per_liter`, `car_fuel_consumption_per_100km`.

### Quote item shape

```ts
interface UvInkUsage {
  color_key: string
  ml_per_run: number      // straight from the RIP report
  use_refill: boolean     // affects internal cost only, never the billed price
}

interface UvItem {
  id: string
  name: string
  quantity: number          // pieces the client wants
  pieces_per_run: number    // how many copies fit on one bed; default 1
  machine_id: string
  minutes_per_run: number   // straight from the RIP report
  material_id: string | null   // null = none / customer-supplied
  usage: number                // material used per PIECE, in the material's native unit
  usage_width_cm?: number | null   // sheet-fraction helper, as on laser items
  usage_height_cm?: number | null
  ink: UvInkUsage[]
}
```

Material usage is **per piece** (one blank per piece; sheet stock priced per cm²), which keeps the
same mental model as laser items. Ink and machine time are the only per-run figures, because they
are the only ones the RIP reports per run.

### Operation shape

```ts
type UvOperationScope = "quote" | "run" | "piece"

interface UvOperation {
  id: string
  name: string                     // "File prep", "Jig load", "Alcohol wipe"
  kind: "labour" | "cost"
  minutes: number                  // kind "labour" — charged at labor_hourly_rate
  amount: number                   // kind "cost" — fixed € per occurrence
  scope: UvOperationScope
  item_id: string | null           // null = applies to every item in the quote
}
```

Occurrence count:

| scope   | `item_id` set             | `item_id` null                       |
|---------|---------------------------|--------------------------------------|
| `quote` | 1                         | 1                                    |
| `run`   | that item's `runs`        | Σ `runs` over all items              |
| `piece` | that item's `quantity`    | Σ `quantity` over all items          |

Unit cost is `minutes / 60 × labor_hourly_rate` for labour rows and `amount` for cost rows; the
row's total is unit cost × occurrences.

## Pricing math — `lib/uv-pricing.ts`

Pure functions, no React and no storage, unit-tested in `lib/uv-pricing.test.ts` — the same
contract `lib/laser-pricing.ts` follows. Every external number passes through the same
finite-and-positive guard.

### Per item

```
qty    = floor(quantity)
ppr    = max(1, floor(pieces_per_run))
runs   = ceil(qty / ppr)

inkBilled = Σ_colours (ml_per_run / ppr) × qty × oemPerMl(colour)
inkActual = Σ_colours (ml_per_run / ppr) × qty × (use_refill ? refillPerMl : oemPerMl)(colour)
machine   = (minutes_per_run / ppr) × qty / 60 × machineCostPerHour(machine, €/kWh)
material  = usage × price × qty × materialEfficiencyFactor
```

### Per quote

Two totals are computed in parallel over the same structure:

- **Billed cost** uses `inkBilled`. It drives everything client-facing: overhead allocation by
  direct-cost share, the margin multiplier `1 / (1 - margin/100)`, quantity discounts, the UV
  minimum job price, setup fee, emergency fee, and VAT — the exact pipeline
  `computeLaserQuote` uses.
- **Actual cost** uses `inkActual` and differs *only* in the ink term. It drives the internal
  profit figure.

Overhead pot = quote-scoped operations + packaging + fuel. Item-scoped operations (`run`/`piece`)
attach to their item's direct cost before allocation; operations with `item_id: null` are
distributed to the items they cover. Allocation shares are computed from **billed** costs so
client-facing line prices never move when the refill checkbox is toggled.

`UvQuoteBreakdown` extends the laser breakdown's fields with:

```ts
inkCostBilled: number
inkCostActual: number
inkSaving: number        // billed − actual, the operator's extra margin
actualBaseCost: number
actualProfit: number     // sellExVat − actualBaseCost
```

`inkSaving`, `actualBaseCost`, and `actualProfit` are rendered in the calculator's breakdown panel
only. They must never reach `quotation-document.tsx` or the detailed document.

## UI

### Calculator

`components/uv-calculator.tsx`, modelled on `laser-calculator.tsx` (client selector, margin /
target-price selector, distance + route dialog, emergency toggle, VAT toggle, breakdown panel,
save/edit). To respect the 800-line file rule it is split from the start:

- `components/uv-item-card.tsx` — one item: name, quantity, pieces-per-run (with a live
  `→ N runs` readout), machine, minutes-per-run, material + usage, and the six ink rows, each a
  swatch + ml field + "refill" checkbox.
- `components/uv-operations-table.tsx` — the operations list: name, kind, minutes/€, scope
  selector, item selector ("All items" default), and a computed row total.

The breakdown panel adds one internal-only block:

```
Ink (billed at OEM)   €12.40
Ink (actual)          €4.10
Extra margin from refill ink  €8.30
```

### Settings

- `/settings/uv-inks` — six rows with OEM price/volume, refill price/volume, a derived €/ml
  readout per row, and the "Fill from kit" helper.
- `/settings/uv-materials` — catalogue CRUD, mirroring `/settings/materials`.
- Global settings form gains the UV minimum job price field.
- Printer form/list gain the `uv-printer` type.

### Pages

`app/business/page.tsx` and `app/personal/page.tsx` gain a third toggle button, load `uv_inks` and
`uv_materials`, filter `uvMachines` by `machine_type === "uv-printer"`, and route `?type=uv` to
`UvCalculator`. Both `business` and `personal` modes are supported, as with laser.

## Persistence

The quote row uses the existing shape:

- `quote_type_mode: "uv"`
- `uv_items` — denormalized per item: name, quantity, pieces_per_run, runs, ink ml per colour,
  cost per piece, sell per piece, line sell (so historical quotes render without the catalogues).
- `uv_operations` — denormalized operations with their resolved occurrence counts and totals.
- `uv_ink_cost` (billed) and `uv_ink_cost_actual`.
- Existing cost columns (`materials_cost`, `machine_cost`, `labor_cost`, `packaging_cost`,
  `fuel_cost`, `emergency_fee`, `landed_cost`, VAT fields) are populated as laser quotes do.
- `final_price` remains authoritative for target-price quotes.

Downstream surfaces:

- `quote-history.tsx` — **UV** badge, item count from `uv_items`, item names in search.
- `quotation-document.tsx` and `app/quote/[id]/detailed/page.tsx` — render UV lines. Ink detail and
  the actual-vs-billed figures never appear.
- **Templates are wired in from day one.** `UvCalculator` accepts `templateId` and both pages pass
  it, and "Save as template" is enabled for UV quotes. (The laser calculator's missing template
  support is a known gap; it is not repeated here.)

## Refactor in scope

`LEGACY_LASER_MODES` and the calc-type resolution are currently copy-pasted across
`app/business/page.tsx`, `app/personal/page.tsx`, and `components/quote-history.tsx`. A third mode
makes that worse, so they move to `lib/quote-modes.ts`:

```ts
export const LEGACY_LASER_MODES: string[]
export type CalcType = "3d-print" | "laser" | "uv" | "legacy-laser"
export function resolveCalcType(args: {
  editingQuoteId?: string
  editingQuoteMode?: string
  typeParam?: string | null
}): CalcType
```

Nothing else is refactored.

## Error handling

- Every numeric input passes through the finite-and-positive guard; bad input costs 0, never NaN.
- A missing machine, material, or ink row contributes 0 to cost rather than throwing — matching
  laser behaviour for quotes whose catalogue rows were later deleted.
- `pieces_per_run` is clamped to ≥ 1, so a blank or zero field behaves as a one-off.
- Ink rows with `oem_volume_ml === 0` yield €0/ml and surface an inline warning on the settings
  page ("set a volume to price this ink"), because a silently free ink would under-quote.
- Catalogue load failures surface through the existing `PageLoadError` path.

## Testing

`lib/uv-pricing.test.ts` (vitest, `pnpm test`) covers:

- €/ml derivation, including the kit case (€174.99 / 600 ml = €0.2917/ml) and the blank-refill
  fallback to OEM.
- Refill selection changes actual cost but leaves billed cost, line sell, and the quote total
  untouched.
- Pro-rata partial runs: 50 pieces at 12 per run bills 50 pieces of ink and 5 runs of per-run
  operations.
- Operation scopes, including `item_id: null` fan-out across items.
- Margin mode vs target-price mode, quantity discounts, minimum job price, emergency fee, VAT.
- Zero/missing catalogue rows and zero quantities produce 0, not NaN.

Component behaviour is verified manually in the running app, as with the laser rework.
