"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Download } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { CompanyLetterhead, issuerContactLine } from "@/components/quotation-document"
import { formatMoney } from "@/lib/format"
import { DEFAULT_DOCUMENT_TITLE, orderInvoiceDocumentTitle } from "@/lib/document-title"
import type { Invoice, Order, GlobalSettings } from "@/types/db"
import { computeFinancials } from "@/lib/orders/compute"
import type { Payment } from "@/types/orders"

export default function OrderInvoicePage() {
  const params = useParams()
  const invoiceId = Array.isArray(params.invoiceId) ? params.invoiceId[0] : (params.invoiceId as string)

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [settings, setSettings] = useState<GlobalSettings | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: inv } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle()
      const invoiceRow = (inv as Invoice) ?? null
      setInvoice(invoiceRow)
      if (invoiceRow) {
        const [{ data: ord }, { data: set }, { data: pay }] = await Promise.all([
          supabase.from("orders").select("*").eq("id", invoiceRow.order_id).maybeSingle(),
          supabase.from("global_settings").select("*").limit(1).maybeSingle(),
          supabase.from("payments").select("*").eq("order_id", invoiceRow.order_id),
        ])
        setOrder((ord as Order) ?? null)
        setSettings((set as GlobalSettings) ?? null)
        setPayments((pay as Payment[]) ?? [])
      }
      setLoading(false)
    }
    load()
  }, [invoiceId])

  useEffect(() => {
    if (!invoice) return
    document.title = orderInvoiceDocumentTitle(invoice, order?.title)
    return () => {
      document.title = DEFAULT_DOCUMENT_TITLE
    }
  }, [invoice, order])

  if (loading) return <div className="p-16 text-center text-slate-500">Loading…</div>
  if (!invoice) return <div className="p-16 text-center text-slate-500">Invoice not found.</div>

  const currency = invoice.currency_symbol || "€"
  const money = (n: number) => formatMoney(n, currency)
  const fin = computeFinancials({ total: invoice.total }, payments, { hasInvoice: true, invoiceVoided: !!invoice.voided_at })
  const client = invoice.client_snapshot
  const vatPct = Math.round((invoice.vat_rate || 0) * 10000) / 100

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <div className="print:hidden fixed top-4 right-4 z-50">
        <Button onClick={() => window.print()} className="bg-slate-900 hover:bg-slate-700 text-white">
          <Download className="mr-2 h-4 w-4" />
          Download PDF
        </Button>
      </div>

      <div className="mx-auto max-w-3xl px-8 py-16 print:px-0 print:py-10">
        <CompanyLetterhead settings={settings} />

        <div className="mb-10 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Invoice</h1>
            <p className="mt-1 font-mono text-sm text-slate-500">{invoice.invoice_number}</p>
            {invoice.voided_at && <p className="mt-1 text-sm font-semibold text-rose-600">VOID</p>}
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Issued: {new Date(invoice.issue_date).toLocaleDateString()}</p>
            {invoice.due_date && <p>Due: {new Date(invoice.due_date).toLocaleDateString()}</p>}
            {order?.order_number && <p>Order: {order.order_number}</p>}
            {invoice.external_reference && <p>Ref: {invoice.external_reference}</p>}
          </div>
        </div>

        {client && (
          <div className="mb-8">
            <p className="text-xs uppercase tracking-wide text-slate-400">Bill to</p>
            <p className="mt-1 font-semibold text-slate-900">{client.name}</p>
            {client.address && <p className="whitespace-pre-line text-sm text-slate-600">{client.address}</p>}
            {client.email && <p className="text-sm text-slate-600">{client.email}</p>}
            {client.phone && <p className="text-sm text-slate-600">{client.phone}</p>}
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.items.map((it) => (
              <tr key={it.id}>
                <td className="py-2.5 text-slate-800">{it.description}</td>
                <td className="py-2.5 text-right text-slate-600">{it.quantity}</td>
                <td className="py-2.5 text-right text-slate-600">{money(it.unit_price)}</td>
                <td className="py-2.5 text-right text-slate-800">{money(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>{money(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>VAT ({vatPct}%)</span>
            <span>{money(invoice.vat_amount)}</span>
          </div>
          <div
            className="pdf-keep mt-2 flex items-baseline justify-between rounded-md bg-slate-900 px-4 py-3 text-white"
            style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
          >
            <span className="text-sm">Total</span>
            <span className="text-lg font-bold">{money(invoice.total)}</span>
          </div>
          {fin.paid > 0 && (
            <>
              <div className="flex justify-between pt-1 text-slate-600">
                <span>Paid</span>
                <span>{money(fin.paid)}</span>
              </div>
              <div className="flex justify-between font-semibold text-slate-900">
                <span>Balance due</span>
                <span>{money(fin.outstanding)}</span>
              </div>
            </>
          )}
        </div>

        {invoice.notes && <p className="mt-8 whitespace-pre-line text-sm text-slate-600">{invoice.notes}</p>}

        {issuerContactLine(settings) && (
          <p className="mt-12 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
            {issuerContactLine(settings)}
          </p>
        )}
        <p className="mt-3 text-center text-[10px] text-slate-400">
          This is an internal invoice / payment-tracking document, not a certified fiscal invoice.
        </p>
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 14mm;
        }
        @media print {
          .pdf-keep,
          li,
          tr {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  )
}
