"use client"

import { useMemo } from "react"
import { useTheme } from "next-themes"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/format"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

// Slices of the quotes/global_settings rows this dashboard reads (this branch
// keeps table types local to each file instead of a shared types/db module).
type Quote = {
  id: string
  quote_type: string
  client_id?: string | null
  printed_parts: any[]
  is_emergency: boolean
  landed_cost: number
  emergency_fee: number
  selected_margin: string
  owner_a_receives: number
  owner_b_receives: number
  created_at: string
  is_draft?: boolean
  status?: string
  final_price?: number | null
  vat_enabled?: boolean
  vat_rate?: number
  [key: string]: any
}

type GlobalSettings = {
  currency_symbol?: string
  [key: string]: any
}

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

export function DashboardView({
  quotes,
  clients,
  printers,
  settings,
}: {
  quotes: Quote[]
  clients: any[]
  printers: any[]
  settings: GlobalSettings | null
}) {
  const { resolvedTheme } = useTheme()

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
    const byClient = new Map<string, { name: string; count: number; revenue: number }>()
    for (const q of realized) {
      const key = q.client_id || "__none__"
      const name = q.client_id
        ? clients.find((c) => c.id === q.client_id)?.name || "Unknown client"
        : "No client"
      const entry = byClient.get(key) || { name, count: 0, revenue: 0 }
      entry.count += 1
      entry.revenue += quoteRevenue(q)
      byClient.set(key, entry)
    }
    return [...byClient.values()].sort((x, y) => y.revenue - x.revenue).slice(0, 5)
  }, [realized, clients])

  // Printing hours per printer across realized quotes (both part shapes carry
  // printer_id directly on the part).
  const printerHours = useMemo(() => {
    const byPrinter = new Map<string, number>()
    for (const q of realized) {
      for (const part of q.printed_parts || []) {
        if (!part?.printer_id) continue
        byPrinter.set(part.printer_id, (byPrinter.get(part.printer_id) || 0) + (Number(part.printing_time_hr) || 0))
      }
    }
    return [...byPrinter.entries()]
      .map(([printerId, hours]) => ({
        name: printers.find((p) => p.id === printerId)?.name || "Unknown printer",
        hours,
      }))
      .sort((x, y) => y.hours - x.hours)
  }, [realized, printers])

  // Series colors validated for both surfaces (CVD-safe pair, 3:1+ contrast).
  const revenueColor = resolvedTheme === "dark" ? "#3b82f6" : "#2563eb"
  const costColor = "#d97706"
  const tickColor = "#64748b"
  const gridColor = resolvedTheme === "dark" ? "#334155" : "#e2e8f0"

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Realized revenue</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{money(totalRevenue)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {realized.length} quote{realized.length !== 1 ? "s" : ""} in progress or done
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Avg realized margin</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {avgMargin === null ? "—" : `${avgMargin.toFixed(1)}%`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Ex-VAT revenue vs landed cost</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Owner A received (YTD)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{money(ownerTotals.a)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Business profit split</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Owner B received (YTD)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{money(ownerTotals.b)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Business profit split</p>
          </CardContent>
        </Card>
      </div>

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
                    backgroundColor: resolvedTheme === "dark" ? "#1e293b" : "#ffffff",
                    border: `1px solid ${gridColor}`,
                    borderRadius: 8,
                    color: resolvedTheme === "dark" ? "#e2e8f0" : "#0f172a",
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

      {/* Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Top clients by revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {topClients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No realized quotes yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-semibold">Client</th>
                    <th className="py-2 pr-4 text-right font-semibold">Quotes</th>
                    <th className="py-2 text-right font-semibold">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topClients.map((c) => (
                    <tr key={c.name} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4 text-foreground">{c.name}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{c.count}</td>
                      <td className="py-2 text-right tabular-nums font-medium text-foreground">
                        {money(c.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Printing hours per printer</CardTitle>
          </CardHeader>
          <CardContent>
            {printerHours.length === 0 ? (
              <p className="text-sm text-muted-foreground">No printed parts on realized quotes yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-semibold">Printer</th>
                    <th className="py-2 text-right font-semibold">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {printerHours.map((p) => (
                    <tr key={p.name} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4 text-foreground">{p.name}</td>
                      <td className="py-2 text-right tabular-nums font-medium text-foreground">
                        {p.hours.toFixed(1)} h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
