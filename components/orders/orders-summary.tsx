"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import type { Order } from "@/types/db"
import type { OrderStatus } from "@/types/orders"
import { dueState, formatDuration } from "@/lib/orders/compute"
import { isActiveStatus } from "@/lib/orders/status"
import type { OrderDerived } from "@/lib/orders/use-orders"

type Props = {
  orders: Order[]
  derivedByOrder: Map<string, OrderDerived>
  activeFilter?: string | null
  onQuickFilter?: (key: string) => void
}

type Tile = { key: string; label: string; value: string; tone?: "danger" | "warn" | "ok"; filter?: string }

export function OrdersSummary({ orders, derivedByOrder, activeFilter, onQuickFilter }: Props) {
  const tiles = useMemo<Tile[]>(() => {
    const live = orders.filter((o) => !o.archived_at)
    const byStatus = (s: OrderStatus) => live.filter((o) => o.status === s).length
    const active = live.filter((o) => isActiveStatus(o.status)).length
    const overdue = live.filter((o) => isActiveStatus(o.status) && dueState(o.due_date) === "overdue").length
    const dueSoon = live.filter(
      (o) => isActiveStatus(o.status) && ["today", "tomorrow", "soon"].includes(dueState(o.due_date)),
    ).length
    const awaitingPayment = live.filter((o) => {
      const st = derivedByOrder.get(o.id)?.financials.status
      return st === "unpaid" || st === "partially_paid"
    }).length
    const queueMinutes = live
      .filter((o) => o.status === "queued" || o.status === "in_production")
      .reduce((sum, o) => sum + (derivedByOrder.get(o.id)?.estimatedMinutes ?? 0), 0)

    return [
      { key: "active", label: "Active", value: String(active) },
      { key: "queued", label: "In Queue", value: String(byStatus("queued")), filter: "queued" },
      { key: "in_production", label: "In Production", value: String(byStatus("in_production")), filter: "in_production" },
      { key: "due_soon", label: "Due Soon", value: String(dueSoon), tone: dueSoon ? "warn" : undefined, filter: "due_soon" },
      { key: "overdue", label: "Overdue", value: String(overdue), tone: overdue ? "danger" : undefined, filter: "overdue" },
      { key: "ready", label: "Ready", value: String(byStatus("ready")), tone: "ok", filter: "ready" },
      {
        key: "awaiting_payment",
        label: "Awaiting Payment",
        value: String(awaitingPayment),
        tone: awaitingPayment ? "warn" : undefined,
        filter: "awaiting_payment",
      },
      { key: "workload", label: "Queue Workload", value: formatDuration(queueMinutes) },
    ]
  }, [orders, derivedByOrder])

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {tiles.map((t) => {
        const clickable = Boolean(t.filter && onQuickFilter)
        const isActive = t.filter && activeFilter === t.filter
        return (
          <button
            key={t.key}
            type="button"
            disabled={!clickable}
            onClick={() => t.filter && onQuickFilter?.(t.filter)}
            className={cn(
              "rounded-xl border bg-card px-3 py-2.5 text-left transition-colors",
              clickable && "hover:border-primary/40",
              isActive ? "border-primary/60 ring-1 ring-primary/30" : "border-border",
              !clickable && "cursor-default",
            )}
          >
            <div
              className={cn(
                "text-lg font-bold tabular-nums leading-none",
                t.tone === "danger" && "text-red-600 dark:text-red-400",
                t.tone === "warn" && "text-amber-600 dark:text-amber-400",
                t.tone === "ok" && "text-emerald-600 dark:text-emerald-400",
                !t.tone && "text-foreground",
              )}
            >
              {t.value}
            </div>
            <div className="mt-1 text-[11px] font-medium leading-tight text-muted-foreground">{t.label}</div>
          </button>
        )
      })}
    </div>
  )
}
