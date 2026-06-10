# 3D Print Cost Calculator

A self-hostable web app for pricing **3D prints, laser cutting and laser engraving** jobs. It turns your real costs — filament, machine depreciation, electricity, labour, packaging, VAT and profit margin — into consistent quotes, and keeps a history of everything you've quoted.

Built with Next.js (App Router) and Supabase (Postgres). Bring your own Supabase project and it runs entirely on infrastructure you control.

## Screenshot

![PrintCalc — landing](docs/screenshot.png)

> The calculator, catalogue and history screens populate once you connect your own Supabase project (see **Getting started** below).

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

Run [`scripts/schema.sql`](scripts/schema.sql) once against your Supabase database (paste it into the Supabase SQL editor) to create all tables and seed a few example printers/filaments. It is the consolidated equivalent of the step-by-step files kept in [`scripts/migrations/`](scripts/migrations) for history.

Then apply the security policies — see below.

### 3. Security (read this before going public)

This app talks to Supabase with the **public anon key** and ships with **no login screen**. That key is embedded in the browser bundle, so **without Row-Level Security anyone who opens the site can read and write every table.**

Run [`scripts/rls_policies.sql`](scripts/rls_policies.sql) to enable RLS. It offers two models:

- **Model A (recommended):** access for logged-in users only. You'll need to add [Supabase Auth](https://supabase.com/docs/guides/auth) (e.g. email magic-link) to your deployment, after which the policies lock out the public.
- **Model B (danger):** allow the anon role — only acceptable on a trusted/private network. The file documents the trade-off.

If you do nothing here, **do not expose the deployment to the public internet.**

### 4. Run

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

## Configuration

The two-owner business model (owner names + how profit and emergency fees are
split) lives in one file: [`lib/business-config.ts`](lib/business-config.ts).
Rename the owners or change the split ratio there.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- [Supabase](https://supabase.com) (Postgres) via `@supabase/ssr`
- Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com)

## License

[MIT](LICENSE) © Jozkah
