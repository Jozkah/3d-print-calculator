"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Trash2, FileText, Ban, ExternalLink, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { DecimalInput } from "@/components/ui/decimal-input"
import { useToast } from "@/hooks/use-toast"
import { formatMoney } from "@/lib/format"
import type { Order, Invoice, Payment, OrderQuoteLink } from "@/types/orders"
import type { PaymentMethod } from "@/types/orders"
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, paymentMethodLabel } from "@/lib/orders/status"
import { PaymentBadge } from "@/components/orders/order-badges"
import { computeFinancials, computeInvoiceTotals, round2 } from "@/lib/orders/compute"
import {
  addPayment,
  deletePayment,
  createInvoice,
  voidInvoice,
  deleteInvoice,
  updateOrder,
} from "@/lib/orders/data"

export function OrderFinancialsPanel({
  order,
  invoices,
  payments,
  quoteLinks,
  defaultVatRate,
  taskCount = 0,
  onChanged,
}: {
  order: Order
  invoices: Invoice[]
  payments: Payment[]
  quoteLinks: OrderQuoteLink[]
  defaultVatRate: number
  taskCount?: number
  onChanged: () => void
}) {
  const currency = order.currency_symbol || "€"
  const money = (n: number) => formatMoney(n, currency)
  const hasInvoice = invoices.length > 0
  const invoiceVoided = hasInvoice && invoices.every((i) => i.voided_at)
  const fin = computeFinancials(order, payments, { hasInvoice, invoiceVoided })
  const taskDriven = order.pricing_source === "tasks"

  const [payOpen, setPayOpen] = useState(false)
  const [invOpen, setInvOpen] = useState(false)
  const [priceOpen, setPriceOpen] = useState(false)

  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Financials</h3>
        <div className="flex items-center gap-1.5">
          {!taskDriven && (
            <Button size="sm" variant="ghost" onClick={() => setPriceOpen(true)} title="Edit pricing">
              <Pencil className="size-4" />
            </Button>
          )}
          <PaymentBadge status={fin.status} />
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2 p-4 pb-1">
        <Stat label="Total" value={money(fin.total)} />
        <Stat label="Paid" value={money(fin.paid)} tone="ok" />
        <Stat label="Outstanding" value={money(fin.outstanding)} tone={fin.outstanding > 0 ? "warn" : undefined} />
      </div>
      {taskDriven && (
        <p className="px-4 pb-3 text-xs text-muted-foreground">
          Total is the sum of {taskCount} production task{taskCount === 1 ? "" : "s"}. Edit a task&rsquo;s price to change it.
        </p>
      )}

      {/* Payments */}
      <div className="border-t border-border/60 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payments</h4>
          <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
            <Plus className="size-3.5" /> Record
          </Button>
        </div>
        {payments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No payments recorded.</p>
        ) : (
          <ul className="space-y-1">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">
                  {p.is_refund ? "−" : ""}
                  {money(p.amount)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {paymentMethodLabel(p.method)} · {new Date(p.paid_at).toLocaleDateString()}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </span>
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={async () => {
                    await deletePayment(p)
                    onChanged()
                  }}
                >
                  <Trash2 className="size-3.5 text-red-500" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Invoices */}
      <div className="border-t border-border/60 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoices</h4>
          <Button size="sm" variant="outline" onClick={() => setInvOpen(true)}>
            <Plus className="size-3.5" /> Create
          </Button>
        </div>
        {invoices.length === 0 ? (
          <p className="text-xs text-muted-foreground">No invoice created yet.</p>
        ) : (
          <ul className="space-y-1">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/orders/${order.id}/invoice/${inv.id}`} className="flex items-center gap-1.5 hover:text-primary">
                  <FileText className="size-3.5" />
                  <span className="font-mono text-xs">{inv.invoice_number}</span>
                  <span className={inv.voided_at ? "text-muted-foreground line-through" : "text-foreground"}>
                    {money(inv.total)}
                  </span>
                  {inv.voided_at && <span className="text-xs text-muted-foreground">(void)</span>}
                  <ExternalLink className="size-3 text-muted-foreground" />
                </Link>
                <div className="flex items-center gap-0.5">
                  {!inv.voided_at && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Void"
                      onClick={async () => {
                        await voidInvoice(inv)
                        onChanged()
                      }}
                    >
                      <Ban className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Delete"
                    onClick={async () => {
                      await deleteInvoice(inv)
                      onChanged()
                    }}
                  >
                    <Trash2 className="size-3.5 text-red-500" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {order.external_reference && (
          <p className="mt-2 text-xs text-muted-foreground">External invoice: {order.external_reference}</p>
        )}
      </div>

      {/* Linked quotes */}
      {quoteLinks.length > 0 && (
        <div className="border-t border-border/60 px-4 py-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quotes</h4>
          <ul className="space-y-1">
            {quoteLinks.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/quote/${l.quote_id}`} className="flex items-center gap-1.5 hover:text-primary">
                  <span className="font-mono text-xs">{l.quote_number || "Quote"}</span>
                  <span className="truncate text-foreground">{l.quote_name}</span>
                  {l.is_primary && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">primary</span>
                  )}
                </Link>
                <span className="text-xs text-muted-foreground">{l.quoted_total != null ? money(l.quoted_total) : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <RecordPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        orderId={order.id}
        outstanding={fin.outstanding}
        onDone={onChanged}
      />
      <CreateInvoiceDialog
        open={invOpen}
        onOpenChange={setInvOpen}
        order={order}
        defaultVatRate={defaultVatRate}
        onDone={onChanged}
      />
      <EditPricingDialog open={priceOpen} onOpenChange={setPriceOpen} order={order} defaultVatRate={defaultVatRate} onDone={onChanged} />
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background px-2.5 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={
          tone === "ok"
            ? "text-sm font-semibold text-emerald-600 dark:text-emerald-400"
            : tone === "warn"
              ? "text-sm font-semibold text-amber-600 dark:text-amber-400"
              : "text-sm font-semibold text-foreground"
        }
      >
        {value}
      </div>
    </div>
  )
}

function RecordPaymentDialog({
  open,
  onOpenChange,
  orderId,
  outstanding,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  orderId: string
  outstanding: number
  onDone: () => void
}) {
  const [amount, setAmount] = useState<number>(0)
  const [method, setMethod] = useState<PaymentMethod>("cash")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState("")
  const [isRefund, setIsRefund] = useState(false)

  async function submit() {
    if (!amount) return
    await addPayment({
      orderId,
      amount,
      method,
      paidAt: new Date(date).toISOString(),
      reference: reference.trim() || null,
      isRefund,
    })
    onOpenChange(false)
    setAmount(0)
    setReference("")
    setIsRefund(false)
    onDone()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>Outstanding: {outstanding.toFixed(2)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <DecimalInput value={amount} onValueChange={setAmount} step="0.01" placeholder="0.00" className="bg-card" />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger className="bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-card" />
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} className="bg-card" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={isRefund} onChange={(e) => setIsRefund(e.target.checked)} />
            This is a refund
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!amount}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateInvoiceDialog({
  open,
  onOpenChange,
  order,
  defaultVatRate,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  order: Order
  defaultVatRate: number
  onDone: () => void
}) {
  const { toast } = useToast()
  const initialUnit = order.subtotal ?? (order.total != null ? round2(order.total / (1 + (order.vat_rate ?? defaultVatRate))) : 0)
  const [desc, setDesc] = useState(order.title)
  const [unit, setUnit] = useState<number>(initialUnit || 0)
  const [qty, setQty] = useState<number>(1)
  const [vatPct, setVatPct] = useState<number>(Math.round((order.vat_rate ?? defaultVatRate) * 100))
  const [external, setExternal] = useState("")

  const totals = computeInvoiceTotals([{ quantity: qty, unit_price: unit }], vatPct / 100)
  const currency = order.currency_symbol || "€"

  async function submit() {
    try {
      await createInvoice({
        orderId: order.id,
        items: [{ description: desc.trim() || order.title, quantity: qty, unit_price: unit }],
        vatRate: vatPct / 100,
        currencySymbol: currency,
        externalReference: external.trim() || null,
      })
      onOpenChange(false)
      onDone()
    } catch (e: unknown) {
      toast({ title: "Could not create invoice", description: e instanceof Error ? e.message : String(e), variant: "destructive" })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create invoice</DialogTitle>
          <DialogDescription>Pre-filled from the order total. This is a payment-tracking document, not a certified fiscal invoice.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} className="bg-card" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Qty</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} className="bg-card" />
            </div>
            <div className="space-y-1.5">
              <Label>Unit ({currency})</Label>
              <DecimalInput value={unit} onValueChange={setUnit} step="0.01" className="bg-card" />
            </div>
            <div className="space-y-1.5">
              <Label>VAT %</Label>
              <Input type="number" value={vatPct} onChange={(e) => setVatPct(parseFloat(e.target.value) || 0)} className="bg-card" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>External reference (optional)</Label>
            <Input value={external} onChange={(e) => setExternal(e.target.value)} placeholder="Accounting-software invoice no." className="bg-card" />
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatMoney(totals.subtotal, currency)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>VAT</span>
              <span>{formatMoney(totals.vatAmount, currency)}</span>
            </div>
            <div className="flex justify-between font-semibold text-foreground">
              <span>Total</span>
              <span>{formatMoney(totals.total, currency)}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Create invoice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditPricingDialog({
  open,
  onOpenChange,
  order,
  defaultVatRate,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  order: Order
  defaultVatRate: number
  onDone: () => void
}) {
  const [total, setTotal] = useState<number>(order.total ?? 0)
  const [vatPct, setVatPct] = useState<number>(Math.round((order.vat_rate ?? defaultVatRate) * 100))
  const currency = order.currency_symbol || "€"

  async function submit() {
    const rate = vatPct / 100
    const subtotal = round2(total / (1 + rate))
    await updateOrder(order.id, {
      total: round2(total),
      vat_rate: rate,
      vat_amount: round2(total - subtotal),
      subtotal,
      pricing_source: "manual",
    })
    onOpenChange(false)
    onDone()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit pricing</DialogTitle>
          <DialogDescription>The order stores this as a snapshot — it is never recalculated automatically.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Total ({currency}, incl. VAT)</Label>
            <DecimalInput value={total} onValueChange={setTotal} step="0.01" className="bg-card" />
          </div>
          <div className="space-y-1.5">
            <Label>VAT %</Label>
            <Input type="number" value={vatPct} onChange={(e) => setVatPct(parseFloat(e.target.value) || 0)} className="bg-card" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
