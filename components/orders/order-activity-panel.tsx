"use client"

import {
  Activity,
  FilePlus2,
  ArrowRightLeft,
  Upload,
  Trash2,
  Play,
  CheckCircle2,
  AlertTriangle,
  Banknote,
  StickyNote,
  Flag,
} from "lucide-react"
import type { OrderActivity } from "@/types/orders"
import type { ActivityType } from "@/types/orders"

function iconFor(type: ActivityType) {
  switch (type) {
    case "order_created":
      return FilePlus2
    case "status_changed":
      return ArrowRightLeft
    case "file_uploaded":
      return Upload
    case "file_deleted":
      return Trash2
    case "task_started":
      return Play
    case "task_completed":
    case "order_completed":
      return CheckCircle2
    case "task_failed":
      return AlertTriangle
    case "payment_recorded":
    case "invoice_created":
    case "invoice_paid":
      return Banknote
    case "note_added":
      return StickyNote
    case "priority_changed":
    case "due_changed":
      return Flag
    default:
      return Activity
  }
}

function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function OrderActivityPanel({ activity }: { activity: OrderActivity[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="border-b border-border/70 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Activity</h3>
      </header>
      <div className="p-4">
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="space-y-3">
            {activity.map((a) => {
              const Icon = iconFor(a.type)
              return (
                <li key={a.id} className="flex gap-2.5">
                  <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Icon className="size-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{a.message}</p>
                    <p className="text-[11px] text-muted-foreground">{when(a.created_at)}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
