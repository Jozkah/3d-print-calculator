import Link from "next/link"
import {
  Calculator,
  Briefcase,
  History,
  Settings,
  ArrowRight,
  Zap,
  Layers,
  PiggyBank,
  FileText,
  Printer,
  Sparkles,
} from "lucide-react"
import { SiteHeader } from "@/components/site-header"

const TOOLS = [
  {
    href: "/personal",
    icon: Calculator,
    title: "Personal Calculator",
    description: "Quick at-cost estimates for your own prints — filament, power, wear and drying included.",
    cta: "Start estimating",
  },
  {
    href: "/business",
    icon: Briefcase,
    title: "Business Calculator",
    description: "Client-ready quotes with margins, VAT, emergency fees and an automatic profit split.",
    cta: "Build a quote",
  },
  {
    href: "/history",
    icon: History,
    title: "Quote History",
    description: "Every saved quote in one place — filter by client, machine or status, then share or edit.",
    cta: "Browse quotes",
  },
  {
    href: "/settings",
    icon: Settings,
    title: "Settings",
    description: "Manage printers, filaments, laser materials, clients and your global cost rates.",
    cta: "Configure shop",
  },
] as const

const HIGHLIGHTS = [
  {
    icon: Layers,
    title: "True landed cost",
    description: "Filament, machine depreciation, electricity, drying, labor, packaging and travel — nothing slips through.",
  },
  {
    icon: PiggyBank,
    title: "Margins made simple",
    description: "Pick 30/40/50% presets, dial in a custom margin, or work backwards from a target price.",
  },
  {
    icon: FileText,
    title: "Client-ready quotes",
    description: "Save, track and share polished quotations — standard or fully detailed breakdowns.",
  },
] as const

const STEPS = [
  { step: "1", title: "Set up your shop", description: "Add your printers, filaments and cost rates once in Settings." },
  { step: "2", title: "Enter the job", description: "Parts, print time, materials, labor and shipping — the totals update live." },
  { step: "3", title: "Quote with confidence", description: "Pick a margin, save the quote and share it with your client." },
] as const

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/70 bg-card">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 left-1/2 h-[30rem] w-[52rem] max-w-none -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
          />
          <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="size-3.5" />
                3D printing · laser cutting · engraving
              </span>
              <h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground sm:text-5xl text-balance">
                Know exactly what every print costs —{" "}
                <span className="bg-gradient-to-r from-primary to-sky-500 bg-clip-text text-transparent">
                  and what to charge
                </span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg text-pretty">
                A maker-friendly cost and quote calculator for 3D printing and laser work. Capture every euro of
                cost, pick your margin, and send quotes your clients can trust.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/business"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 sm:w-auto"
                >
                  Create a business quote
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/personal"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-6 text-sm font-semibold text-foreground shadow-xs transition-colors hover:border-primary/40 hover:bg-accent sm:w-auto"
                >
                  <Calculator className="size-4 text-primary" />
                  Personal estimate
                </Link>
              </div>
            </div>

            {/* Highlights */}
            <div className="mx-auto mt-14 grid max-w-5xl gap-4 sm:grid-cols-3 sm:gap-6">
              {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-border/80 bg-background/60 p-5 text-left"
                >
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

        {/* Tool cards */}
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Jump back in</h2>
              <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
                Everything you need to run your print shop, four clicks away.
              </p>
            </div>
            <Printer className="hidden size-8 text-primary/30 sm:block" aria-hidden />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
            {TOOLS.map(({ href, icon: Icon, title, description, cta }) => (
              <Link
                key={href}
                href={href}
                className="group relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 sm:p-7"
              >
                <div className="flex items-start justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="size-5.5" />
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">{title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {cta}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border/70 bg-card">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
            <div className="mb-10 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                <Zap className="size-3.5 text-primary" />
                How it works
              </span>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                From spool to sales price in three steps
              </h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-3 sm:gap-8">
              {STEPS.map(({ step, title, description }) => (
                <div key={step} className="relative rounded-2xl border border-border/70 bg-background p-6">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-sm shadow-primary/30">
                    {step}
                  </span>
                  <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70 bg-background">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>
            <span className="font-semibold text-foreground">
              Print<span className="text-primary">Calc</span>
            </span>{" "}
            — self-hosted cost &amp; quote calculator
          </p>
          <nav className="flex items-center gap-4">
            <Link href="/personal" className="transition-colors hover:text-foreground">Personal</Link>
            <Link href="/business" className="transition-colors hover:text-foreground">Business</Link>
            <Link href="/history" className="transition-colors hover:text-foreground">History</Link>
            <Link href="/settings" className="transition-colors hover:text-foreground">Settings</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
