# Single / Dual calculator + VAT + professional invoice — design

Date: 2026-09-14
Status: Approved for planning (revised after code review; owner-split allocation confirmed — setup fee → Owner A)

## Summary

Replace the Personal / Business calculator distinction with a **Single / Dual**
owner-count distinction, give both modes an optional (editable) 23% VAT, make
order invoices detect the VAT state of their production tasks automatically, and
rework the order invoice into a professional itemised document that snapshots
what it billed.

## Motivation

The current `mode` axis (`"personal" | "business"`) conflates two unrelated
concerns: at-cost-vs-margin, and whether profit is split between two owners. The
owner no longer wants an at-cost mode — every quote is a sell price. What varies
is **how many people share the profit**, so the axis should describe owner
count, and VAT should be an independent toggle available in both cases.

## Concept remap

| Old | New | Behaviour |
|-----|-----|-----------|
| Business | **Dual** | margin + optional VAT + 50/50 owner (A/B) profit & emergency split |
| Personal | **Single** | margin + optional VAT, **no** owner split |

- Both modes always apply a margin (the old at-cost path is removed).
- VAT is an independent on/off toggle in both modes, with an editable rate that
  defaults to `globalSettings.vat_rate` (0.23).

## Naming & back-compat helpers (`lib/quote-modes.ts`)

`quote_type` now stores `"single" | "dual"`. Two pure helpers centralise every
interpretation so no call site hard-codes a string:

```ts
export type OwnerMode = "single" | "dual"

/** Map any stored quote_type (incl. legacy) to an owner mode. */
export function normalizeOwnerMode(quoteType?: string | null): OwnerMode {
  if (quoteType === "dual" || quoteType === "business") return "dual"
  return "single" // "single", "personal", or unknown
}

/**
 * Whether a quote charges VAT — independent of owner mode.
 * New rows always store vat_enabled explicitly. Legacy rows without the flag
 * keep the historical default: business charged VAT, personal did not.
 */
export function quoteVatApplies(q: { vat_enabled?: boolean; quote_type?: string | null }): boolean {
  if (q.vat_enabled === true) return true
  if (q.vat_enabled === false) return false
  return q.quote_type === "business" // legacy rows only
}
```

**This decouples VAT from owner mode** — the critical review blocker. Every
place that currently gates VAT on `quote_type === "business" && vat_enabled !==
false` switches to `quoteVatApplies(quote)`; every place that shows the owner
split switches to `normalizeOwnerMode(quote_type) === "dual"`.

Legacy-gate call sites to convert (all confirmed in code):

| File | Line | Change |
|------|------|--------|
| `lib/orders/compute.ts` (`quoteHeadlineTotals`) | 150–151 | `vatApplies` → `quoteVatApplies`; `isBusiness` drop |
| `components/quotation-document.tsx` | 86, 90 | `quoteVatApplies`; owner display via `normalizeOwnerMode` |
| `app/quote/[id]/invoice/page.tsx` | 121, 125 | `quoteVatApplies` |
| `app/quote/[id]/detailed/page.tsx` | 363, 367 | `quoteVatApplies`; owner split display |
| `app/dashboard/page.tsx` | 44, 53 | `quoteVatApplies` in both revenue helpers |
| `components/quote-history.tsx` | 86, 1805 | `quoteVatApplies`; owner display via `normalizeOwnerMode` |

Historical documents still render from their stored `final_price`
(VAT-inclusive when saved), so no total drifts.

## Owner-split rule — one shared, tested helper

Today the 50/50 split exists only in the 3D calculator, as an inline formula;
laser and UV store `owner_a_receives`/`owner_b_receives` as `null`. Per decision,
Dual splitting is implemented for **all three** calculators.

Extract the rule into `lib/owner-split.ts`:

```ts
export interface OwnerSplitBuckets {
  ownerAMachine: number   // machine cost attributed to Owner A's machines
  ownerBMachine: number   // machine cost attributed to Owner B's machines
  electricity: number     // all → Owner A
  ownerALabour: number    // labour + fuel (+ drying for 3D, setup for laser/UV) → Owner A
  ownerBMaterials: number  // materials/filament + ink + packaging → Owner B
  profit: number          // split 50/50
  emergency: number       // split 50/50
  vat: number             // → Owner B
}
export function computeOwnerSplit(b: OwnerSplitBuckets, profitRatio = PROFIT_SPLIT_RATIO,
  emergencyRatio = EMERGENCY_SPLIT_RATIO): { ownerAReceives: number; ownerBReceives: number }
```

Role assignment (mirrors the existing 3D arrangement — **A = labour / energy /
logistics, B = materials / machine capital / VAT**):

| Cost bucket | Owner |
|-------------|-------|
| Machine capital | by each machine's `owner` field |
| Electricity | Owner A (all) |
| Drying (3D only) | Owner A (all) |
| Labour (labor items / labour operations) | Owner A |
| Fuel | Owner A |
| Setup fee (laser / UV only) | Owner A |
| Materials / filament / substrate | Owner B |
| Ink (UV only) | Owner B |
| Packaging | Owner B |
| Profit | 50/50 |
| Emergency fee | 50/50 |
| VAT | Owner B |

- **3D** (`excel-calculator.tsx`): refactor the inline `ownerAReceives` /
  `ownerBReceives` (lines 827–843) to feed `computeOwnerSplit`. A unit test
  asserts the existing worked example produces byte-identical receipts, so no
  historical 3D quote changes.
- **Laser** (`laser-calculator.tsx`): `machineCost` currently bundles capital +
  electricity. Add `itemElectricityCost` to `lib/laser-pricing.ts` (mirroring the
  UV function that already exists) so the machine bucket splits into capital
  (by machine owner) and electricity (→ A). Feed `laborCost`, `fuelCost`,
  `setupFee` → A; `materialCost`, `packagingCost` → B; profit
  (`sellExVat − baseCost`), emergency, VAT as above.
- **UV** (`uv-calculator.tsx`): buckets already separate — `machineCost`
  (capital, by owner), `electricityCost` (→ A), labour operations (→ A),
  `materialCost` + `inkCostBilled` + packaging (→ B), fuel (→ A), setup (→ A).
- Machine-owner attribution reuses the 3D approach: sum each item's machine cost
  into A or B by the machine row's `owner` (default Owner B when unset, matching
  3D line 660/707).
- All three store `owner_a_receives` / `owner_b_receives` only when
  `mode === "dual"`, else `null` (unchanged for Single).

## VAT control in the calculators

`mode` prop type changes from `"personal" | "business"` to `"single" | "dual"`
in all three calculators. Gate changes:

- **Margin + VAT maths/UI**: re-gate the VAT parts on `vatEnabled` alone (drop
  `mode === "business"`, e.g. excel-calculator 759–782, laser 152, uv 140);
  margins always shown.
- **Owner-split panel + receipt storage**: re-gate from `mode === "business"` to
  `mode === "dual"` (excel-calculator 953–954/1097–1098/2531+, laser 363/480+,
  uv 461/578+).
- **Editable VAT rate**: add a `vatRate` state initialised from the quote
  payload (`vat_rate`) or `globalSettings.vat_rate ?? 0.23`, rendered as a small
  numeric input beside the VAT toggle, persisted in the save payload (field
  already stored). All three calculators get the same control; pricing maths use
  this state instead of reading `globalSettings.vat_rate` directly.
- **Blank-sheet VAT default**: replace `mode === "business"` fallbacks
  (excel-calculator 493) with `true`.

## UI consolidation

New page `app/calculator/page.tsx` merges the two existing pages, keeping the
3D / Laser / UV **type** tabs and adding a **Single / Dual** owner toggle.

- Owner mode carried in the URL as `?owner=single|dual`; default `single`.
- Editing an existing quote sets the toggle from
  `normalizeOwnerMode(quote.quote_type)` (URL param ignored that session, as
  `resolveCalcType` already pins type when editing).
- `app/personal/page.tsx` and `app/business/page.tsx` become thin client
  redirects to `/calculator`, preserving all query params (`edit`, `template`,
  `type`) so old bookmarks and deep links keep working.
- `components/site-header.tsx`: the two nav entries collapse into one
  `Calculator` entry → `/calculator`.
- `app/page.tsx`: landing cards + footer links point at `/calculator`.
- `components/quote-history.tsx`:
  - edit route (line 382) → `/calculator?edit=<id>&owner=<normalized>`.
  - empty-state buttons (~713/716) → `/calculator`.
  - the type **badge** (1043) shows the normalized owner mode label
    (`Single`/`Dual`).
  - the **convert** control (`convertQuoteType`, 522; buttons 1215/1304) toggles
    `single ↔ dual` instead of `personal ↔ business`, leaving `vat_enabled`
    untouched (VAT is now independent of owner mode).

### Task calculator dialog

`components/orders/task-calculator-dialog.tsx`: `CalcMode` and its toggle become
`single | dual`; initial state derives from
`normalizeOwnerMode(task.calc_payload?.quote_type)`; the "at-cost" copy is
removed.

## Invoice VAT auto-detection & correct tax basis (orders)

**Critical fix — no double VAT.** Task `price` is VAT-inclusive whenever that
task charged VAT. Invoice line amounts must therefore be **ex-VAT**, and
`computeInvoiceTotals` applies the single invoice rate exactly once.

New pure helpers in `lib/orders/compute.ts` (unit-tested):

```ts
type TaskVatState = "empty" | "all" | "none" | "mixed"

// Cancelled tasks are excluded from every calculation below.
function activeTasks(tasks): OrderTask[]           // status !== "cancelled"
function taskVatState(tasks): TaskVatState          // by calc_payload?.vat_enabled === true
function taskExVatAmount(task): number              // price / (1 + rate) when the task charged VAT, else price
function invoiceLinesFromTasks(tasks): { description; quantity; unit_price; amount }[]
//   amount = round2(taskExVatAmount(task)); unit_price = amount / max(1, quantity)
```

`CreateInvoiceDialog` (`order-financials-panel.tsx`) receives the order's tasks
(passed from `order-detail.tsx`, which already loads them) and behaves by state:

- **all** — every active task charged VAT, so lines are each task's ex-VAT
  amount and the invoice VAT field defaults to the tasks' rate (uniform → that
  rate; non-uniform → `defaultVatRate`, with a note). Invoice total reconstructs
  to ≈ the order total (already VAT-inclusive). **Order total unchanged.**
- **none** — lines are the task prices as-is (already ex-VAT). VAT field starts
  at `0`. If the operator sets a rate > 0, the invoice total becomes
  `subtotal × (1 + rate)`, and on create the order's stored `total`, `subtotal`,
  `vat_rate`, `vat_amount` update to the invoice figure and `pricing_source`
  flips to `"manual"` (so the task aggregator does not overwrite it back).
- **mixed** — each line normalised to ex-VAT via *its own* stored rate; the
  chosen invoice rate is applied once on the combined ex-VAT subtotal; a warning
  note explains tasks disagreed on VAT; order total syncs to the invoice figure
  as in **none**.
- **empty** — fall back to the current single order-title line.

Because `computeInvoiceTotals` derives `subtotal` as the sum of the (already
ex-VAT) line amounts, **item subtotal always equals the stored invoice
subtotal** by construction — the invariant the review asked to prove.

## Professional invoice document with a stored snapshot

**High fix — snapshot labour, don't recompute.** Add two persisted fields so a
historical invoice never drifts when tasks later change:

- `types/orders.ts` `Invoice`: `production_minutes?: number | null`,
  `labor_cost?: number | null`.
- `CreateInvoiceInput` and `createInvoice` (`lib/orders/data.ts`): accept and
  store them, computed at creation from active tasks —
  `production_minutes = Σ estimated_minutes`,
  `labor_cost = Σ (calc_payload?.labor_cost ?? 0)`.

`createInvoice` builds line items from `invoiceLinesFromTasks` (falling back to
the single order-title line when there are no active tasks).

`app/orders/[id]/invoice/[invoiceId]/page.tsx`:

- Renders the itemised task lines (already in `invoice.items`).
- Adds a labour / production summary from the **stored**
  `production_minutes` (via `formatDuration`) and `labor_cost` — informational,
  below the totals, not a billed line (task prices already include labour).
- Tidies letterhead/spacing/typography for a cleaner look; keeps the A4 print
  styling and paid/balance rows. No new dependencies.

## Files touched (≈14)

- `lib/quote-modes.ts` — `OwnerMode`, `normalizeOwnerMode`, `quoteVatApplies`.
- `lib/owner-split.ts` (new) + `lib/owner-split.test.ts` — shared split helper.
- `lib/laser-pricing.ts` — add `itemElectricityCost`.
- `lib/orders/compute.ts` — VAT-state + ex-VAT line helpers; `quoteVatApplies`
  in `quoteHeadlineTotals`.
- `lib/orders/data.ts` — `createInvoice` task lines + labour snapshot fields.
- `types/orders.ts` — invoice snapshot fields.
- `components/excel-calculator.tsx`, `components/laser-calculator.tsx`,
  `components/uv-calculator.tsx` — mode type, gate changes, editable VAT rate,
  `computeOwnerSplit`.
- `app/calculator/page.tsx` (new); `app/personal/page.tsx`,
  `app/business/page.tsx` (redirects).
- `components/site-header.tsx`, `app/page.tsx` — links/nav.
- `components/quote-history.tsx` — routes, badge, convert control, VAT gate.
- `components/orders/task-calculator-dialog.tsx` — single/dual toggle.
- `components/orders/order-financials-panel.tsx` — VAT auto-detect + order-total
  sync; receives tasks.
- `components/orders/order-detail.tsx` — pass tasks to the financials panel.
- `app/orders/[id]/invoice/[invoiceId]/page.tsx` — itemised layout + labour.
- Legacy-gate doc call sites listed in the table above.

No database migration: all columns exist (`invoices` rows are JSON documents in
the local/shared/Supabase layers, so the two new fields need no schema change);
only the stored `quote_type` string values change, handled by
`normalizeOwnerMode` / `quoteVatApplies` on read.

## Testing

Pure-function unit tests (extend `lib/orders/compute.test.ts`, new
`lib/owner-split.test.ts`, `lib/quote-modes` tests):

- `normalizeOwnerMode`: `business→dual`, `personal→single`, `single/dual`
  passthrough, unknown→single.
- `quoteVatApplies`: explicit true/false win; legacy `business`→true,
  `personal`/absent→false.
- `taskVatState`: `all` / `none` / `mixed` / `empty`, with cancelled tasks
  excluded.
- `invoiceLinesFromTasks` + `computeInvoiceTotals`: **item subtotal === stored
  invoice subtotal** for all/none/mixed, including cent-rounding and
  zero-quantity lines; and no-double-VAT (a €100 VAT-inclusive task at 23% yields
  a line of €81.30 and a total of €100, not €123).
- Order-total sync: none/mixed + rate > 0 sets order total to the VAT-inclusive
  invoice total; all leaves it unchanged.
- `computeOwnerSplit`: 3D worked-example parity (receipts identical to the
  current inline formula); laser and UV bucket allocation; A/B sum equals client
  ex-VAT + VAT.

Manual: Single vs Dual 3D/laser/UV quotes with VAT on/off and a custom rate
(Dual shows the split panel, Single hides it); edit an old `business`/`personal`
quote and confirm the toggle restores; build orders from tasks with all/none/
mixed VAT and confirm invoice detection, correct tax basis, and order-total
behaviour; render an invoice and confirm task line items + labour snapshot.

`npm run build` clean before any PR.

## Out of scope

- No change to the underlying cost maths (machine/electricity/material/ink/
  drying formulas) beyond exposing the laser electricity slice.
- No change to the quote (non-order) document at `app/quote/[id]/invoice`
  beyond the VAT-gate decoupling.
- No renaming of the stored `owner` keys or `business-config.ts` split ratios.
