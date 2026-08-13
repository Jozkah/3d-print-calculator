"use client"

// Shared data hook for the Orders overview surfaces (board, list, summary).
//
// Loads the orders table plus the small related tables needed to render cards
// (tasks → progress + workload, payments/invoices → payment status) in one pass
// and indexes them by order_id. It never touches attachment blobs — only
// metadata is loaded lazily on the detail page — so opening /orders stays fast
// with thousands of historical orders.

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { onDbChange } from "@/lib/db-realtime"
import { backfillOrderNumbers } from "@/lib/orders/numbering"
import type { Order, OrderTask, Payment, Invoice, GlobalSettings } from "@/types/db"
import { computeProgress, computeFinancials, aggregateEstimatedMinutes } from "@/lib/orders/compute"
import type { OrderProgress, OrderFinancials } from "@/types/orders"

export type OrderDerived = {
  progress: OrderProgress
  financials: OrderFinancials
  estimatedMinutes: number
}

export type OrdersData = {
  orders: Order[]
  tasksByOrder: Map<string, OrderTask[]>
  derivedByOrder: Map<string, OrderDerived>
  settings: GlobalSettings | null
  loaded: boolean
  error: string | null
  reload: () => void
}

function groupBy<T extends { order_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const list = map.get(row.order_id)
    if (list) list.push(row)
    else map.set(row.order_id, [row])
  }
  return map
}

export function useOrdersData(): OrdersData {
  const [orders, setOrders] = useState<Order[]>([])
  const [tasks, setTasks] = useState<OrderTask[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [settings, setSettings] = useState<GlobalSettings | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const supabase = createClient()
        await backfillOrderNumbers()
        const [ordersRes, tasksRes, paymentsRes, invoicesRes, settingsRes] = await Promise.all([
          supabase.from("orders").select("*").order("created_at", { ascending: false }),
          supabase.from("order_tasks").select("*"),
          supabase.from("payments").select("*"),
          supabase.from("invoices").select("*"),
          supabase.from("global_settings").select("*").limit(1).maybeSingle(),
        ])
        if (cancelled) return
        const firstError = ordersRes.error || tasksRes.error || paymentsRes.error || invoicesRes.error
        setError(firstError ? firstError.message || "Could not read saved orders." : null)
        setOrders((ordersRes.data as Order[]) ?? [])
        setTasks((tasksRes.data as OrderTask[]) ?? [])
        setPayments((paymentsRes.data as Payment[]) ?? [])
        setInvoices((invoicesRes.data as Invoice[]) ?? [])
        setSettings((settingsRes.data as GlobalSettings) ?? null)
        setLoaded(true)
      } catch (e: unknown) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "Could not read saved orders.")
        setLoaded(true)
      }
    }
    load()
    const unsub = onDbChange((table) => {
      // Refetch on any change to a table we render.
      if (
        !table ||
        ["orders", "order_tasks", "payments", "invoices", "global_settings"].includes(table)
      ) {
        load()
      }
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [tick])

  const tasksByOrder = useMemo(() => groupBy(tasks), [tasks])
  const paymentsByOrder = useMemo(() => groupBy(payments), [payments])
  const invoicesByOrder = useMemo(() => groupBy(invoices), [invoices])

  const derivedByOrder = useMemo(() => {
    const map = new Map<string, OrderDerived>()
    for (const order of orders) {
      const orderTasks = tasksByOrder.get(order.id) ?? []
      const orderPayments = paymentsByOrder.get(order.id) ?? []
      const orderInvoices = invoicesByOrder.get(order.id) ?? []
      const hasInvoice = orderInvoices.length > 0
      const invoiceVoided = hasInvoice && orderInvoices.every((i) => i.voided_at)
      map.set(order.id, {
        progress: computeProgress(orderTasks),
        financials: computeFinancials(order, orderPayments, { hasInvoice, invoiceVoided }),
        estimatedMinutes: order.estimated_minutes ?? aggregateEstimatedMinutes(orderTasks),
      })
    }
    return map
  }, [orders, tasksByOrder, paymentsByOrder, invoicesByOrder])

  return { orders, tasksByOrder, derivedByOrder, settings, loaded, error, reload }
}
