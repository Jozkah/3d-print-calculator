# 3D Print Cost Calculator

A self-hostable web app for pricing **3D printing, laser cutting and laser engraving** jobs. It turns your real costs — filament, machine depreciation, electricity, labour, packaging, VAT and profit margin — into consistent quotes, keeps a searchable history of everything you've quoted, and can split the books between two business owners.

> **Runs fully locally — no database, no accounts, no cloud.** All your data (printers, filaments, clients, quotes, settings) is stored in your **browser's `localStorage`**. There's no backend to configure and nothing ever leaves your machine. It's a plain Next.js app you can run on your laptop or self-host on any Node host.

## Why I built this

I do a fair amount of 3D printing and laser work, and *pricing* it was always the messy part. Every quote meant re-deriving the same numbers by hand — filament by the gram, machine wear, electricity, labour, packaging, then margin and VAT on top — usually in a throwaway spreadsheet that never quite matched the last one. And with two of us sharing the machines, working out who was owed what at the end of the month was its own headache.

This is the tool that replaced all of that: enter the parts, and it produces a consistent quote from costs I only configure once — then splits the profit between two owners automatically, so the books reconcile on their own. It keeps every quote, so I can look back at what a job *actually* cost to make.

## Screenshot

![3D Print Cost Calculator](docs/screenshot.png)

## Features

- **Personal & Business modes** — a quick personal cost estimate, or a full business quote with profit margin, VAT and a two-owner profit split.
- **Multi-part quotes** — combine several parts (different printers and filaments) into one quote.
- **Three calculators:**
  - **Cost calculator** — the main per-job pricing tool.
  - **Spreadsheet calculator** — Excel-style entry for many rows at once.
  - **Laser calculator** — cutting / engraving jobs priced by material and time.
- **Catalogues you manage once:**
  - **Printers** — purchase cost, expected life hours, power draw, uptime.
  - **Filaments / materials** — price per kg, type, thickness (for laser stock).
  - **Clients** — attach a customer to a quote.
  - **Global settings** — electricity rate, labour rate, emergency surcharge, …
- **Searchable quote history** with a full per-quote cost breakdown.
- **Light / dark theme**, built with Tailwind CSS and shadcn/ui.

## Cost model (in brief)

For each part the app computes:

- **Machine cost** = print hours × (printer purchase cost ÷ estimated life hours)
- **Electricity** = (printer watts ÷ 1000) × hours × electricity rate
- **Filament cost** = grams used × price-per-kg
- plus **labour**, **packaging**, **materials** and an optional **emergency surcharge**

Business quotes then add your **profit margin** and **VAT**, and split the profit (and emergency fees) between two owners. By default Owner A fronts labour, electricity and shipping while Owner B carries filament, materials, packaging and VAT, with profit divided 50/50 — all of which is [configurable](#configuration).

## Getting started

No database, no environment variables, no account. Just install and run:

```bash
npm install    # or: pnpm install
npm run dev    # or: pnpm dev
```

Open <http://localhost:3001>. *(The dev/start port is set to **3001** in `package.json` — change it there if you prefer another.)*

The first time a page loads, sensible default **Global Settings** are seeded automatically. Add your printers, filaments and clients from the **Settings** screens and start quoting.

#### Production build

```bash
npm run build && npm run start
```

Deploys cleanly to Vercel or any Node/static host — there's nothing to configure.

## Where your data lives

Everything is kept in your browser's `localStorage` under keys prefixed with `3dpc:` (one key per table — `3dpc:printers`, `3dpc:quotes`, `3dpc:global_settings`, …). Consequences worth knowing:

- **It's per-browser and per-device.** Data entered in Chrome on your laptop won't appear in Firefox or on another machine.
- **Clearing browser data / site storage wipes it.** There's no server copy.
- **It's private.** Nothing is ever sent to a server.

The data layer lives in [`lib/local-db.ts`](lib/local-db.ts) — a small shim that mimics the query API the app was originally written against, so components didn't have to change.

## Configuration

The whole two-owner business model — owner labels and how profit and emergency fees are split — lives in one file: [`lib/business-config.ts`](lib/business-config.ts). Rename the owners (`OWNER_A_LABEL` / `OWNER_B_LABEL`) or change `PROFIT_SPLIT_RATIO` / `EMERGENCY_SPLIT_RATIO` there.

> The `OWNER_A_KEY` / `OWNER_B_KEY` identifiers are stored with each printer record. They're safe to *relabel*, but don't change the keys themselves once you have data, or existing rows stop matching.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- Browser `localStorage` for persistence (no backend) — see [`lib/local-db.ts`](lib/local-db.ts)
- Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com) (Radix primitives)

## Project layout

```
app/
  page.tsx            # landing
  personal/           # personal cost estimate
  business/           # full business quote
  quote/              # quote builder
  history/            # searchable quote history
  settings/           # printers, filaments, clients, global settings
components/
  cost-calculator.tsx     # main per-job pricing
  excel-calculator.tsx    # spreadsheet-style bulk entry
  laser-calculator.tsx    # laser cutting / engraving
  printers-list.tsx · filaments-list.tsx · clients-list.tsx
  quote-history.tsx · global-settings-form.tsx
  ui/                     # shadcn/ui primitives
lib/
  business-config.ts  # two-owner model: labels + split ratios (edit me)
  local-db.ts         # local (localStorage) data layer — replaces the DB
  supabase/           # thin shims re-exporting local-db (kept for compatibility)
scripts/
  schema.sql          # legacy Postgres schema (unused — kept for reference)
  migrations/         # historical step-by-step migrations (unused)
docs/screenshot.png
```

> **Note:** The `scripts/*.sql` files describe the old Postgres/Supabase schema and are no longer used by the app. They're kept only as documentation of the data model.

## License

[MIT](LICENSE) © Jozkah
