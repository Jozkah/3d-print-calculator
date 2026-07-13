# Laser & Stickers Rework — Design

**Date:** 2026-07-13
**Status:** Approved approach A (dedicated calculator), sections approved in brainstorming.

## Problem

Laser engraving, laser cutting, and stickers are bolted onto the 3D-print calculator:

- Materials come from the `filaments` table (priced "per kg", which is physically wrong for sheets/rolls).
- The cost formula is `(price_per_kg + electricity) × 11` — a hardcoded magic multiplier that is the entire monetization model.
- The `laser_materials` table exists (schema + seed) but is never read by the calculator.
- The UI reuses 3D-print concepts ("Print Time", filament pickers), which is confusing.

Goal: a dedicated laser/sticker calculator with a real cost model (material consumed + machine time)
and explicit pricing levers (margin, minimum job price, setup fee, quantity discounts).

## Decisions made during brainstorming

1. **Cost driver:** material used + machine time (+ existing labor/packaging/fuel).
2. **Material entry:** per-material pricing unit — some materials sell by sheet, some by
   dimensions/area, some by length, some by piece. The job form adapts to the unit.
3. **Machine cost:** laser and sticker printer modeled like 3D printers (capital cost amortized
   over lifetime × 1.3 buffer + electricity) and shown in the fleet.
4. **Pricing levers:** margin % / target price (existing selector), minimum job price per quote
   type, one-time design/setup fee, quantity discount tiers.
5. **Structure:** approach A — dedicated `laser-calculator.tsx`; `excel-calculator.tsx` returns
   to 3D-print only. Engrave vs. cut vs. sticker is NOT a mode split anymore — it never affected
   cost. One quote type: `"laser"`.

## Data model

All storage is the localStorage data layer (`lib/local-db.ts`); "migrations" are read-time
upgrades, no SQL.

### `laser_materials` (new shape, replaces the dead table and the filament-table hack)

```ts
interface LaserMaterial {
  id: string
  name: string                 // "Plywood 3mm", "Glossy vinyl"
  color?: string | null        // optional swatch, mirrors filament UX
  pricing_unit: "sheet" | "area" | "length" | "piece"
  price: number                // €/sheet, €/cm², €/cm, or €/piece per pricing_unit
  sheet_width_cm?: number | null   // sheets only — enables W×H ⇄ sheet-fraction conversion
  sheet_height_cm?: number | null
  stock_qty?: number | null    // optional, same spirit as filament stock
  notes?: string | null
  created_at: string
  updated_at: string
}
```

Managed on a new settings page `/settings/materials`, styled like `/settings/filaments`.

### `printers` — machine type

Add `machine_type: "3d-printer" | "laser" | "sticker-printer"` (read-time default
`"3d-printer"` for existing rows). All existing amortization math and fleet UI reused.
The 3D calculator lists only `3d-printer`; the laser calculator lists `laser` and
`sticker-printer`.

### `global_settings` — pricing levers

```ts
laser_min_job_price: number      // default 15
sticker_min_job_price: number    // default 10
default_setup_fee: number        // default 5, pre-filled per quote, editable
qty_discount_tiers: { min_qty: number; discount_pct: number }[]
// default: [{min_qty: 10, discount_pct: 5}, {min_qty: 50, discount_pct: 10}]
```

Read-time seeding adds these fields to the existing settings row. The global settings form
gains a "Laser & Stickers" section.

### Quotes

Existing `quotes` table unchanged structurally. New quotes save `quote_type_mode: "laser"`;
items persist in the same parts JSON slot with the laser item shape (below). Legacy values
`"laser-engraving"`, `"laser-cutting"`, `"stickers"` remain readable.

## Calculator UX

Quote page top-level toggle: **3D Print** | **Laser & Stickers**. The laser side is a new
`components/laser-calculator.tsx`. Shared with the 3D side (reused, not duplicated): client
selector, distance/emergency/VAT card, labor table, packaging table, margin/target-price
section, save/draft/template flow, PDF generation entry point.

### Item row

```ts
interface LaserItem {
  id: string
  name: string
  quantity: number             // pieces of this item
  material_id: string          // from laser_materials
  usage: number                // per single piece, in the material's native unit:
                               //   sheet → sheets (0.25, 1.5 …)
                               //   area  → cm² (derived from a W×H input)
                               //   length → cm
                               //   piece → pieces of material
  usage_width_cm?: number      // area/sheet helper inputs (persisted so edit-reload restores them)
  usage_height_cm?: number
  machine_id: string           // laser or sticker-printer from printers table
  machine_minutes: number      // per single piece (minutes, not hours)
  item_cost?: number           // persisted computed cost, read by detailed view
}
```

- Material picker shows price in native unit ("Plywood 3mm — €8/sheet").
- Usage input adapts to `pricing_unit`. For sheet materials with stored dimensions, a
  "enter as W×H" helper converts dimensions → sheet fraction.
- Usage and machine minutes are per piece; the app multiplies by quantity.

### Pricing math (pure module `lib/laser-pricing.ts`)

```
material cost  = Σ items: usage × unit price × qty × material_efficiency_factor
machine cost   = Σ items: (machine_minutes / 60) × machine €/hr × qty
                 (machine €/hr = same amortization formula as printers, incl. electricity)
labor          = existing labor table (design time is a labor row)
packaging      = existing packaging table
fuel           = existing distance × consumption × fuel price
setup fee      = one-time per quote (pre-filled from default_setup_fee, editable, can be 0)
─────────────────────────────────────────────────────────────
base cost      = sum of the above
sell price     = margin % applied (or target-price mode) — existing selector semantics
qty discount   = per item: highest tier whose min_qty ≤ item qty reduces that item's
                 sell-side line by discount_pct
minimum price  = if final pre-VAT total < min job price for the quote's machine mix
                 (any sticker-printer item → sticker_min_job_price, else laser_min_job_price;
                 if both machine kinds appear, the higher minimum applies),
                 bump to the minimum and show "Minimum job price applied"
emergency fee, VAT = existing behavior
```

Summary panel additions: per-item **per-piece cost** and **per-piece sell price**.

### Error handling

- Negative/NaN inputs clamped at the boundary (min 0), consistent with existing inputs.
- Item missing a material or machine: inline warning on the row, contributes €0 —
  never silently guesses.
- Machine with 0 lifetime/uptime: cost/hr guards to 0 (same guard the 3D side has).

## Integration

- **History & detailed view:** laser quotes render item name, material, qty, per-piece
  price (instead of filament colors). Legacy laser/sticker quotes keep a small legacy
  renderer path; they are not editable in the new calculator — a banner offers
  "re-create as new laser quote".
- **PDF:** line items = item name, qty, unit price, line total; setup fee and
  "minimum job price adjustment" appear as their own lines when nonzero.
- **Migration (one-time, read-time in `local-db.ts`):** rows in `filaments` with
  `material_type !== 'filament'` are copied to `laser_materials` (pricing_unit `"sheet"`,
  price = old price_per_kg) and excluded from filament pickers. Nothing deleted.
- **Removal:** the 4-way mode toggle, the ×11 formula, and all laser conditionals leave
  `excel-calculator.tsx`.

## Testing

- Unit tests for `lib/laser-pricing.ts`: each pricing unit, waste factor, discount tier
  selection (boundary quantities), minimum-price bump (applies / doesn't / mixed machines),
  setup fee, margin vs. target-price mode.
- Unit tests for the filament→laser-material migration (runs once, idempotent).
- Component smoke test: adding an item of each pricing unit produces the expected total.
- Manual E2E: create, save, reload, PDF a laser quote; verify legacy quote still renders.

## Out of scope (explicitly)

- Product presets / product library (approach C) — possible phase 2.
- Nesting/layout optimization (computing how many parts fit a sheet).
- Ink cost modeling for the sticker printer beyond machine €/hr.
