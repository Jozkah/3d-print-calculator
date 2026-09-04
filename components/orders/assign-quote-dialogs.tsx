"use client"

// Two small pickers that wire the existing linkQuote() backend to the UI, so a
// saved quote (draft or final) can be attached to an order from either side:
//   - AssignQuoteToOrderDialog: start from a quote, pick which order to attach it to.
//   - AddQuoteToOrderDialog:    start from an order, pick which quote to attach.
// Both just call linkQuote(); make-primary / unlink live on the order page.

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { linkQuote } from "@/lib/orders/data"
import { ORDER_STATUS_META } from "@/lib/orders/status"
import type { Order, OrderStatus } from "@/types/orders"
import type { Quote as QuoteRow } from "@/types/db"

const rowClass =
  "w-full rounded-lg border border-border/70 bg-card px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:bg-muted/40 disabled:opacity-50"

function useDismissable(open: boolean) {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) setBusy(false)
  }, [open])
  return [busy, setBusy] as const
}

/** Start from a quote → choose an order to attach it to. */
export function AssignQuoteToOrderDialog({
  open,
  onOpenChange,
  quote,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  quote: QuoteRow | null
  onDone?: () => void
}) {
  const { toast } = useToast()
  const [orders, setOrders] = useState<Order[]>([])
  const [q, setQ] = useState("")
  const [busy, setBusy] = useDismissable(open)

  useEffect(() => {
    if (!open) return
    setQ("")
    let active = true
    createClient()
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (active && data) setOrders(data as Order[])
      })
    return () => {
      active = false
    }
  }, [open])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return orders
    return orders.filter((o) =>
      [o.order_number, o.title, o.client_name].filter(Boolean).some((s) => String(s).toLowerCase().includes(needle)),
    )
  }, [orders, q])

  async function assign(order: Order) {
    if (!quote || busy) return
    setBusy(true)
    try {
      await linkQuote(order.id, quote as unknown as Record<string, any>)
      toast({ title: `Assigned to ${order.order_number || order.title}` })
      onOpenChange(false)
      onDone?.()
    } catch (e: unknown) {
      toast({
        title: "Could not assign quote",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign quote to an order</DialogTitle>
          <DialogDescription>
            {quote ? `Attach “${quote.quote_name || quote.quote_number || "quote"}” to an existing order.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search orders…"
            className="bg-card pl-8"
          />
        </div>
        <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No orders found.</p>
          ) : (
            filtered.map((o) => (
              <button key={o.id} type="button" className={rowClass} disabled={busy} onClick={() => assign(o)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">{o.title || "Untitled order"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {ORDER_STATUS_META[o.status as OrderStatus]?.label ?? o.status}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {o.order_number && <span className="font-mono">{o.order_number}</span>}
                  {o.client_name && <span className="truncate">{o.client_name}</span>}
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Start from an order → choose a saved quote to attach. */
export function AddQuoteToOrderDialog({
  open,
  onOpenChange,
  orderId,
  linkedQuoteIds,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  linkedQuoteIds: string[]
  onDone?: () => void
}) {
  const { toast } = useToast()
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [q, setQ] = useState("")
  const [busy, setBusy] = useDismissable(open)

  useEffect(() => {
    if (!open) return
    setQ("")
    let active = true
    createClient()
      .from("quotes")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (active && data) setQuotes(data as QuoteRow[])
      })
    return () => {
      active = false
    }
  }, [open])

  const linked = useMemo(() => new Set(linkedQuoteIds), [linkedQuoteIds])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return quotes
      .filter((qt) => !linked.has(qt.id))
      .filter((qt) =>
        !needle
          ? true
          : [qt.quote_number, qt.quote_name, (qt as any).client_name]
              .filter(Boolean)
              .some((s) => String(s).toLowerCase().includes(needle)),
      )
  }, [quotes, linked, q])

  async function attach(quote: QuoteRow) {
    if (busy) return
    setBusy(true)
    try {
      await linkQuote(orderId, quote as unknown as Record<string, any>)
      toast({ title: "Quote added to order" })
      onOpenChange(false)
      onDone?.()
    } catch (e: unknown) {
      toast({
        title: "Could not add quote",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a quote to this order</DialogTitle>
          <DialogDescription>Attach a saved quote (draft or final). Already-linked quotes are hidden.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search quotes…"
            className="bg-card pl-8"
          />
        </div>
        <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No quotes to add.</p>
          ) : (
            filtered.map((qt) => (
              <button key={qt.id} type="button" className={rowClass} disabled={busy} onClick={() => attach(qt)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">{qt.quote_name || "Unnamed quote"}</span>
                  {qt.is_draft && (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      draft
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {qt.quote_number && <span className="font-mono">{qt.quote_number}</span>}
                  <span>{new Date(qt.created_at).toLocaleDateString()}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
