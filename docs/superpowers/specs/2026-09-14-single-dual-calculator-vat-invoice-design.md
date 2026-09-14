# Single / Dual calculator + VAT + professional invoice — design

Date: 2026-09-14
Status: Approved for planning

## Summary

Replace the Personal / Business calculator distinction with a **Single / Dual**
owner-count distinction, give both modes an optional (editable) 23% VAT, make
order invoices detect the VAT state of their production tasks automatically, and
rework the order invoice into a professional itemised document.

## Motivation

The current `mode` axis (`"personal" | "business"`) conflates two unrelated
concerns:

1. Whether the quote is priced at cost or with a margin.
2. Whether profit is split between two owners.

The owner does not want an at-cost mode any more — every quote is a sell price.
What actually varies is **how many people share the profit**. So the axis should
describe owner count, and VAT should be an independent toggle available in both
cases.

## Concept remap

| Old | New | Behaviour |
|-----|-----|-----------|
| Business | **Dual** | margin + optional VAT + 50/50 owner (A/B) profit & emergency split |
| Personal | **Single** | margin + optional VAT, **no** owner split |

- Both modes always apply a margin (the old at-cost path is removed).
- VAT is an independent on/off toggle in both modes, with an editable rate that
  defaults to `globalSettings.vat_rate` (0.23).

### Stored value & back-compat

`quote_type` now stores `"single" | "dual"`.

Reads must remain backward compatible with existing rows:

- `"business"` is treated as `"dual"`.
- `"personal"` is treated as `"single"`.

A helper normalises this in one place:

```ts
// lib/quote-modes.ts
export type OwnerMode = "single" | "dual"
export function normalizeOwnerMode(quoteType?: string | null): OwnerMode {
  if (quoteType === "dual" || quoteType === "business") return "dual"
  return "single" // "single", "personal", or anything else
}
```

Historical quote/invoice documents keep rendering from their stored
`final_price` (VAT-inclusive when it was saved), so no total ever drifts. Old
`"personal"` quotes were saved without VAT and without a margin recomputation
path we rely on — they continue to render exactly as stored.

## Calculator changes

Affected components: `components/excel-calculator.tsx`,
`components/laser-calculator.tsx`, `components/uv-calculator.tsx`.

The `mode` prop type changes from `"personal" | "business"` to
`"single" | "dual"`.

Gate changes:

- **Margin + VAT maths and UI**: currently gated on `mode === "business"`.
  Re-gate on `vatEnabled` alone for the VAT parts; margins are always shown.
  (Lines such as excel-calculator `759–775`, laser/uv `vatApplies`.)
- **Owner-split panel and `owner_a_receives` / `owner_b_receives` storage**:
  re-gate from `mode === "business"` to `mode === "dual"` (excel-calculator
  `953–954`, `1097–1098`, `2531+`; equivalent blocks in laser/uv).
- **VAT default when hydrating a blank sheet**: replace
  `mode === "business"` fallbacks (e.g. excel-calculator `493`) with `true`
  (VAT on by default) — the toggle then lets the user turn it off.

### Editable VAT rate

Today the rate is read-only from `globalSettings.vat_rate`. Add a `vatRate`
state initialised from the quote payload (`vat_rate`) or `globalSettings.vat_rate
?? 0.23`, rendered as a small numeric input next to the existing VAT toggle, and
persisted in the save payload (`vat_rate` already exists). All three calculators
get the same control.

## UI consolidation

New page `app/calculator/page.tsx` merges the two existing pages. It keeps the
3D / Laser / UV **type** tabs and adds a **Single / Dual** owner toggle.

- Owner mode is carried in the URL as `?owner=single|dual` so edit links and
  deep links restore it. Default `single`.
- When editing an existing quote, the owner toggle is set from
  `normalizeOwnerMode(quote.quote_type)` and the URL param is ignored for that
  session (mirrors how `resolveCalcType` pins the type when editing).
- `app/personal/page.tsx` and `app/business/page.tsx` become thin client
  redirects to `/calculator`, preserving all query params (`edit`, `template`,
  `type`). This keeps old bookmarks and any saved deep links working.
- `components/site-header.tsx`: the two nav entries (`Personal`, `Business`)
  collapse into one `Calculator` entry pointing at `/calculator`.
- Link updates: `app/page.tsx` (landing cards + footer links),
  `components/quote-history.tsx` (edit route at line 382 and the two empty-state
  buttons ~713/716) point to `/calculator`. The quote-history edit route adds
  `?owner=` derived from `normalizeOwnerMode`.

### Task calculator dialog

`components/orders/task-calculator-dialog.tsx` currently exposes a
`business | personal` toggle. It becomes a `single | dual` toggle. Its
`CalcMode` type and the initial state (derived from
`task.calc_payload.quote_type` via `normalizeOwnerMode`) change accordingly, and
the descriptive copy is updated (no more "at-cost").

## Invoice VAT auto-detection (orders)

`CreateInvoiceDialog` in `components/orders/order-financials-panel.tsx` receives
the order's tasks (passed down from `order-detail.tsx`, which already loads
them).

Detect the VAT state across the order's task `calc_payload`s:

```ts
const withVat = tasks.filter(t => t.calc_payload?.vat_enabled === true)
const state =
  tasks.length === 0 ? "none" :
  withVat.length === tasks.length ? "all" :
  withVat.length === 0 ? "none" : "mixed"
```

Behaviour by state:

- **all** — task prices are already VAT-inclusive, so the order total already
  includes VAT. Default the invoice VAT rate to the tasks' rate
  (`calc_payload.vat_rate`, else `defaultVatRate`) and back the subtotal out of
  the order total. **Order total unchanged.**
- **none** — task prices are ex-VAT. The invoice VAT field starts at `0`. If the
  user enters a VAT %, the invoice total becomes `taskSum × (1 + rate)`, and on
  create the order's stored `total`, `subtotal`, `vat_rate`, `vat_amount` are
  updated so the Financials panel shows the VAT-inclusive invoice figure.
- **mixed** — treat the base as ex-VAT (like `none`) and show a warning note
  that tasks disagree on VAT, so the operator can review.

The order-total sync (the `none`/`mixed` case) happens in `submit()` after
`createInvoice`, via `updateOrder(order.id, { total, subtotal, vat_rate,
vat_amount, pricing_source: "manual" })`. Switching `pricing_source` to
`"manual"` freezes the total at the invoice figure (otherwise the task
aggregator would overwrite it back to the ex-VAT sum).

## Professional invoice document

`createInvoice` (`lib/orders/data.ts`) and the order invoice page
(`app/orders/[id]/invoice/[invoiceId]/page.tsx`) change so an invoice itemises
production tasks instead of a single order-title line.

- **Line items**: one per production task — description = task name (with
  material/qty context where available), quantity = task quantity, unit price =
  `task.price / quantity` (fallback: whole `task.price`), amount = `task.price`.
  When there are no tasks, fall back to the current single order-title line.
- **Labour summary**: show total production time (sum of `estimated_minutes`
  across non-cancelled tasks, via `formatDuration`) and a total labour cost (sum
  of `calc_payload.labor_cost`, `0` when absent). Rendered as an informational
  block below the totals, not as a billed line (task prices already include
  labour).
- **Layout**: keep the existing letterhead, bill-to, totals box, paid/balance
  rows, and A4 print styling; tidy spacing/typography for a cleaner look. No new
  dependencies.

The invoice VAT rate and totals continue to come from the stored invoice row
(`computeInvoiceTotals`), so the document stays a faithful snapshot.

## Files touched (≈10)

- `lib/quote-modes.ts` — add `OwnerMode` + `normalizeOwnerMode`.
- `components/excel-calculator.tsx`, `components/laser-calculator.tsx`,
  `components/uv-calculator.tsx` — mode type, gate changes, editable VAT rate.
- `app/calculator/page.tsx` — new consolidated page.
- `app/personal/page.tsx`, `app/business/page.tsx` — redirects.
- `components/site-header.tsx` — nav entry.
- `app/page.tsx` — landing/footer links.
- `components/quote-history.tsx` — edit route + empty-state buttons.
- `components/orders/task-calculator-dialog.tsx` — single/dual toggle.
- `components/orders/order-financials-panel.tsx` — VAT auto-detect + order-total
  sync; receives tasks.
- `components/orders/order-detail.tsx` — pass tasks to the financials panel.
- `lib/orders/data.ts` — `createInvoice` builds task line items + labour summary.
- `app/orders/[id]/invoice/[invoiceId]/page.tsx` — itemised professional layout.

No database migration: all fields already exist; only the stored `quote_type`
string values change, handled by `normalizeOwnerMode` on read.

## Testing

- Unit (`lib/orders/compute.test.ts` + new cases): VAT-state detection
  (`all` / `none` / `mixed`), and order-total sync when VAT is added to an
  ex-VAT task base.
- `normalizeOwnerMode` mapping (`business→dual`, `personal→single`,
  `single/dual` passthrough).
- Manual: create Single and Dual 3D quotes with VAT on/off and a custom rate;
  confirm the Dual owner split shows and Single hides it; edit an old
  `business`/`personal` quote and confirm the toggle restores correctly; build
  an order from tasks with/without VAT and confirm invoice detection + order
  total behaviour; render the invoice and confirm task line items + labour
  summary.
- `npm run build` clean before any PR.

## Out of scope

- No change to the underlying cost maths (machine/electricity/material/drying).
- No change to the quote (non-order) document at `app/quote/[id]/invoice`.
- No renaming of the stored `owner` keys or `business-config.ts` split ratios.
