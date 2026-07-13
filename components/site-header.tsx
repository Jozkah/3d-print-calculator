import type React from "react"
import Link from "next/link"
import { ArrowLeft, BarChart3, Box, Calculator, Briefcase, History, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "/personal", label: "Personal", icon: Calculator },
  { href: "/business", label: "Business", icon: Briefcase },
  { href: "/history", label: "History", icon: History },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const

export function SiteHeader({ active }: { active?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
            <Box className="size-4.5" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Print<span className="text-primary">Calc</span>
          </span>
        </Link>

        <nav className="flex items-center gap-0.5 sm:gap-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                active === href
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}

export function PageHeader({
  title,
  description,
  backHref,
  children,
  className,
}: {
  title: string
  description?: string
  backHref?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("border-b border-border/70 bg-card", className)}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-5 sm:gap-4 sm:px-6 sm:py-7 lg:px-8">
        {backHref && (
          <Link
            href={backHref}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground shadow-xs transition-colors hover:border-primary/40 hover:text-primary"
            aria-label="Go back"
          >
            <ArrowLeft className="size-4" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          {description && (
            <p className="mt-0.5 hidden text-sm text-muted-foreground sm:block">{description}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
