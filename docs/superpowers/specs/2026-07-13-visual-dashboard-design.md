# Visual Dashboard Redesign — "Print Shop OS"

**Date:** 2026-07-13
**Status:** Proposed
**Branch:** `local-storage-no-supabase`

## Problem

The app works, but it reads as a wall of select boxes, dropdowns and gray cards.
Printers, filaments and clients — all physical, colorful, photographable things —
are represented as text in `<Select>` menus. The user wants a unique, visual,
image-rich identity: "more images, more colors, everything."

## Direction (chosen from 3 candidates)

**"Print Shop OS" — a Bambu-Lab-inspired workshop identity, rebuilt for a data app.**

Rejected alternatives:
- *Incremental polish* (keep theme, add a few images): doesn't deliver a unique style.
- *Bambu marketing-site clone*: derivative, and a storefront layout doesn't fit a
  calculator/dashboard tool.

What we borrow from bambulab.com/en-eu:
- **Studio product photography** — clean cutout product shots on soft neutral
  gradients ("studio floor" backdrop), used as the identity of each machine.
- **Graphite + signature green** — near-black surfaces for chrome (header, hero),
  light studio-gray content surfaces, one confident green accent
  (Bambu green ≈ `#00AE42`) replacing the current generic blue.
- **Generous rounded cards, big typography, real hierarchy** — oversized numerals
  for money/stats, small uppercase labels.

What stays ours: dark mode support, Radix/shadcn primitives, recharts, the
existing local-db data layer. No feature or calculation changes.

## Assets

Bambu publishes clean transparent-background cutout PNGs for every current
printer model. Verified downloadable (HTTP 200, no hotlink protection, ~300 KB each):

| Model | URL |
|---|---|
| A1 mini | `https://portal.bblmw.com/compare/A1mini.png` |
| A1 | `https://portal.bblmw.com/compare/A1.png` |
| P1S | `https://portal.bblmw.com/compare/P1S.png` |
| P2S | `https://portal.bblmw.com/compare/P2S-qw75b7il1t.png` |
| X1C | `https://portal.bblmw.com/compare/X1C-zbpu2eltq5.png` |
| X2D | `https://portal.bblmw.com/compare/X2D-zbpu2eltq5.png` |
| H2D | `https://portal.bblmw.com/compare/H2D-139c8d33e2ed.png` |
| H2S | `https://portal.bblmw.com/compare/H2S-mimdn0opvna.png` |
| H2C | `https://portal.bblmw.com/compare/h2c-h2e4s63566c.png` |
| A2L | `https://portal.bblmw.com/compare/a2l-hl38wbwrmum.png` |

Downloaded once into `public/printers/<slug>.png` (offline-first app; no runtime
hotlinking). **Licensing note:** these are © Bambu Lab product images. Fine for a
personal self-hosted tool; do not redistribute or market with them. A
`public/printers/README.md` records source + date.

Filaments need no photography: spools are drawn as a reusable tinted **SVG spool**
driven by the `color_hex` column that already exists on every filament row.

## Visual primitives (new, `components/visual/`)

1. **`PrinterVisual`** — renders a printer's cutout image on the studio-gradient
   backdrop. Resolution order: explicit `printer.image_key` → name-based
   auto-match (`"a1 mini"`, `"p1s"`, … case/space-insensitive) → neutral printer
   silhouette (bundled SVG) for non-Bambu machines. Registry lives in
   `lib/printer-images.ts` (slug → `/printers/*.png` + display name).
   Sizes: `thumb` (40px), `card` (~160px), `hero` (~280px).
2. **`FilamentSpool`** — SVG spool tinted with `color_hex` (graceful gray when
   null), with size variants down to a 16px "spool dot" for tables/inline chips.
3. **`ClientAvatar`** — initials avatar, deterministic hue from client id.
4. **`StatusPipeline` / `StatusBadge`** — quote status rendered as a colored
   step indicator (draft → pending → in progress → shipping → finished) instead
   of plain text.

All are presentational (props in, JSX out), no data fetching, each < 200 lines.

## Surface redesigns

### 1. Theme (`app/globals.css`)
New palette, both modes:
- Light "Studio": background `oklch` near-white warm gray, cards white,
  foreground graphite (near-black), primary = Bambu green (`oklch(0.65 0.19 150)`
  ≈ #00AE42), chart series re-derived (green primary, graphite, amber, sky, coral —
  CVD-checked).
- Dark "Workshop": graphite/near-black backgrounds (replacing blue-slate),
  same green primary, elevated cards.
- Add `--surface-studio` gradient token for the product-photo backdrop.
- Radius bumps to 1rem for the big cards; keep current radius for inputs.

### 2. Pickers — the core of "kill the dropdowns" (`components/excel-calculator.tsx`)
- **Printer picker**: horizontally scrollable card strip (image, name, owner,
  wattage). Click to select; selected card gets green ring. Replaces the
  `<Select>` at ~line 1411. Falls back to compact list layout on small screens.
- **Filament picker**: popover grid of spool swatches (spool tinted with its
  color, brand + material badge, low-stock amber dot). Search stays (cmdk),
  but results render as swatch rows, not text rows.
- **Client selector** (`components/client-selector.tsx`): rows get avatars.

### 3. Settings → Printers (`components/printers-list.tsx`)
Card grid: big `PrinterVisual` per card, name, owner chip, key numbers
(power, cost, life). Edit dialog gains an **image picker** (10 Bambu models +
"generic") writing `image_key` to the printer row.

### 4. Settings → Filaments (`components/filaments-list.tsx`)
"Spool wall": cards grouped by material type, each card = tinted spool, brand,
color name, price/kg, and a **stock arc** around the spool (grams_in_stock vs
low_stock_threshold_g; amber when low). Existing color picker already writes
`color_hex` — now it's visible everywhere.

### 5. Dashboard (`app/dashboard/page.tsx`)
- **Hero band**: graphite panel, oversized realized-revenue numeral, avg margin
  + owner split as compact tiles, most-used printer's cutout image bleeding out
  of the right edge (hidden on mobile).
- **Fleet panel**: per-printer row — thumb image, name, hours bar (share of
  total realized hours). Replaces the plain hours table.
- **Top clients**: avatar rows with green revenue bars. Replaces the table.
- **Revenue chart**: keep recharts bar chart, recolor to new palette
  (green revenue / graphite cost), rounded bars, no legend chrome.
- **Material mix donut** (new, cheap): realized filament grams by material type,
  slices tinted by actual filament colors.

### 6. Home (`app/page.tsx`)
Hero gets the studio treatment: graphite panel with a printer cutout (the user's
most-used printer by realized hours — same rule as the dashboard hero —
fallback X1C) instead of the abstract blur blob.
Tool cards keep layout but pick up photography/visual accents (spools on the
settings card, avatars on history).

### 7. History (`components/quote-history.tsx`)
Rows/cards gain: client avatar, `StatusPipeline`, spool dots for the filaments
used, printer thumb. Filters unchanged functionally, restyled as pill toggles
instead of selects where the option count is ≤ 5 (status), selects stay for
long lists (client).

## Data model

- `Printer.image_key?: string` — added to `types/db.ts`. The row type already
  carries `[key: string]: any`, and the local-db layer stores whatever is
  written, so **no migration is needed**; legacy rows simply auto-match by name.
- No other schema changes. No changes to quote math.

## Error handling / edge cases

- Missing `color_hex` → neutral gray spool (already nullable in type).
- Unmatched printer name + no `image_key` → silhouette, never a broken image.
- Zero data (fresh install) → dashboard hero shows the X1C cutout with a
  "set up your shop" CTA; panels keep their existing empty states.
- Images are decorative → `alt=""`, `loading="lazy"` except the hero
  (`fetchpriority="high"`); explicit width/height to avoid CLS.
- Color is never the only signal: material badges keep text, low-stock keeps
  the amber badge text, status pipeline keeps labels.

## Testing / verification

The repo has no test runner today, so verification is:
1. `npm run build` green after every phase.
2. `npm run lint` clean.
3. Playwright visual pass per phase: screenshot `/`, `/dashboard`, `/business`,
   `/settings/printers`, `/settings/filaments`, `/history` at 375 / 768 / 1440,
   both themes; check overflow, contrast, no broken images.

## Non-goals

- No new calculations, statuses, or data features.
- No component-library swap (Radix/shadcn stays).
- No chart-library swap (recharts stays).
- No changes to quote/invoice printable documents (they must stay letterhead-clean).
- No laser-materials visual treatment in this pass (follow-up candidate).
