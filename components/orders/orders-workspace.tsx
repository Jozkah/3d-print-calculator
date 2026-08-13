"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { LayoutGrid, List, Plus, Search, X, Archive } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageLoading, PageLoadError } from "@/components/page-loading"
import { useOrdersData } from "@/lib/orders/use-orders"
import { dueState } from "@/lib/orders/compute"
import { ORDER_STATUSES, ORDER_STATUS_META, ORDER_PRIORITIES, ORDER_PRIORITY_META } from "@/lib/orders/status"
import type { Order } from "@/types/db"
import type { OrderStatus, OrderPriority } from "@/types/orders"
import { OrdersSummary } from "@/components/orders/orders-summary"
import { OrdersBoard } from "@/components/orders/orders-board"
import { OrdersList } from "@/components/orders/orders-list"
import { NewOrderDialog } from "@/components/orders/new-order-dialog"

type ViewMode = "board" | "list"

function matchesSearch(order: Order, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  const hay = [
    order.order_number,
    order.title,
    order.description,
    order.client_snapshot?.name,
    order.client_snapshot?.email,
    order.client_snapshot?.phone,
    ...(order.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return hay.includes(needle)
}

export function OrdersWorkspace() {
  const { orders, derivedByOrder, loaded, error, reload } = useOrdersData()
  const [view, setView] = useState<ViewMode>("board")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all")
  const [priorityFilter, setPriorityFilter] = useState<OrderPriority | "all">("all")
  const [quick, setQuick] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // "/" focuses search (productivity shortcut).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (!showArchived && o.archived_at) return false
      if (showArchived && !o.archived_at) return false
      if (!matchesSearch(o, search)) return false
      if (statusFilter !== "all" && o.status !== statusFilter) return false
      if (priorityFilter !== "all" && o.priority !== priorityFilter) return false
      if (quick) {
        const fin = derivedByOrder.get(o.id)?.financials.status
        if (quick === "overdue" && dueState(o.due_date) !== "overdue") return false
        if (quick === "due_soon" && !["today", "tomorrow", "soon"].includes(dueState(o.due_date))) return false
        if (quick === "awaiting_payment" && fin !== "unpaid" && fin !== "partially_paid") return false
        if (["queued", "in_production", "ready"].includes(quick) && o.status !== quick) return false
      }
      return true
    })
  }, [orders, search, statusFilter, priorityFilter, quick, showArchived, derivedByOrder])

  const hasFilters = search || statusFilter !== "all" || priorityFilter !== "all" || quick || showArchived

  function clearFilters() {
    setSearch("")
    setStatusFilter("all")
    setPriorityFilter("all")
    setQuick(null)
    setShowArchived(false)
  }

  function onQuickFilter(key: string) {
    setQuick((prev) => (prev === key ? null : key))
    // Quick filters that aren't board columns force the list view for clarity.
    if (["overdue", "due_soon", "awaiting_payment"].includes(key)) setView("list")
  }

  if (!loaded) return <PageLoading />
  if (error) return <PageLoadError message={error} />

  const activeOrders = orders.filter((o) => !o.archived_at)

  return (
    <div className="space-y-4">
      <OrdersSummary
        orders={orders}
        derivedByOrder={derivedByOrder}
        activeFilter={quick}
        onQuickFilter={onQuickFilter}
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders, customers, tags…  ( / )"
            className="bg-card pl-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatus | "all")}>
            <SelectTrigger className="w-[150px] bg-card" size="sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {ORDER_STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as OrderPriority | "all")}>
            <SelectTrigger className="w-[130px] bg-card" size="sm">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {ORDER_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {ORDER_PRIORITY_META[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
            title="Show archived orders"
          >
            <Archive className="size-4" />
          </Button>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="size-4" />
              Clear
            </Button>
          )}

          <div className="flex overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setView("board")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 text-sm transition-colors",
                view === "board" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 text-sm transition-colors",
                view === "list" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="size-4" />
            </button>
          </div>

          <Button onClick={() => setNewOpen(true)} className="shadow-sm">
            <Plus className="size-4" />
            <span className="hidden sm:inline">New Order</span>
          </Button>
        </div>
      </div>

      {/* Content */}
      {activeOrders.length === 0 && !showArchived ? (
        <EmptyState onNew={() => setNewOpen(true)} />
      ) : view === "board" && !showArchived ? (
        <OrdersBoard orders={filtered} derivedByOrder={derivedByOrder} onChanged={reload} />
      ) : (
        <OrdersList orders={filtered} derivedByOrder={derivedByOrder} />
      )}

      <NewOrderDialog open={newOpen} onOpenChange={setNewOpen} onCreated={reload} />
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <h3 className="text-lg font-semibold text-foreground">No orders yet</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
        Create your first order manually, or turn an existing quote into an order from Quote History.
      </p>
      <Button onClick={onNew} className="mt-5">
        <Plus className="size-4" />
        New Order
      </Button>
    </div>
  )
}
