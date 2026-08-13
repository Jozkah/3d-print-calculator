"use client"

// Loads everything for a single order's detail page and keeps it live. Only
// attachment *metadata* is loaded here — the binary blobs stay in IndexedDB and
// are fetched lazily by the file panel when a preview/download is requested.

import { useCallback, useEffect, useState } from "react"
import { loadTables } from "@/lib/db-batch"
import { onDbChange } from "@/lib/db-realtime"
import type {
  Order,
  OrderTask,
  OrderNote,
  OrderAttachment,
  OrderActivity,
  OrderQuoteLink,
  Invoice,
  Payment,
  GlobalSettings,
} from "@/types/db"

export type OrderDetailData = {
  order: Order | null
  tasks: OrderTask[]
  notes: OrderNote[]
  attachments: OrderAttachment[]
  activity: OrderActivity[]
  quoteLinks: OrderQuoteLink[]
  invoices: Invoice[]
  payments: Payment[]
  settings: GlobalSettings | null
  loaded: boolean
  notFound: boolean
  error: string | null
  reload: () => void
}

export function useOrderDetail(orderId: string): OrderDetailData {
  const [data, setData] = useState<Omit<OrderDetailData, "reload">>({
    order: null,
    tasks: [],
    notes: [],
    attachments: [],
    activity: [],
    quoteLinks: [],
    invoices: [],
    payments: [],
    settings: null,
    loaded: false,
    notFound: false,
    error: null,
  })

  const load = useCallback(async () => {
    try {
      // One batched round-trip for the order + all its related tables.
      const eqOrder = [{ col: "order_id", op: "eq" as const, val: orderId }]
      const [orderRes, tasks, notes, attachments, activity, quoteLinks, invoices, payments, settings] =
        await loadTables([
          { table: "orders", filters: [{ col: "id", op: "eq", val: orderId }], single: "maybe" },
          { table: "order_tasks", filters: eqOrder, orders: [{ col: "sequence", asc: true }] },
          { table: "order_notes", filters: eqOrder, orders: [{ col: "created_at", asc: false }] },
          { table: "order_attachments", filters: eqOrder, orders: [{ col: "created_at", asc: false }] },
          { table: "order_activity", filters: eqOrder, orders: [{ col: "created_at", asc: false }] },
          { table: "order_quote_links", filters: eqOrder, orders: [{ col: "created_at", asc: true }] },
          { table: "invoices", filters: eqOrder, orders: [{ col: "created_at", asc: false }] },
          { table: "payments", filters: eqOrder, orders: [{ col: "paid_at", asc: false }] },
          { table: "global_settings", limit: 1, single: "maybe" },
        ])
      const order = (orderRes.data as Order) ?? null
      if (!order) {
        setData((d) => ({ ...d, order: null, loaded: true, notFound: true }))
        return
      }
      setData({
        order,
        tasks: (tasks.data as OrderTask[]) ?? [],
        notes: (notes.data as OrderNote[]) ?? [],
        attachments: (attachments.data as OrderAttachment[]) ?? [],
        activity: (activity.data as OrderActivity[]) ?? [],
        quoteLinks: (quoteLinks.data as OrderQuoteLink[]) ?? [],
        invoices: (invoices.data as Invoice[]) ?? [],
        payments: (payments.data as Payment[]) ?? [],
        settings: (settings.data as GlobalSettings) ?? null,
        loaded: true,
        notFound: false,
        error: null,
      })
    } catch (e: unknown) {
      setData((d) => ({ ...d, loaded: true, error: e instanceof Error ? e.message : "Could not load order." }))
    }
  }, [orderId])

  useEffect(() => {
    load()
    const unsub = onDbChange((table) => {
      if (
        !table ||
        [
          "orders",
          "order_tasks",
          "order_notes",
          "order_attachments",
          "order_activity",
          "order_quote_links",
          "invoices",
          "payments",
        ].includes(table)
      ) {
        load()
      }
    })
    return unsub
  }, [load])

  return { ...data, reload: load }
}
