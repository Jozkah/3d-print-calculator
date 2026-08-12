"use client"

// Small shared badge/indicator primitives for the Orders UI. Colours come from
// the centralized status model (lib/orders/status.ts) so the vocabulary stays
// consistent everywhere.

import { AlertTriangle, CalendarClock, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  ORDER_STATUS_META,
  ORDER_PRIORITY_META,
  PAYMENT_STATUS_META,
  TASK_STATUS_META,
} from "@/lib/orders/status"
import type { OrderStatus, OrderPriority, PaymentStatus, OrderTaskStatus } from "@/types/orders"
import { dueState, dueStateLabel, type DueState } from "@/lib/orders/compute"

const base = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const meta = ORDER_STATUS_META[status]
  if (!meta) return null
  return (
    <span className={cn(base, meta.badge, className)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  )
}

export function PriorityBadge({ priority, className }: { priority: OrderPriority; className?: string }) {
  const meta = ORDER_PRIORITY_META[priority]
  if (!meta) return null
  // Low/normal are visually quiet; high/urgent stand out (no rainbow).
  if (priority === "low" || priority === "normal") {
    return <span className={cn(base, meta.badge, className)}>{meta.label}</span>
  }
  return (
    <span className={cn(base, meta.badge, className)}>
      {priority === "urgent" && <AlertTriangle className="size-3" />}
      {meta.label}
    </span>
  )
}

export function PaymentBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const meta = PAYMENT_STATUS_META[status]
  if (!meta) return null
  return <span className={cn(base, meta.badge, className)}>{meta.label}</span>
}

export function TaskStatusBadge({ status, className }: { status: OrderTaskStatus; className?: string }) {
  const meta = TASK_STATUS_META[status]
  if (!meta) return null
  return (
    <span className={cn(base, meta.badge, className)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  )
}

const DUE_STYLES: Record<DueState, string> = {
  overdue: "text-red-600 dark:text-red-400 font-semibold",
  today: "text-orange-600 dark:text-orange-400 font-medium",
  tomorrow: "text-amber-600 dark:text-amber-400",
  soon: "text-muted-foreground",
  normal: "text-muted-foreground",
  none: "text-muted-foreground/70",
}

/** Due-date indicator that never relies on colour alone (icon + text). */
export function DueIndicator({
  dueDate,
  className,
  showOnTrack = false,
}: {
  dueDate: string | null | undefined
  className?: string
  showOnTrack?: boolean
}) {
  const state = dueState(dueDate)
  if (state === "none") return null
  if (state === "normal" && !showOnTrack) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs", DUE_STYLES.normal, className)}>
        <CalendarClock className="size-3" />
        {formatDueDate(dueDate)}
      </span>
    )
  }
  const Icon = state === "overdue" ? AlertTriangle : state === "today" || state === "tomorrow" ? Clock : CalendarClock
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", DUE_STYLES[state], className)}>
      <Icon className="size-3" />
      {dueStateLabel(state)}
    </span>
  )
}

function formatDueDate(dueDate: string | null | undefined): string {
  if (!dueDate) return ""
  const d = new Date(dueDate)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}
