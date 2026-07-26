"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { onLocalDbChange } from "@/lib/local-db"
import { SiteHeader, PageHeader } from "@/components/site-header"
import { PageLoading, PageLoadError } from "@/components/page-loading"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PrinterVisual } from "@/components/visual/printer-visual"
import { ClientAvatar } from "@/components/visual/client-avatar"
import { formatMoney } from "@/lib/format"
import { resolveFilamentColor } from "@/lib/filament-color"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { Filament, GlobalSettings, Printer, Quote } from "@/types/db"

// Realized work only: quotes that were accepted and are (being) delivered.
// Pending offers, drafts and canceled/invalid quotes carry no revenue.
const REALIZED_STATUSES = new Set(["in_progress", "shipping", "finished"])

/**
 * VAT-inclusive revenue of a quote: the stored authoritative final_price when
 * present (target-price quotes), otherwise the same margin recompute the
 * quotation documents use.
 */
function quoteRevenue(q: Quote): number {
  if (q.final_price != null) return q.final_price
  const marginPct = Number.parseFloat(q.selected_margin || "0") / 100
  const multiplier = marginPct > 0 ? 1 / (1 - marginPct) : 1
  const landed = q.landed_cost || 0
  const emergency = q.is_emergency ? q.emergency_fee || 0 : 0
  const vatApplies = q.quote_type === "business" && q.vat_enabled !== false
  const vatRate = q.vat_rate ?? 0.23
  const exVat = landed * multiplier + emergency
  return vatApplies ? exVat * (1 + vatRate) : exVat
}

/** Revenue with any charged VAT stripped, for margin math against landed cost. */
function quoteRevenueExVat(q: Quote): number {
  const revenue = quoteRevenue(q)
  const vatApplies = q.quote_type === "business" && q.vat_enabled !== false
  const vatRate = q.vat_rate ?? 0.23
  return vatApplies ? revenue / (1 + vatRate) : revenue
}

export default function DashboardPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [printers, setPrinters] = useState<Printer[]>([])
  const [filamentsList, setFilamentsList] = useState<Filament[]>([])
  const [settings, setSettings] = useState<GlobalSettings | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data: quotesData, error: quotesError } = await supabase.from("quotes").select("*")
      const { data: clientsData, error: clientsError } = await supabase.from("clients").select("*")
      const { data: printersData, error: printersError } = await supabase.from("printers").select("*")
      const { data: filamentsData, error: filamentsError } = await supabase.from("filaments").select("*")
      const { data: settingsData, error: settingsError } = await supabase
        .from("global_settings")
        .select("*")
        .limit(1)
        .maybeSingle()
      const firstError = quotesError || clientsError || printersError || filamentsError || settingsError
      setLoadError(firstError ? firstError.message || "Could not read saved data." : null)
      setQuotes(quotesData || [])
      setClients(clientsData || [])
      setPrinters(printersData || [])
      setFilamentsList(filamentsData || [])
      setSettings(settingsData ?? null)
      setLoaded(true)
    }
    loadData()
    return onLocalDbChange(loadData)
  }, [])

  const currencySymbol = settings?.currency_symbol || "€"
  const money = (n: number) => formatMoney(n, currencySymbol)

  const realized = useMemo(
    () => quotes.filter((q) => !q.is_draft && REALIZED_STATUSES.has(q.status || "")),
    [quotes],
  )

  // Monthly revenue vs landed cost, last 12 calendar months (oldest first).
  const monthly = useMemo(() => {
    const now = new Date()
    const buckets: { key: string; label: string; revenue: number; cost: number }[] = []
    const indexByKey = new Map<string, number>()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      indexByKey.set(key, buckets.length)
      buckets.push({
        key,
        label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        revenue: 0,
        cost: 0,
      })
    }
    for (const q of realized) {
      const d = new Date(q.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const idx = indexByKey.get(key)
      if (idx === undefined) continue
      buckets[idx].revenue += quoteRevenue(q)
      buckets[idx].cost += q.landed_cost || 0
    }
    return buckets.map((b) => ({
      ...b,
      revenue: Math.round(b.revenue * 100) / 100,
      cost: Math.round(b.cost * 100) / 100,
    }))
  }, [realized])

  const totalRevenue = useMemo(() => realized.reduce((sum, q) => sum + quoteRevenue(q), 0), [realized])

  // Average realized margin: (ex-VAT revenue - landed cost) / ex-VAT revenue,
  // averaged across quotes that have revenue.
  const avgMargin = useMemo(() => {
    const margins = realized
      .map((q) => {
        const exVat = quoteRevenueExVat(q)
        return exVat > 0 ? ((exVat - (q.landed_cost || 0)) / exVat) * 100 : null
      })
      .filter((m): m is number => m !== null)
    if (margins.length === 0) return null
    return margins.reduce((sum, m) => sum + m, 0) / margins.length
  }, [realized])

  // Owner A/B received, current calendar year.
  const ownerTotals = useMemo(() => {
    const year = new Date().getFullYear()
    let a = 0
    let b = 0
    for (const q of realized) {
      if (new Date(q.created_at).getFullYear() !== year) continue
      a += q.owner_a_receives || 0
      b += q.owner_b_receives || 0
    }
    return { a, b }
  }, [realized])

  // Top 5 clients by realized revenue.
  const topClients = useMemo(() => {
    const byClient = new Map<string, { id: string; name: string; count: number; revenue: number }>()
    for (const q of realized) {
      const key = q.client_id || "__none__"
      const name = q.client_id
        ? clients.find((c) => c.id === q.client_id)?.name || "Unknown client"
        : "No client"
      const entry = byClient.get(key) || { id: key, name, count: 0, revenue: 0 }
      entry.count += 1
      entry.revenue += quoteRevenue(q)
      byClient.set(key, entry)
    }
    return [...byClient.values()].sort((x, y) => y.revenue - x.revenue).slice(0, 5)
  }, [realized, clients])

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
        return { id, name: f?.name || "Unknown", grams: g, color: (f ? resolveFilamentColor(f) : null) || FALLBACK[i % FALLBACK.length] }
      })
      .filter((m) => m.grams > 0)
      .sort((a, b) => b.grams - a.grams)
      .slice(0, 6)
  }, [realized, filamentsList])

  // Chart colors come from the theme so both modes stay coherent.
  const revenueColor = "var(--color-chart-1)"
  const costColor = "var(--color-chart-2)"
  const tickColor = "var(--color-muted-foreground)"
  const gridColor = "var(--color-border)"

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/dashboard" />
      <PageHeader
        backHref="/"
        title="Dashboard"
        description="Revenue, margins and workload across your finished and in-flight quotes"
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {!loaded && <PageLoading />}
        {loaded && loadError && <PageLoadError message={loadError} />}
        {loaded && !loadError && (
          <div className="space-y-6">
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

            {/* Revenue vs cost chart */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Revenue vs landed cost — last 12 months</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly} barGap={2} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: tickColor, fontSize: 12 }}
                        axisLine={{ stroke: gridColor }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: tickColor, fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        width={70}
                        tickFormatter={(v: number) => money(v)}
                      />
                      <Tooltip
                        cursor={{ fill: gridColor, opacity: 0.3 }}
                        formatter={(value: number | string, name: string) => [money(Number(value)), name]}
                        contentStyle={{
                          backgroundColor: "var(--color-popover)",
                          border: `1px solid ${gridColor}`,
                          borderRadius: 8,
                          color: "var(--color-popover-foreground)",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="revenue" name="Revenue" fill={revenueColor} radius={[4, 4, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="cost" name="Landed cost" fill={costColor} radius={[4, 4, 0, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

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
                    topClients.map((c) => {
                      const max = topClients[0].revenue || 1
                      return (
                        <div key={c.id} className="flex items-center gap-3">
                          <ClientAvatar id={c.id} name={c.name} size={32} />
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
                                <Cell key={m.id} fill={m.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <ul className="min-w-0 flex-1 space-y-1.5">
                        {materialMix.map((m) => (
                          <li key={m.id} className="flex items-center gap-2 text-sm">
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
          </div>
        )}
      </main>
    </div>
  )
}
