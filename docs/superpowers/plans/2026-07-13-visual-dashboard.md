# Visual Dashboard Redesign ("Print Shop OS") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-13-visual-dashboard-design.md`

**Goal:** Replace the select-box-heavy UI with a Bambu-Lab-inspired visual identity: printer product photography, color-driven filament spools, client avatars, and a photographic dashboard — with zero changes to calculations or data features.

**Architecture:** New presentational primitives under `components/visual/` (printer image registry + `PrinterVisual`, tinted SVG `FilamentSpool`, `ClientAvatar`, `PrinterPicker`), a re-themed `app/globals.css` (graphite + Bambu-green "Studio/Workshop" palette), then surface-by-surface adoption: calculator pickers → settings grids → dashboard → home/history.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4 (CSS-first tokens), Radix/shadcn, recharts, local-db (Supabase-shaped localStorage client).

## Global Constraints

- **No test runner exists in this repo** (no test script in `package.json`). Per spec §Testing, each task verifies with: `npm run build` green, `npm run lint` clean, and a visual check in the running app (`npm run dev`, port 4001). The final task is a Playwright screenshot QA pass.
- No new npm dependencies.
- No changes to quote math, statuses, or the printable quote/invoice documents.
- Printer images are © Bambu Lab, bundled for personal use only; `public/printers/README.md` must record source + date.
- Images: decorative `alt=""`, explicit `width`/`height`, `loading="lazy"` except hero images.
- Color is never the only signal (badges keep text labels).
- All state updates immutable; files < 800 lines; follow existing code style (kebab-case files, `@/` imports).
- Dark mode must stay fully supported on every touched surface.

---

### Task 1: Printer image assets, registry, and `image_key` type

**Files:**
- Create: `scripts/fetch-printer-images.mjs`
- Create: `public/printers/README.md`
- Create: `lib/printer-images.ts`
- Modify: `types/db.ts` (Printer type, after `has_enclosure`)
- Create (by running the script): `public/printers/*.png` (10 files)

**Interfaces:**
- Produces: `PRINTER_IMAGES: PrinterImageEntry[]` where `PrinterImageEntry = { key: string; label: string; src: string; aliases: string[] }`; `resolvePrinterImage(name: string, imageKey?: string | null): PrinterImageEntry | null`; `GENERIC_PRINTER_KEY = "generic"`.
- Consumes: nothing.

- [ ] **Step 1: Write the download script**

```js
// scripts/fetch-printer-images.mjs
// One-shot fetch of Bambu Lab printer cutout renders into public/printers/.
// Run: node scripts/fetch-printer-images.mjs
import { writeFile, mkdir } from "node:fs/promises"
import path from "node:path"

const IMAGES = {
  "a1-mini": "https://portal.bblmw.com/compare/A1mini.png",
  "a1": "https://portal.bblmw.com/compare/A1.png",
  "p1s": "https://portal.bblmw.com/compare/P1S.png",
  "p2s": "https://portal.bblmw.com/compare/P2S-qw75b7il1t.png",
  "x1c": "https://portal.bblmw.com/compare/X1C-zbpu2eltq5.png",
  "x2d": "https://portal.bblmw.com/compare/X2D-zbpu2eltq5.png",
  "h2d": "https://portal.bblmw.com/compare/H2D-139c8d33e2ed.png",
  "h2s": "https://portal.bblmw.com/compare/H2S-mimdn0opvna.png",
  "h2c": "https://portal.bblmw.com/compare/h2c-h2e4s63566c.png",
  "a2l": "https://portal.bblmw.com/compare/a2l-hl38wbwrmum.png",
}

const outDir = path.join(process.cwd(), "public", "printers")
await mkdir(outDir, { recursive: true })

for (const [slug, url] of Object.entries(IMAGES)) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status} from ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(path.join(outDir, `${slug}.png`), buf)
  console.log(`saved ${slug}.png (${(buf.length / 1024).toFixed(0)} KB)`)
}
```

- [ ] **Step 2: Run it and verify 10 files**

Run: `node scripts/fetch-printer-images.mjs`
Expected: ten `saved <slug>.png (…KB)` lines, no errors. `ls public/printers` shows 10 PNGs.

- [ ] **Step 3: Write the licensing README**

```md
<!-- public/printers/README.md -->
# Printer product images

Cutout product renders © Bambu Lab, downloaded 2026-07-13 from
`portal.bblmw.com/compare/*` (the public compare-page assets) via
`scripts/fetch-printer-images.mjs`.

Bundled here for **personal, self-hosted use only** — do not redistribute
these images or use them in marketing material.
```

- [ ] **Step 4: Write the registry**

```ts
// lib/printer-images.ts
// Registry of bundled printer product images + name-based matching.
// Aliases are matched against a normalized printer name (lowercase,
// non-alphanumerics stripped), most-specific entry first, so "A1 mini"
// resolves to a1-mini and never to a1.

export type PrinterImageEntry = {
  key: string
  label: string
  src: string
  aliases: string[]
}

export const GENERIC_PRINTER_KEY = "generic"

export const PRINTER_IMAGES: PrinterImageEntry[] = [
  { key: "a1-mini", label: "Bambu Lab A1 mini", src: "/printers/a1-mini.png", aliases: ["a1mini"] },
  { key: "a2l", label: "Bambu Lab A2L", src: "/printers/a2l.png", aliases: ["a2l"] },
  { key: "p1s", label: "Bambu Lab P1S", src: "/printers/p1s.png", aliases: ["p1s", "p1p"] },
  { key: "p2s", label: "Bambu Lab P2S", src: "/printers/p2s.png", aliases: ["p2s"] },
  { key: "x1c", label: "Bambu Lab X1C", src: "/printers/x1c.png", aliases: ["x1c", "x1carbon", "x1e"] },
  { key: "x2d", label: "Bambu Lab X2D", src: "/printers/x2d.png", aliases: ["x2d"] },
  { key: "h2d", label: "Bambu Lab H2D", src: "/printers/h2d.png", aliases: ["h2d"] },
  { key: "h2s", label: "Bambu Lab H2S", src: "/printers/h2s.png", aliases: ["h2s"] },
  { key: "h2c", label: "Bambu Lab H2C", src: "/printers/h2c.png", aliases: ["h2c"] },
  // "a1" last among A-series so "a1mini" wins first.
  { key: "a1", label: "Bambu Lab A1", src: "/printers/a1.png", aliases: ["a1"] },
]

const byKey = new Map(PRINTER_IMAGES.map((e) => [e.key, e]))

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/**
 * Resolve a printer row to a bundled image. Explicit image_key wins
 * ("generic" forces the silhouette); otherwise the printer name is
 * alias-matched. Returns null when nothing matches (caller renders the
 * generic silhouette).
 */
export function resolvePrinterImage(name: string, imageKey?: string | null): PrinterImageEntry | null {
  if (imageKey === GENERIC_PRINTER_KEY) return null
  if (imageKey && byKey.has(imageKey)) return byKey.get(imageKey)!
  const n = normalize(name || "")
  if (!n) return null
  return PRINTER_IMAGES.find((e) => e.aliases.some((a) => n.includes(a))) || null
}
```

- [ ] **Step 5: Add `image_key` to the shared Printer type**

In `types/db.ts`, inside `export type Printer`, after the `has_enclosure: boolean` line add:

```ts
  // Bundled product-image key from lib/printer-images.ts ("generic" opts out
  // of name matching). Absent on legacy rows, which auto-match by name.
  image_key?: string | null
```

- [ ] **Step 6: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both succeed (registry is unused so far — that's fine).

- [ ] **Step 7: Commit**

```bash
git add scripts/fetch-printer-images.mjs public/printers lib/printer-images.ts types/db.ts
git commit -m "feat: bundle Bambu printer imagery with registry and image_key type"
```

---

### Task 2: "Studio / Workshop" theme in globals.css

**Files:**
- Modify: `app/globals.css` (`:root` block lines 22–57, `.dark` block lines 59–93, plus one new utility)

**Interfaces:**
- Produces: CSS utility class `.surface-studio` (product-photo backdrop gradient); re-pointed semantic tokens (`--primary` is now green, neutrals are graphite instead of blue-slate). All existing `bg-primary`, `text-muted-foreground`, `--chart-*` consumers pick this up with no code change.

- [ ] **Step 1: Replace the `:root` variable block**

Replace the entire `:root { … }` block (lines 22–57) with:

```css
:root {
  /* "Studio" light theme: warm near-white studio neutrals, graphite text,
     Bambu-green primary (≈ #00AE42) */
  --background: oklch(0.977 0.002 106);
  --foreground: oklch(0.225 0.01 260);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.225 0.01 260);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.225 0.01 260);
  --primary: oklch(0.62 0.17 150);
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.955 0.004 130);
  --secondary-foreground: oklch(0.34 0.02 250);
  --muted: oklch(0.96 0.003 106);
  --muted-foreground: oklch(0.5 0.012 250);
  --accent: oklch(0.94 0.03 150);
  --accent-foreground: oklch(0.4 0.12 150);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(1 0 0);
  --border: oklch(0.915 0.005 106);
  --input: oklch(0.885 0.007 106);
  --ring: oklch(0.62 0.17 150);
  --chart-1: oklch(0.62 0.17 150);
  --chart-2: oklch(0.38 0.012 260);
  --chart-3: oklch(0.72 0.15 70);
  --chart-4: oklch(0.65 0.12 235);
  --chart-5: oklch(0.65 0.18 25);
  --radius: 0.75rem;
  --sidebar: oklch(1 0 0);
  --sidebar-foreground: oklch(0.225 0.01 260);
  --sidebar-primary: oklch(0.62 0.17 150);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(0.955 0.004 130);
  --sidebar-accent-foreground: oklch(0.34 0.02 250);
  --sidebar-border: oklch(0.915 0.005 106);
  --sidebar-ring: oklch(0.62 0.17 150);
  /* Graphite hero/chrome panel + studio-floor photo backdrop */
  --panel: oklch(0.235 0.008 260);
  --panel-foreground: oklch(0.97 0.003 106);
  --studio-from: oklch(0.965 0.003 106);
  --studio-to: oklch(0.895 0.006 106);
}
```

- [ ] **Step 2: Replace the `.dark` variable block**

Replace the entire `.dark { … }` block with:

```css
.dark {
  /* "Workshop" dark theme: graphite, elevated cards, same green */
  --background: oklch(0.155 0.005 260);
  --foreground: oklch(0.945 0.004 106);
  --card: oklch(0.205 0.006 260);
  --card-foreground: oklch(0.945 0.004 106);
  --popover: oklch(0.205 0.006 260);
  --popover-foreground: oklch(0.945 0.004 106);
  --primary: oklch(0.72 0.17 150);
  --primary-foreground: oklch(0.17 0.02 150);
  --secondary: oklch(0.26 0.007 260);
  --secondary-foreground: oklch(0.92 0.005 106);
  --muted: oklch(0.245 0.006 260);
  --muted-foreground: oklch(0.68 0.01 250);
  --accent: oklch(0.28 0.02 150);
  --accent-foreground: oklch(0.9 0.05 150);
  --destructive: oklch(0.577 0.215 27.325);
  --destructive-foreground: oklch(0.98 0.005 250);
  --border: oklch(0.30 0.007 260);
  --input: oklch(0.35 0.008 260);
  --ring: oklch(0.72 0.17 150);
  --chart-1: oklch(0.72 0.17 150);
  --chart-2: oklch(0.75 0.01 260);
  --chart-3: oklch(0.78 0.14 70);
  --chart-4: oklch(0.7 0.12 235);
  --chart-5: oklch(0.7 0.17 25);
  --sidebar: oklch(0.205 0.006 260);
  --sidebar-foreground: oklch(0.945 0.004 106);
  --sidebar-primary: oklch(0.72 0.17 150);
  --sidebar-primary-foreground: oklch(0.17 0.02 150);
  --sidebar-accent: oklch(0.26 0.007 260);
  --sidebar-accent-foreground: oklch(0.92 0.005 106);
  --sidebar-border: oklch(0.30 0.007 260);
  --sidebar-ring: oklch(0.72 0.17 150);
  --panel: oklch(0.205 0.006 260);
  --panel-foreground: oklch(0.97 0.003 106);
  --studio-from: oklch(0.27 0.007 260);
  --studio-to: oklch(0.20 0.006 260);
}
```

- [ ] **Step 3: Expose the new tokens + backdrop utility**

In the `@theme inline { … }` block, after `--color-sidebar-ring: var(--sidebar-ring);` add:

```css
  --color-panel: var(--panel);
  --color-panel-foreground: var(--panel-foreground);
```

At the end of the `@layer utilities` block add:

```css
  /* Soft studio-floor gradient behind product cutout imagery */
  .surface-studio {
    background: linear-gradient(160deg, var(--studio-from), var(--studio-to));
  }
```

- [ ] **Step 4: Verify visually in both themes**

Run: `npm run build` → expected green.
Run `npm run dev`, open `http://localhost:4001/` and `/dashboard`, toggle theme.
Expected: green primary buttons/links, graphite dark mode (no blue tint), no unreadable text. Charts on `/dashboard` still render (hardcoded hexes there get fixed in Task 8).

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat: studio/workshop theme — graphite neutrals, bambu-green primary"
```

---

### Task 3: Visual primitives (`PrinterVisual`, `FilamentSpool`, `ClientAvatar`)

**Files:**
- Create: `components/visual/printer-visual.tsx`
- Create: `components/visual/filament-spool.tsx`
- Create: `components/visual/client-avatar.tsx`

**Interfaces:**
- Consumes: `resolvePrinterImage` from Task 1.
- Produces:
  - `PrinterVisual({ name, imageKey, size, className }: { name: string; imageKey?: string | null; size: "thumb" | "card" | "hero"; className?: string })`
  - `FilamentSpool({ colorHex, size, className }: { colorHex?: string | null; size?: number; className?: string })` — `size` is the rendered px square, default 40.
  - `SpoolWithStock({ colorHex, stockGrams, lowThresholdGrams, size }: { colorHex?: string | null; stockGrams?: number | null; lowThresholdGrams?: number; size?: number })` — spool wrapped in a stock arc (green ≥ threshold, amber below, hidden when stock is null/untracked). Full ring = 3 kg or the largest stock on hand, capped at 100%.
  - `ClientAvatar({ id, name, size }: { id: string; name: string; size?: number })`

- [ ] **Step 1: Write `PrinterVisual`**

```tsx
// components/visual/printer-visual.tsx
import Image from "next/image"
import { Printer as PrinterIcon } from "lucide-react"
import { resolvePrinterImage } from "@/lib/printer-images"
import { cn } from "@/lib/utils"

const SIZES = { thumb: 40, card: 160, hero: 280 } as const

type Props = {
  name: string
  imageKey?: string | null
  size: keyof typeof SIZES
  className?: string
}

/**
 * A printer's product identity: bundled cutout render on the studio-floor
 * gradient, or a neutral icon silhouette for machines we have no image for.
 * Decorative (alt="") — the printer name is always rendered as text nearby.
 */
export function PrinterVisual({ name, imageKey, size, className }: Props) {
  const entry = resolvePrinterImage(name, imageKey)
  const px = SIZES[size]
  return (
    <span
      className={cn(
        "surface-studio flex shrink-0 items-center justify-center overflow-hidden",
        size === "thumb" ? "rounded-lg" : "rounded-2xl",
        className,
      )}
      style={{ width: px, height: px }}
    >
      {entry ? (
        <Image
          src={entry.src}
          alt=""
          width={px}
          height={px}
          loading={size === "hero" ? "eager" : "lazy"}
          className="h-[88%] w-[88%] object-contain drop-shadow-sm"
        />
      ) : (
        <PrinterIcon
          aria-hidden
          className="text-muted-foreground/40"
          style={{ width: px * 0.45, height: px * 0.45 }}
        />
      )}
    </span>
  )
}
```

Note: `next.config.mjs` — check `images` config; if `unoptimized` is not already set and the build complains about the export mode, use a plain `<img>` with the same props instead. Local `/printers/*.png` needs no remote pattern either way.

- [ ] **Step 2: Write `FilamentSpool` + `SpoolWithStock`**

```tsx
// components/visual/filament-spool.tsx
import { cn } from "@/lib/utils"

const RIM = "var(--color-foreground)"
const FULL_STOCK_GRAMS = 3000

/** SVG spool tinted by the filament's stored color_hex (gray when unset). */
export function FilamentSpool({
  colorHex,
  size = 40,
  className,
}: {
  colorHex?: string | null
  size?: number
  className?: string
}) {
  const fill = colorHex || "oklch(0.75 0.01 260)"
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <circle cx="24" cy="24" r="22" fill={RIM} opacity="0.85" />
      <circle cx="24" cy="24" r="17.5" fill={fill} />
      {/* winding grooves */}
      <circle cx="24" cy="24" r="14.5" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
      <circle cx="24" cy="24" r="11.5" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
      <circle cx="24" cy="24" r="7" fill={RIM} opacity="0.85" />
      <circle cx="24" cy="24" r="3.5" fill="var(--color-background)" />
    </svg>
  )
}

/**
 * Spool wrapped in a stock arc. Arc is hidden when stock is untracked
 * (null/undefined); amber when below the low-stock threshold, green otherwise.
 */
export function SpoolWithStock({
  colorHex,
  stockGrams,
  lowThresholdGrams = 1000,
  size = 56,
}: {
  colorHex?: string | null
  stockGrams?: number | null
  lowThresholdGrams?: number
  size?: number
}) {
  const tracked = typeof stockGrams === "number"
  const frac = tracked ? Math.min(1, Math.max(0, stockGrams / FULL_STOCK_GRAMS)) : 0
  const low = tracked && stockGrams < lowThresholdGrams
  const r = 23
  const dash = 2 * Math.PI * r
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {tracked && (
        <svg viewBox="0 0 52 52" width={size} height={size} aria-hidden className="absolute inset-0 -rotate-90">
          <circle cx="26" cy="26" r={r} fill="none" stroke="var(--color-border)" strokeWidth="2.5" />
          <circle
            cx="26"
            cy="26"
            r={r}
            fill="none"
            stroke={low ? "oklch(0.72 0.15 70)" : "var(--color-primary)"}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={dash}
            strokeDashoffset={dash * (1 - frac)}
          />
        </svg>
      )}
      <FilamentSpool colorHex={colorHex} size={size * 0.78} />
    </span>
  )
}
```

- [ ] **Step 3: Write `ClientAvatar`**

```tsx
// components/visual/client-avatar.tsx
import { cn } from "@/lib/utils"

/** Deterministic pastel hue from the client id so avatars are stable. */
function hueFromId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360
  return h
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function ClientAvatar({
  id,
  name,
  size = 32,
  className,
}: {
  id: string
  name: string
  size?: number
  className?: string
}) {
  const hue = hueFromId(id)
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `oklch(0.9 0.06 ${hue})`,
        color: `oklch(0.35 0.09 ${hue})`,
      }}
    >
      {initials(name)}
    </span>
  )
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build && npm run lint`
Expected: green (components unused yet).

- [ ] **Step 5: Commit**

```bash
git add components/visual
git commit -m "feat: visual primitives — printer imagery, tinted spools, client avatars"
```

---

### Task 4: Visual printer picker in the calculator

**Files:**
- Create: `components/visual/printer-picker.tsx`
- Modify: `components/excel-calculator.tsx:1410-1431` (the printer `<Select>`; keep the surrounding tooltip logic)

**Interfaces:**
- Consumes: `PrinterVisual` (Task 3), `Printer` from `@/types/db`.
- Produces: `PrinterPicker({ printers, value, onSelect, placeholder }: { printers: Printer[]; value?: string; onSelect: (id: string) => void; placeholder?: string })` — popover picker whose trigger shows the selected printer's thumb + name.

- [ ] **Step 1: Write `PrinterPicker`**

```tsx
// components/visual/printer-picker.tsx
"use client"

import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { PrinterVisual } from "@/components/visual/printer-visual"
import { cn } from "@/lib/utils"
import type { Printer } from "@/types/db"

type Props = {
  printers: Printer[]
  value?: string
  onSelect: (id: string) => void
  placeholder?: string
}

/** Visual replacement for the printer <Select>: rows show the machine itself. */
export function PrinterPicker({ printers, value, onSelect, placeholder = "Select printer" }: Props) {
  const [open, setOpen] = useState(false)
  const selected = printers.find((p) => p.id === value)
  const sorted = [...printers].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-auto min-h-9 w-full justify-between bg-card px-2 py-1"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <PrinterVisual name={selected.name} imageKey={selected.image_key} size="thumb" />
              <span className="truncate text-sm">{selected.name}</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-1" align="start">
        <div className="max-h-[320px] space-y-0.5 overflow-y-auto">
          {sorted.map((printer) => {
            const isSelected = printer.id === value
            return (
              <button
                key={printer.id}
                type="button"
                onClick={() => {
                  onSelect(printer.id)
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent",
                  isSelected && "bg-accent ring-1 ring-primary/50",
                )}
              >
                <PrinterVisual name={printer.name} imageKey={printer.image_key} size="thumb" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{printer.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {printer.owner} · {printer.average_power_consumption_watts}W
                    {printer.has_enclosure ? " · Enclosed" : ""}
                  </span>
                </span>
                {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            )
          })}
          {sorted.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No printers yet — add one in Settings.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Swap it into the calculator**

In `components/excel-calculator.tsx`, add the import next to the other component imports:

```tsx
import { PrinterPicker } from "@/components/visual/printer-picker"
```

Replace the `const selectEl = ( <Select …> … </Select> )` block (lines 1410–1431) with:

```tsx
                              const selectEl = (
                                <PrinterPicker
                                  printers={printers}
                                  value={part.printer_id === "" ? undefined : part.printer_id}
                                  onSelect={(value) => {
                                    // Immutable update via helper instead of mutating state in place.
                                    updatePartField(index, "printer_id", value)
                                  }}
                                />
                              )
```

The tooltip wrapper below (lines 1432–1451) stays as-is.

- [ ] **Step 3: Verify in the app**

Run: `npm run build` → green. In `npm run dev`, open `/business`, add a part, open the printer picker.
Expected: popover with image rows (Bambu-named printers show their render, others the silhouette), selection works, cost math unchanged.

- [ ] **Step 4: Commit**

```bash
git add components/visual/printer-picker.tsx components/excel-calculator.tsx
git commit -m "feat: visual printer picker replaces select in calculator parts table"
```

---

### Task 5: Filament color throughout the calculator picker + chips

**Files:**
- Modify: `components/excel-calculator.tsx` — filament chip rows (~line 1467) and the add-filament `CommandItem` rows (~line 1587)

**Interfaces:**
- Consumes: `FilamentSpool` (Task 3).

- [ ] **Step 1: Import the spool**

```tsx
import { FilamentSpool } from "@/components/visual/filament-spool"
```

- [ ] **Step 2: Add a spool dot to each selected-filament chip**

In the chip row (the `div` with `className="flex items-center gap-1 text-xs bg-muted/70 rounded-md p-1"`, ~line 1467), insert a spool immediately before the `<TooltipProvider>`:

```tsx
                                        <FilamentSpool colorHex={filament?.color_hex} size={16} />
```

- [ ] **Step 3: Make the add-filament rows visual**

Replace the `CommandItem` children (currently `{filament.name}` + check icon, lines 1610–1611) with:

```tsx
                                            <FilamentSpool colorHex={filament.color_hex} size={20} className="mr-2" />
                                            <span className="min-w-0 flex-1">
                                              <span className="block truncate">{filament.name}</span>
                                              <span className="block truncate text-xs text-muted-foreground">
                                                {[filament.brand, filament.material_type === "material" ? "material" : filament.type]
                                                  .filter(Boolean)
                                                  .join(" · ")}
                                              </span>
                                            </span>
                                            {typeof filament.grams_in_stock === "number" &&
                                              filament.grams_in_stock < (filament.low_stock_threshold_g ?? 1000) && (
                                                <span className="mr-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                                  low
                                                </span>
                                              )}
                                            {isSelected && <Check className="ml-auto h-4 w-4" />}
```

- [ ] **Step 4: Verify in the app**

`npm run build` green; in `/business` the add-filament popover shows tinted spools + brand line + low-stock pill; chips show a 16px spool dot; search still filters.

- [ ] **Step 5: Commit**

```bash
git add components/excel-calculator.tsx
git commit -m "feat: filament picker and chips show tinted spools and stock state"
```

---

### Task 6: Printers settings — product card grid + image picker

**Files:**
- Modify: `components/printers-list.tsx` (local `Printer` type line 16–27; form state objects lines 34–44, 109–119; `renderPrinterForm` lines 183–295; insert/update payloads lines 94–99, 148–154; `startEdit` lines 168–181; display card lines 329–432)

**Interfaces:**
- Consumes: `PrinterVisual`, `PRINTER_IMAGES`, `GENERIC_PRINTER_KEY`, `resolvePrinterImage`.

- [ ] **Step 1: Wire `image_key` through the form state**

Add to the local `Printer` type: `image_key?: string | null`.
Add `image_key: "auto"` to both default form-state objects (the `useState` initializer at line 34 and the reset at line 109). In `startEdit`, add `image_key: printer.image_key || "auto"`. In the insert payload (`handleAdd`) and update payload (`handleEdit`) add:

```ts
      image_key: data.image_key === "auto" ? null : data.image_key,
```

(where `data` is `newPrinter` / `editData` respectively; `null` means "auto-match by name").

- [ ] **Step 2: Add the image picker to `renderPrinterForm`**

Imports:

```tsx
import { PrinterVisual } from "@/components/visual/printer-visual"
import { PRINTER_IMAGES, GENERIC_PRINTER_KEY } from "@/lib/printer-images"
```

Inside `renderPrinterForm`, after the Owner field's closing `</div>`, add:

```tsx
      <div className="md:col-span-2">
        <Label>Product image</Label>
        <div className="mt-1.5 flex items-center gap-3">
          <PrinterVisual name={data.name} imageKey={data.image_key === "auto" ? null : data.image_key} size="thumb" />
          <Select value={data.image_key} onValueChange={(value) => onChange({ ...data, image_key: value })}>
            <SelectTrigger className="bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-detect from name</SelectItem>
              <SelectItem value={GENERIC_PRINTER_KEY}>Generic (no image)</SelectItem>
              {PRINTER_IMAGES.map((e) => (
                <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
```

- [ ] **Step 3: Turn the printer list into a product card grid**

Change the wrapper at line 329 from `<div className="grid gap-4">` to:

```tsx
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
```

Replace the non-editing display branch (the `<div>` at line 352 through its close at line 427) with:

```tsx
                <div className="flex flex-col items-center text-center">
                  <PrinterVisual name={printer.name} imageKey={printer.image_key} size="card" className="mb-4 w-full" />
                  <div className="mb-1 flex items-center justify-center gap-2">
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">{printer.name}</h3>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${printer.owner === OWNER_A_KEY ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" : "bg-primary/10 text-primary"}`}
                    >
                      {printer.owner}
                    </span>
                    {printer.has_enclosure && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        Enclosed
                      </span>
                    )}
                  </div>
                  <dl className="grid w-full grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted/60 px-1 py-2">
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Cost</dt>
                      <dd className="text-sm font-semibold tabular-nums">€{printer.printer_cost.toFixed(0)}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/60 px-1 py-2">
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Life</dt>
                      <dd className="text-sm font-semibold tabular-nums">{printer.estimated_life_years}y</dd>
                    </div>
                    <div className="rounded-lg bg-muted/60 px-1 py-2">
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Power</dt>
                      <dd className="text-sm font-semibold tabular-nums">{printer.average_power_consumption_watts}W</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex w-full justify-center gap-2">
                    <Button onClick={() => setExpandedId(expandedId === printer.id ? null : printer.id)} size="sm" variant="outline">
                      {expandedId === printer.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    <Button onClick={() => startEdit(printer)} size="sm" variant="outline">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button onClick={() => handleDelete(printer.id)} size="sm" variant="outline" className="text-red-600 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  {expandedId === printer.id && (
                    <div className="mt-4 w-full border-t border-border pt-4 text-left grid gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Additional Cost:</span>
                        <span className="text-foreground ml-2 font-medium tabular-nums">€{printer.additional_upfront_cost.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Annual Maintenance:</span>
                        <span className="text-foreground ml-2 font-medium tabular-nums">€{printer.estimated_annual_maintenance.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Printer Uptime:</span>
                        <span className="text-foreground ml-2 font-medium tabular-nums">{(printer.estimated_printer_uptime_percent * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  )}
                </div>
```

Keep the editing branch (`editingId === printer.id`) exactly as it is — but note the edit card now sits inside a grid cell; add `className="sm:col-span-2 lg:col-span-3"` to the `<Card>` when `editingId === printer.id` so the form gets full width:

```tsx
          <Card key={printer.id} className={`shadow-sm transition-shadow hover:shadow-md ${editingId === printer.id ? "sm:col-span-2 lg:col-span-3" : ""}`}>
```

- [ ] **Step 4: Verify in the app**

`npm run build` green. `/settings/printers`: cards render 2–3 per row with product images, add/edit form has the image picker, saving `image_key` persists (re-open edit shows the same selection), delete still works.

- [ ] **Step 5: Commit**

```bash
git add components/printers-list.tsx
git commit -m "feat: printers settings as product card grid with image picker"
```

---

### Task 7: Filaments settings — spool wall

**Files:**
- Modify: `components/filaments-list.tsx` (the filament card render inside the list `.map`; the file is 1735 lines — locate the filament-row Card, currently a text row, by searching for the row's `CardContent` after line 1000)

**Interfaces:**
- Consumes: `SpoolWithStock` (Task 3).

- [ ] **Step 1: Import**

```tsx
import { SpoolWithStock } from "@/components/visual/filament-spool"
```

- [ ] **Step 2: Put the spool at the front of every filament row**

Find the display (non-editing) branch of each filament card in the list `.map`. At the start of its top-level flex row, insert:

```tsx
                  <SpoolWithStock
                    colorHex={filament.color_hex}
                    stockGrams={filament.material_type === "material" ? null : filament.grams_in_stock}
                    lowThresholdGrams={filament.low_stock_threshold_g ?? 1000}
                    size={56}
                  />
```

and wrap the existing name/details in a `min-w-0 flex-1` container if not already flexed. The existing low-stock badge, price, and edit/delete buttons stay untouched — the spool is additive. If the current row layout is a plain block, convert the top level of the display branch to `flex items-center gap-4`.

- [ ] **Step 3: Verify in the app**

`npm run build` green. `/settings/filaments`: every filament row leads with a spool tinted by its color; stock arc appears only for stock-tracked filaments and turns amber below threshold; materials (laser) show a gray spool with no arc. Editing and CSV import unchanged.

- [ ] **Step 4: Commit**

```bash
git add components/filaments-list.tsx
git commit -m "feat: filament list leads with tinted spools and stock arcs"
```

---

### Task 8: Dashboard rework — hero band, fleet panel, avatar clients, palette-native chart, material donut

**Files:**
- Modify: `app/dashboard/page.tsx` (data loading lines 61–82, `printerHours` memo lines 169–183, series colors lines 185–189, and the whole render from the stat-card grid line 206 to the closing tables grid line 346)

**Interfaces:**
- Consumes: `PrinterVisual`, `ClientAvatar`, `FilamentSpool`, `Filament` type.
- Produces (internal): `fleet: { printer: Printer; hours: number }[]`; `materialMix: { name: string; grams: number; color: string }[]`.

- [ ] **Step 1: Load filaments too**

In `loadData`, alongside the other reads add:

```ts
      const { data: filamentsData, error: filamentsError } = await supabase.from("filaments").select("*")
```

include `filamentsError` in `firstError`, add `const [filamentsList, setFilamentsList] = useState<Filament[]>([])` state, `setFilamentsList(filamentsData || [])`, and import `Filament` from `@/types/db`. Type the printers state as `Printer[]` (import it) instead of `any[]`.

- [ ] **Step 2: Fleet + material mix memos**

Replace the `printerHours` memo (lines 169–183) with:

```tsx
  // Printing hours per printer across realized quotes, with the printer row
  // attached so the fleet panel can render its product image.
  const fleet = useMemo(() => {
    const byPrinter = new Map<string, number>()
    for (const q of realized) {
      for (const part of q.printed_parts || []) {
        if (!part?.printer_id) continue
        byPrinter.set(part.printer_id, (byPrinter.get(part.printer_id) || 0) + (Number(part.printing_time_hr) || 0))
      }
    }
    return [...byPrinter.entries()]
      .map(([printerId, hours]) => ({
        printer: printers.find((p) => p.id === printerId) || null,
        hours,
      }))
      .filter((e): e is { printer: Printer; hours: number } => e.printer !== null)
      .sort((x, y) => y.hours - x.hours)
  }, [realized, printers])

  // Grams of filament per filament row across realized quotes (legacy
  // single-filament parts and multi-filament parts both counted).
  const materialMix = useMemo(() => {
    const grams = new Map<string, number>()
    for (const q of realized) {
      for (const part of q.printed_parts || []) {
        if (Array.isArray(part?.filaments)) {
          for (const entry of part.filaments) {
            if (!entry?.filament_id) continue
            grams.set(entry.filament_id, (grams.get(entry.filament_id) || 0) + (Number(entry.grams) || 0))
          }
        } else if (part?.filament_id) {
          grams.set(part.filament_id, (grams.get(part.filament_id) || 0) + (Number(part.filament_grams) || 0))
        }
      }
    }
    const FALLBACK = ["var(--color-chart-1)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)", "var(--color-chart-2)"]
    return [...grams.entries()]
      .map(([id, g], i) => {
        const f = filamentsList.find((x) => x.id === id)
        return { name: f?.name || "Unknown", grams: g, color: f?.color_hex || FALLBACK[i % FALLBACK.length] }
      })
      .filter((m) => m.grams > 0)
      .sort((a, b) => b.grams - a.grams)
      .slice(0, 6)
  }, [realized, filamentsList])
```

- [ ] **Step 3: Palette-native chart colors**

Replace the hardcoded series colors (lines 185–189) with:

```tsx
  // Chart colors come from the theme so both modes stay coherent.
  const revenueColor = "var(--color-chart-1)"
  const costColor = "var(--color-chart-2)"
  const tickColor = "var(--color-muted-foreground)"
  const gridColor = "var(--color-border)"
```

and in the `<Tooltip contentStyle>` swap the hex literals for `var(--color-popover)` / `var(--color-popover-foreground)`. Delete the now-unused `useTheme` import/state if nothing else uses `resolvedTheme`.

- [ ] **Step 4: Hero band replaces the stat-card grid**

Replace the stat-cards `<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">…</div>` (lines 206–239) with:

```tsx
            {/* Hero band: headline revenue + the shop's workhorse printer */}
            <section className="relative overflow-hidden rounded-3xl bg-panel text-panel-foreground">
              <div className="relative z-10 grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-xs font-medium uppercase tracking-widest text-panel-foreground/60">
                    Realized revenue
                  </p>
                  <p className="mt-2 text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">
                    {money(totalRevenue)}
                  </p>
                  <p className="mt-1 text-sm text-panel-foreground/60">
                    {realized.length} quote{realized.length !== 1 ? "s" : ""} in progress or done
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <div className="rounded-xl bg-panel-foreground/10 px-4 py-3">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-panel-foreground/60">Avg margin</p>
                      <p className="text-xl font-bold tabular-nums">{avgMargin === null ? "—" : `${avgMargin.toFixed(1)}%`}</p>
                    </div>
                    <div className="rounded-xl bg-panel-foreground/10 px-4 py-3">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-panel-foreground/60">Owner A (YTD)</p>
                      <p className="text-xl font-bold tabular-nums">{money(ownerTotals.a)}</p>
                    </div>
                    <div className="rounded-xl bg-panel-foreground/10 px-4 py-3">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-panel-foreground/60">Owner B (YTD)</p>
                      <p className="text-xl font-bold tabular-nums">{money(ownerTotals.b)}</p>
                    </div>
                  </div>
                </div>
                <div className="hidden items-end lg:flex">
                  <PrinterVisual
                    name={fleet[0]?.printer.name || "X1C"}
                    imageKey={fleet[0]?.printer.image_key}
                    size="hero"
                    className="translate-y-4"
                  />
                </div>
              </div>
            </section>
```

Add imports: `PrinterVisual`, `ClientAvatar` from `@/components/visual/...`, `Printer` type.

- [ ] **Step 5: Fleet panel + avatar clients + donut replace the tables grid**

Replace the whole `{/* Tables */}` grid (lines 284–346) with:

```tsx
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Fleet: hours per machine with product imagery */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Fleet workload</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {fleet.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No printed parts on realized quotes yet.</p>
                  ) : (
                    fleet.map(({ printer, hours }) => {
                      const max = fleet[0].hours || 1
                      return (
                        <div key={printer.id} className="flex items-center gap-3">
                          <PrinterVisual name={printer.name} imageKey={printer.image_key} size="thumb" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="truncate text-sm font-medium text-foreground">{printer.name}</p>
                              <p className="shrink-0 text-sm tabular-nums text-muted-foreground">{hours.toFixed(1)} h</p>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${(hours / max) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>

              {/* Top clients with avatars + revenue bars */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Top clients</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {topClients.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No realized quotes yet.</p>
                  ) : (
                    topClients.map((c, i) => {
                      const max = topClients[0].revenue || 1
                      return (
                        <div key={c.name} className="flex items-center gap-3">
                          <ClientAvatar id={c.name} name={c.name} size={32} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                              <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">{money(c.revenue)}</p>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${(c.revenue / max) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>

              {/* Material mix: grams per filament, tinted with real spool colors */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Material mix</CardTitle>
                </CardHeader>
                <CardContent>
                  {materialMix.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No filament usage recorded yet.</p>
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="h-[140px] w-[140px] shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={materialMix} dataKey="grams" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={2} strokeWidth={0}>
                              {materialMix.map((m) => (
                                <Cell key={m.name} fill={m.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <ul className="min-w-0 flex-1 space-y-1.5">
                        {materialMix.map((m) => (
                          <li key={m.name} className="flex items-center gap-2 text-sm">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
                            <span className="min-w-0 flex-1 truncate text-foreground">{m.name}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">{(m.grams / 1000).toFixed(2)} kg</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
```

Extend the recharts import with `PieChart, Pie, Cell`.
Note `ClientAvatar` gets `id={c.name}` because `topClients` entries are name-keyed; that keeps hues stable per client name.

- [ ] **Step 6: Verify in the app**

`npm run build` green. `/dashboard` with seeded data: graphite hero with giant revenue numeral and the busiest printer's render; fleet bars with thumbnails; avatar client rows; donut tinted with real filament colors; bar chart green/graphite in light and dark. With a wiped DB (fresh browser profile): hero shows X1C and zero values, panels show their empty-state text, nothing crashes.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: photographic dashboard — hero band, fleet panel, avatars, material donut"
```

---

### Task 9: Home page — studio hero

**Files:**
- Create: `components/visual/home-hero-printer.tsx` (client island: fleet-aware hero image)
- Modify: `app/page.tsx` (hero section, lines 79–133)

**Interfaces:**
- Consumes: `PrinterVisual`, local-db client, `onLocalDbChange`.
- Produces: `HomeHeroPrinter()` — self-contained client component, no props.

- [ ] **Step 1: Write the client island**

```tsx
// components/visual/home-hero-printer.tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { PrinterVisual } from "@/components/visual/printer-visual"
import type { Printer } from "@/types/db"

/**
 * Hero image for the landing page: the user's first printer (fleet-aware
 * flavor without loading quotes), falling back to the X1C render for fresh
 * installs. Client island because the data layer is localStorage.
 */
export function HomeHeroPrinter() {
  const [printer, setPrinter] = useState<Printer | null>(null)
  useEffect(() => {
    createClient()
      .from("printers")
      .select("*")
      .then(({ data }) => {
        if (data && data.length > 0) setPrinter(data[0])
      })
  }, [])
  return (
    <PrinterVisual
      name={printer?.name || "X1C"}
      imageKey={printer?.image_key}
      size="hero"
      className="mx-auto"
    />
  )
}
```

(If `createClient().from().select()` doesn't expose `.then`, await it inside an async function in the effect — match how `app/dashboard/page.tsx` loads data.)

- [ ] **Step 2: Rework the hero section in `app/page.tsx`**

Replace the decorative blur `div` (lines 80–83) and restructure the hero content block (lines 84–116) into a two-column graphite panel:

```tsx
        <section className="relative border-b border-border/70 bg-background pt-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl bg-panel text-panel-foreground">
              <div className="grid items-center gap-8 p-8 sm:p-12 lg:grid-cols-[3fr_2fr]">
                <div className="text-center lg:text-left">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
                    <Sparkles className="size-3.5" />
                    3D printing · laser cutting · engraving
                  </span>
                  <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl text-balance">
                    Know exactly what every print costs —{" "}
                    <span className="text-primary">and what to charge</span>
                  </h1>
                  <p className="mx-auto mt-5 max-w-2xl text-base text-panel-foreground/70 sm:text-lg text-pretty lg:mx-0">
                    A maker-friendly cost and quote calculator for 3D printing and laser work. Capture every euro of
                    cost, pick your margin, and send quotes your clients can trust.
                  </p>
                  <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                    <Link
                      href="/business"
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:bg-primary/90 sm:w-auto"
                    >
                      Create a business quote
                      <ArrowRight className="size-4" />
                    </Link>
                    <Link
                      href="/personal"
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-panel-foreground/25 bg-transparent px-6 text-sm font-semibold text-panel-foreground transition-colors hover:bg-panel-foreground/10 sm:w-auto"
                    >
                      <Calculator className="size-4 text-primary" />
                      Personal estimate
                    </Link>
                  </div>
                </div>
                <div className="hidden lg:block">
                  <HomeHeroPrinter />
                </div>
              </div>
            </div>

            {/* Highlights (unchanged content, now below the panel) */}
            <div className="mx-auto mt-8 grid max-w-5xl gap-4 pb-14 sm:grid-cols-3 sm:gap-6">
              {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
                <div key={title} className="rounded-2xl border border-border/80 bg-card p-5 text-left">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4.5" />
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
```

Add the import: `import { HomeHeroPrinter } from "@/components/visual/home-hero-printer"`. Remove the now-unused gradient `<span>` on the h1 if lint flags anything.

- [ ] **Step 3: Verify in the app**

`npm run build` green. `/` shows the graphite hero panel with a printer render on the right (X1C when no printers configured, first configured printer otherwise); highlights sit below; both themes readable; mobile (≤ lg) hides the render and keeps centered text.

- [ ] **Step 4: Commit**

```bash
git add components/visual/home-hero-printer.tsx app/page.tsx
git commit -m "feat: studio hero panel with fleet-aware printer render on home"
```

---

### Task 10: Quote history — avatars, spool dots, printer thumbs

**Files:**
- Modify: `components/quote-history.tsx` (quote card header around line 823–861; the card already renders `STATUS_CONFIG` badges — keep them)

**Interfaces:**
- Consumes: `ClientAvatar`, `FilamentSpool`, `PrinterVisual`.

- [ ] **Step 1: Imports**

```tsx
import { ClientAvatar } from "@/components/visual/client-avatar"
import { FilamentSpool } from "@/components/visual/filament-spool"
```

- [ ] **Step 2: Avatar next to the client name**

In each quote card, where the client name renders (the `quote.client_name || …` lookup — same pattern as line 500), prepend an avatar when a client exists:

```tsx
                    {quote.client_id && (
                      <ClientAvatar
                        id={quote.client_id}
                        name={clients.find((c) => c.id === quote.client_id)?.name || "?"}
                        size={24}
                        className="mr-1.5"
                      />
                    )}
```

- [ ] **Step 3: Spool dots for the filaments used**

Next to the existing badges row (after line 848's closing tag region), add a compact strip of up to 4 distinct filament colors used by the quote:

```tsx
                    {(() => {
                      const ids = new Set<string>()
                      for (const part of quote.printed_parts || []) {
                        if (Array.isArray(part?.filaments)) part.filaments.forEach((e: any) => e?.filament_id && ids.add(e.filament_id))
                        else if (part?.filament_id) ids.add(part.filament_id)
                      }
                      const used = [...ids]
                        .map((id) => filaments.find((f) => f.id === id))
                        .filter(Boolean)
                        .slice(0, 4)
                      return used.length > 0 ? (
                        <span className="ml-1 inline-flex items-center gap-0.5" title={used.map((f: any) => f.name).join(", ")}>
                          {used.map((f: any) => (
                            <FilamentSpool key={f.id} colorHex={f.color_hex} size={14} />
                          ))}
                        </span>
                      ) : null
                    })()}
```

`filaments` — check the component's existing props/state; if quote-history doesn't already load filaments, add a `filaments` load next to its existing `clients` load (same `supabase.from("filaments").select("*")` pattern) and keep it in state.

- [ ] **Step 4: Verify in the app**

`npm run build` green. `/history`: cards show client avatars, colored spool dots per quote, status badges unchanged, filtering and status changes still work.

- [ ] **Step 5: Commit**

```bash
git add components/quote-history.tsx
git commit -m "feat: quote history cards show client avatars and filament colors"
```

---

### Task 11: Client selector avatars

**Files:**
- Modify: `components/client-selector.tsx` (256 lines — rows render inside a cmdk `CommandItem` list; add the avatar at the start of each row and in the trigger when a client is selected)

**Interfaces:**
- Consumes: `ClientAvatar`.

- [ ] **Step 1: Import + row avatars**

```tsx
import { ClientAvatar } from "@/components/visual/client-avatar"
```

In each client `CommandItem`, insert before the name text:

```tsx
                  <ClientAvatar id={client.id} name={client.name} size={24} className="mr-2" />
```

In the trigger button, when a selected client renders, prepend the same avatar at `size={20}`.

- [ ] **Step 2: Verify in the app**

`npm run build` green. In `/business`, the client dropdown rows and the selected-client trigger show avatars; creating a new client inline still works.

- [ ] **Step 3: Commit**

```bash
git add components/client-selector.tsx
git commit -m "feat: client selector rows show avatars"
```

---

### Task 12: Visual QA pass (Playwright) + polish

**Files:**
- No planned file changes (fixes discovered here are applied wherever they live).

- [ ] **Step 1: Screenshot sweep**

With `npm run dev` running, use Playwright MCP to screenshot each of
`/`, `/dashboard`, `/business`, `/settings/printers`, `/settings/filaments`, `/history`
at viewport widths 375, 768, 1440 — in light AND dark themes (toggle via the header theme button).

- [ ] **Step 2: Check each screenshot against this list**

- No horizontal overflow at 375px (hero panels, card grids, parts table).
- No broken images (silhouette fallback appears for unmatched printers).
- Text contrast: hero panel copy, muted labels, chart ticks readable in both themes.
- Green primary consistent — no leftover blue `#2563eb`/`#3b82f6` or hardcoded slate hexes on touched surfaces (`grep -rn "3b82f6\|2563eb\|64748b\|334155\|e2e8f0" app components` should return nothing in touched files).
- Quote/invoice documents (`/quote/[id]`) unchanged — open one and confirm.

- [ ] **Step 3: Fix anything found, re-screenshot, then final verify**

Run: `npm run build && npm run lint`
Expected: both green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: responsive and contrast polish from visual QA sweep"
```

---

## Self-Review Notes

- Spec coverage: assets/registry (T1), theme (T2), primitives (T3), calculator pickers (T4–T5), printers grid + image picker (T6), spool wall (T7), dashboard hero/fleet/clients/chart/donut (T8), home hero (T9), history (T10), client selector (T11), QA/testing section (T12). `StatusPipeline` from the spec was **dropped**: `quote-history.tsx` already renders labeled, colored, clickable status badges via `STATUS_CONFIG` — a second pipeline widget would duplicate it (YAGNI). Spec's "pill toggles for status filters" also dropped for the same reason: the status filter is already a multi-select with counts.
- Types consistent: `image_key?: string | null` used identically in T1/T4/T6/T8/T9; `PrinterVisual` size union `"thumb" | "card" | "hero"` used everywhere; `SpoolWithStock` only in T7; `FilamentSpool` sizes are free px.
- Known judgment calls for the implementer: exact insertion points in `filaments-list.tsx` (1735 lines) and `quote-history.tsx` (1473 lines) are described by pattern + line anchors rather than full replacement blocks — the surrounding code must be read before editing those two files.
