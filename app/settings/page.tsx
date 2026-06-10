import Link from "next/link"
import { Printer, Palette, Settings2, Users, ArrowRight } from "lucide-react"
import { SiteHeader, PageHeader } from "@/components/site-header"

const SECTIONS = [
  {
    href: "/settings/global",
    icon: Settings2,
    title: "Global Settings",
    description: "Electricity, fuel, labor rates and efficiency factors used in every quote.",
  },
  {
    href: "/settings/printers",
    icon: Printer,
    title: "Printers & Machines",
    description: "Your 3D printers with cost, lifetime, power draw and uptime settings.",
  },
  {
    href: "/settings/filaments",
    icon: Palette,
    title: "Filaments & Materials",
    description: "Filament spools, laser materials, brands, colors and prices.",
  },
  {
    href: "/settings/clients",
    icon: Users,
    title: "Clients",
    description: "Customer contact details and notes, ready to attach to quotes.",
  },
] as const

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/settings" />
      <PageHeader
        backHref="/"
        title="Settings"
        description="Configure your shop — rates, machines, materials and clients"
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2 sm:gap-5">
          {SECTIONS.map(({ href, icon: Icon, title, description }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="flex items-start justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-5.5" />
                </span>
                <ArrowRight className="size-4 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
