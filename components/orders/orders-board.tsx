"use client"

// Production Kanban board. Uses the browser's native HTML5 drag-and-drop
// (draggable + dataTransfer) — not hand-rolled pointer maths — so a card can be
// dragged between status columns (updates status) or reordered within a column
// (updates queue_position). Touch/keyboard users get the same outcomes via the
// per-card status dropdown and the list view, so no interaction is drag-only.

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import type { Order } from "@/types/db"
import type { OrderStatus } from "@/types/orders"
import { BOARD_COLUMNS, ORDER_STATUS_META } from "@/lib/orders/status"
import { sortForQueue } from "@/lib/orders/compute"
import { setOrderStatus, persistQueueOrder } from "@/lib/orders/data"
import type { OrderDerived } from "@/lib/orders/use-orders"
import { OrderCard } from "@/components/orders/order-card"

type Props = {
  orders: Order[]
  derivedByOrder: Map<string, OrderDerived>
  onChanged: () => void
}

export function OrdersBoard({ orders, derivedByOrder, onChanged }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<OrderStatus | null>(null)

  const byColumn = useMemo(() => {
    const map = new Map<OrderStatus, Order[]>()
    for (const col of BOARD_COLUMNS) map.set(col, [])
    for (const order of orders) {
      if (map.has(order.status)) map.get(order.status)!.push(order)
    }
    for (const col of BOARD_COLUMNS) map.set(col, sortForQueue(map.get(col)!))
    return map
  }, [orders])

  const dragging = draggingId ? orders.find((o) => o.id === draggingId) ?? null : null

  async function handleDropOnColumn(target: OrderStatus, beforeId?: string) {
    if (!dragging) return
    const columnOrders = byColumn.get(target) ?? []

    if (dragging.status !== target) {
      // Cross-column: change status. setOrderStatus appends to the end; if the
      // drop landed on a specific card, reorder afterwards.
      await setOrderStatus(dragging, target)
      if (beforeId) {
        const ids = columnOrders.map((o) => o.id).filter((id) => id !== dragging.id)
        const idx = ids.indexOf(beforeId)
        ids.splice(idx < 0 ? ids.length : idx, 0, dragging.id)
        await persistQueueOrder(ids)
      }
    } else {
      // Same column: reorder.
      const ids = columnOrders.map((o) => o.id).filter((id) => id !== dragging.id)
      const idx = beforeId ? ids.indexOf(beforeId) : -1
      ids.splice(idx < 0 ? ids.length : idx, 0, dragging.id)
      await persistQueueOrder(ids)
    }
    setDraggingId(null)
    setOverColumn(null)
    onChanged()
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {BOARD_COLUMNS.map((col) => {
        const meta = ORDER_STATUS_META[col]
        const columnOrders = byColumn.get(col) ?? []
        return (
          <div
            key={col}
            className={cn(
              "flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl border bg-muted/30 transition-all",
              overColumn === col
                ? "border-primary/50 bg-primary/5 ring-2 ring-primary/20"
                : "border-border/70",
            )}
            onDragOver={(e) => {
              if (dragging) {
                e.preventDefault()
                setOverColumn(col)
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverColumn(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              handleDropOnColumn(col)
            }}
          >
            {/* Coloured hairline ties the whole column to its status colour. */}
            <span className={cn("h-1 w-full", meta.dot)} aria-hidden />
            <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", meta.dot)} />
                <span className="text-sm font-semibold text-foreground">{meta.label}</span>
              </div>
              <span
                className={cn(
                  "min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums",
                  columnOrders.length > 0 ? meta.badge : "bg-background text-muted-foreground",
                )}
              >
                {columnOrders.length}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-2 px-2 pb-2 pt-2">
              {columnOrders.map((order) => (
                <div
                  key={order.id}
                  onDragOver={(e) => {
                    if (dragging && dragging.id !== order.id) e.preventDefault()
                  }}
                  onDrop={(e) => {
                    if (!dragging) return
                    e.preventDefault()
                    e.stopPropagation()
                    handleDropOnColumn(col, order.id)
                  }}
                >
                  <OrderCard
                    order={order}
                    derived={derivedByOrder.get(order.id)}
                    draggable
                    dragging={draggingId === order.id}
                    onDragStart={(e) => {
                      setDraggingId(order.id)
                      e.dataTransfer.effectAllowed = "move"
                      e.dataTransfer.setData("text/plain", order.id)
                    }}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setOverColumn(null)
                    }}
                  />
                </div>
              ))}
              {columnOrders.length === 0 && (
                <div
                  className={cn(
                    "rounded-xl border border-dashed px-3 py-8 text-center text-xs transition-colors",
                    overColumn === col
                      ? "border-primary/40 text-primary"
                      : "border-border/60 text-muted-foreground/60",
                  )}
                >
                  {overColumn === col ? "Drop here" : "No orders"}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
