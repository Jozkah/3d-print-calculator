"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/format"
import { formatDuration } from "@/lib/orders/compute"
import { priorityRank, ORDER_STATUS_META } from "@/lib/orders/status"
import type { Order } from "@/types/db"
import type { OrderDerived } from "@/lib/orders/use-orders"
import { StatusBadge, PriorityBadge, PaymentBadge, DueIndicator } from "@/components/orders/order-badges"

type SortKey = "order_number" | "title" | "status" | "priority" | "due_date" | "total" | "created_at"
type SortDir = "asc" | "desc"

type Props = {
  orders: Order[]
  derivedByOrder: Map<string, OrderDerived>
}

export function OrdersList({ orders, derivedByOrder }: Props) {
  const router = useRouter()
  const [sortKey, setSortKey] = useState<SortKey>("created_at")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1
    return [...orders].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "priority":
          cmp = priorityRank(a.priority) - priorityRank(b.priority)
          break
        case "total":
          cmp = (a.total ?? -1) - (b.total ?? -1)
          break
        case "due_date":
          cmp = new Date(a.due_date ?? "9999").getTime() - new Date(b.due_date ?? "9999").getTime()
          break
        case "created_at":
          cmp = new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
          break
        default:
          cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""))
      }
      return cmp * dir
    })
  }, [orders, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir(key === "created_at" || key === "total" ? "desc" : "asc")
    }
  }

  const sortProps = { sortKey, sortDir, onSort: toggleSort }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
      <table className="w-full min-w-[880px] text-sm">
        <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider">
          <tr>
            <th className="w-1 p-0" aria-hidden />
            <SortableTh label="Order" k="order_number" {...sortProps} />
            <SortableTh label="Customer" {...sortProps} />
            <SortableTh label="Status" k="status" {...sortProps} />
            <SortableTh label="Priority" k="priority" {...sortProps} />
            <SortableTh label="Due" k="due_date" {...sortProps} />
            <SortableTh label="Progress" {...sortProps} />
            <SortableTh label="Est." {...sortProps} />
            <SortableTh label="Total" k="total" className="text-right" {...sortProps} />
            <SortableTh label="Payment" {...sortProps} />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {sorted.map((order) => {
            const d = derivedByOrder.get(order.id)
            const statusMeta = ORDER_STATUS_META[order.status]
            return (
              <tr
                key={order.id}
                onClick={() => router.push(`/orders/${order.id}`)}
                className="group cursor-pointer transition-colors hover:bg-primary/5"
              >
                {/* Status-coloured leading accent, revealed on hover. */}
                <td className="p-0">
                  <span
                    className={cn(
                      "block h-9 w-1 opacity-40 transition-opacity group-hover:opacity-100",
                      statusMeta?.dot ?? "bg-border",
                    )}
                    aria-hidden
                  />
                </td>
                <td className="px-3 py-3">
                  <div className="font-mono text-[11px] text-muted-foreground">{order.order_number}</div>
                  <div className="max-w-[220px] truncate font-medium text-foreground transition-colors group-hover:text-primary">
                    {order.title}
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  <span className="block max-w-[160px] truncate">{order.client_snapshot?.name || "—"}</span>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-3 py-3">
                  <PriorityBadge priority={order.priority} />
                </td>
                <td className="px-3 py-3">
                  <DueIndicator dueDate={order.due_date} showOnTrack />
                </td>
                <td className="px-3 py-3">
                  {d?.progress.hasTasks ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary"
                          style={{ width: `${Math.round(d.progress.fraction * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {d.progress.completed}/{d.progress.total}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {d && d.estimatedMinutes > 0 ? formatDuration(d.estimatedMinutes) : "—"}
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-foreground">
                  {order.total != null ? formatMoney(order.total, order.currency_symbol || "€") : "—"}
                </td>
                <td className="px-3 py-3">{d && <PaymentBadge status={d.financials.status} />}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {sorted.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted-foreground">No orders match.</div>}
    </div>
  )
}

function SortableTh({
  label,
  k,
  className,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string
  k?: SortKey
  className?: string
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
}) {
  return (
    <th className={cn("px-3 py-2 text-left font-medium text-muted-foreground", className)}>
      {k ? (
        <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
          {label}
          {sortKey === k ? (
            sortDir === "asc" ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            )
          ) : (
            <ChevronsUpDown className="size-3 opacity-40" />
          )}
        </button>
      ) : (
        label
      )}
    </th>
  )
}
