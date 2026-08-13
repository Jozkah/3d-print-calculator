"use client"

// Loads everything for a single order's detail page and keeps it live. Only
// attachment *metadata* is loaded here — the binary blobs stay in IndexedDB and
// are fetched lazily by the file panel when a preview/download is requested.

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
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
      const supabase = createClient()
      const orderRes = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle()
      const order = (orderRes.data as Order) ?? null
      if (!order) {
        setData((d) => ({ ...d, order: null, loaded: true, notFound: true }))
        return
      }
      const [tasks, notes, attachments, activity, quoteLinks, invoices, payments, settings] = await Promise.all([
        supabase.from("order_tasks").select("*").eq("order_id", orderId).order("sequence", { ascending: true }),
        supabase.from("order_notes").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
        supabase.from("order_attachments").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
        supabase.from("order_activity").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
        supabase.from("order_quote_links").select("*").eq("order_id", orderId).order("created_at", { ascending: true }),
        supabase.from("invoices").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
        supabase.from("payments").select("*").eq("order_id", orderId).order("paid_at", { ascending: false }),
        supabase.from("global_settings").select("*").limit(1).maybeSingle(),
      ])
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
