"use client"

import Link from "next/link"
import { GripVertical, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/format"
import { formatDuration } from "@/lib/orders/compute"
import { ORDER_STATUS_META } from "@/lib/orders/status"
import type { Order } from "@/types/db"
import type { OrderDerived } from "@/lib/orders/use-orders"
import { PriorityBadge, PaymentBadge, DueIndicator } from "@/components/orders/order-badges"

type Props = {
  order: Order
  derived: OrderDerived | undefined
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  dragging?: boolean
}

export function OrderCard({ order, derived, draggable, onDragStart, onDragEnd, dragging }: Props) {
  const currency = order.currency_symbol || "€"
  const progress = derived?.progress
  const financials = derived?.financials
  const estMinutes = derived?.estimatedMinutes ?? 0
  const statusMeta = ORDER_STATUS_META[order.status]
  const isUrgent = order.priority === "urgent"

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-3 pl-3.5 shadow-sm transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
        isUrgent && "border-red-500/30 ring-1 ring-red-500/15",
        dragging && "rotate-1 opacity-50 shadow-lg",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      {/* Status accent stripe — instant colour-coding down the left edge. */}
      <span className={cn("absolute inset-y-0 left-0 w-1", statusMeta?.dot ?? "bg-border")} aria-hidden />
      {draggable && (
        <GripVertical className="absolute right-1 top-3 size-4 text-muted-foreground/25 transition-colors group-hover:text-muted-foreground/60" />
      )}
      <Link href={`/orders/${order.id}`} className="block">
        <div className="flex items-center gap-2 pr-4">
          <span className="font-mono text-[11px] font-medium text-muted-foreground">{order.order_number}</span>
          {order.priority !== "normal" && order.priority !== "low" && (
            <PriorityBadge priority={order.priority} />
          )}
        </div>
        <h4 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">{order.title}</h4>
        {order.client_snapshot?.name && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <User className="size-3 shrink-0" />
            <span className="truncate">{order.client_snapshot.name}</span>
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {progress?.hasTasks && (
            <span className="text-xs font-medium text-muted-foreground">
              {progress.completed} / {progress.total} tasks
            </span>
          )}
          {estMinutes > 0 && <span className="text-xs text-muted-foreground">{formatDuration(estMinutes)}</span>}
          <DueIndicator dueDate={order.due_date} />
        </div>

        {progress?.hasTasks && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-500"
              style={{ width: `${Math.round(progress.fraction * 100)}%` }}
            />
          </div>
        )}

        {(order.total != null || financials) && (
          <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2">
            <span className="text-sm font-bold tabular-nums text-foreground">
              {order.total != null ? formatMoney(order.total, currency) : "—"}
            </span>
            {financials && <PaymentBadge status={financials.status} />}
          </div>
        )}
      </Link>
    </div>
  )
}
