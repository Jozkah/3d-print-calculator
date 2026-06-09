# 3D Print Cost Calculator

A self-hostable web app for pricing **3D prints, laser cutting and laser engraving** jobs. It turns your real costs — filament, machine depreciation, electricity, labour, packaging, VAT and profit margin — into consistent quotes, and keeps a history of everything you've quoted.

Built with Next.js (App Router) and Supabase (Postgres). Bring your own Supabase project and it runs entirely on infrastructure you control.

## Features

- **Personal & Business modes** — quick personal cost estimates, or full business quotes with margin, VAT and a configurable two-owner profit split.
- **Multi-part quotes** — combine several parts (different printers/filaments) into one quote.
- **Specialised calculators** — a per-job cost calculator, a spreadsheet-style bulk calculator, and a laser cutting/engraving calculator.
- **Catalogues** — manage your **printers** (purchase cost, life, power draw, uptime), **filaments** (price per kg), **clients**, and **global settings** (electricity rate, labour rate, …).
- **Quote history** — searchable list with detailed per-quote breakdowns.
- **Light/dark theme.**

## Cost model (in brief)

For each part the app computes:

- **Machine cost** = print hours × (printer purchase cost ÷ estimated life hours)
- **Electricity** = (printer watts ÷ 1000) × hours × electricity rate
- **Filament cost** = grams used × price-per-kg
- plus labour, packaging, materials and an optional emergency surcharge

Business quotes then add a profit margin and VAT, and (optionally) split the revenue/cost between two owners — e.g. one who owns the machine and one who runs the work. The two owners are generic ("Owner A" / "Owner B"); rename them to suit your setup.

## Getting started

### 1. Configure Supabase

```bash
cp .env.example .env.local
```

Fill in your project URL and anon key from **Supabase → Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### 2. Database setup

Run the migration files in [`scripts/`](scripts) **in numeric order** (`001_…` first) against your Supabase database — paste them into the Supabase SQL editor, or use the CLI. They create the tables and seed a few example printers/filaments.

> **Important — enable Row-Level Security.** The anon key ships to the browser, so RLS is what actually protects your data. Enable RLS on every table and add policies that match how you intend to use the app (e.g. authenticated-only writes). Without RLS, anyone with the public anon key could read/write your tables.

### 3. Run

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>.

### Production build

```bash
pnpm build && pnpm start
```

Deploys cleanly to Vercel or any Node host. Set the two `NEXT_PUBLIC_SUPABASE_*` variables in your host's environment.

## Tech stack

- [Next.js 14](https://nextjs.org) (App Router) + React + TypeScript
- [Supabase](https://supabase.com) (Postgres) via `@supabase/ssr`
- Tailwind CSS + [shadcn/ui](https://ui.shadcn.com)

## License

[MIT](LICENSE) © Jozkah
