// Pure, side-effect-free calculations for the Orders domain.
//
// Everything here is deterministic and DOM-free so it can be unit-tested
// directly (see compute.test.ts). Components and services import these instead
// of duplicating the maths.

import type {
  Order,
  OrderTask,
  Payment,
  OrderProgress,
  OrderFinancials,
  PaymentStatus,
} from "@/types/orders"
import { taskCountsForProgress, isTaskDone, priorityRank } from "@/lib/orders/status"
import { quoteVatApplies } from "@/lib/quote-modes"

/** Cents-precision rounding so float noise never flips a payment status. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export function computeProgress(tasks: readonly OrderTask[]): OrderProgress {
  const counted = tasks.filter((t) => taskCountsForProgress(t.status))
  const total = counted.length
  const completed = counted.filter((t) => isTaskDone(t.status)).length
  return {
    total,
    completed,
    fraction: total === 0 ? 0 : completed / total,
    hasTasks: total > 0,
  }
}

// ---------------------------------------------------------------------------
// Estimated production time
// ---------------------------------------------------------------------------

/** Sum of estimated minutes across non-cancelled tasks (a workload estimate). */
export function aggregateEstimatedMinutes(tasks: readonly OrderTask[]): number {
  return tasks
    .filter((t) => t.status !== "cancelled")
    .reduce((sum, t) => sum + (Number(t.estimated_minutes) || 0), 0)
}

/** "7h 40m" / "48m" / "—" for a minute count. */
export function formatDuration(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(Number(minutes) || 0))
  if (m === 0) return "—"
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h === 0) return `${rem}m`
  if (rem === 0) return `${h}h`
  return `${h}h ${String(rem).padStart(2, "0")}m`
}

/** Parse an "Hh Mm" / "1.5h" / "90" style input into minutes; null if empty. */
export function parseDurationToMinutes(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  // Pure number => minutes.
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s))
  let total = 0
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/)
  const m = s.match(/(\d+(?:\.\d+)?)\s*m/)
  if (h) total += parseFloat(h[1]) * 60
  if (m) total += parseFloat(m[1])
  return total > 0 ? Math.round(total) : null
}

// ---------------------------------------------------------------------------
// Financials & payment status
// ---------------------------------------------------------------------------

/** Net amount paid = payments minus refunds. */
export function computeAmountPaid(payments: readonly Payment[]): number {
  const net = payments.reduce((sum, p) => sum + (p.is_refund ? -1 : 1) * (Number(p.amount) || 0), 0)
  return round2(net)
}

export function derivePaymentStatus(args: {
  total: number
  paid: number
  hasInvoice: boolean
  invoiceVoided?: boolean
  fullyRefunded?: boolean
}): PaymentStatus {
  const total = round2(args.total || 0)
  const paid = round2(args.paid || 0)
  if (args.invoiceVoided) return "void"
  if (args.fullyRefunded) return "refunded"
  if (!args.hasInvoice && paid <= 0) return "not_invoiced"
  if (paid <= 0) return "unpaid"
  if (total > 0 && paid + 0.005 >= total) return "paid"
  return "partially_paid"
}

export function computeFinancials(
  order: Pick<Order, "total">,
  payments: readonly Payment[],
  opts?: { hasInvoice?: boolean; invoiceVoided?: boolean },
): OrderFinancials {
  const total = round2(Number(order.total) || 0)
  const paid = computeAmountPaid(payments)
  const outstanding = round2(Math.max(0, total - paid))
  const status = derivePaymentStatus({
    total,
    paid,
    hasInvoice: Boolean(opts?.hasInvoice),
    invoiceVoided: opts?.invoiceVoided,
  })
  return { total, paid, outstanding, status }
}

// ---------------------------------------------------------------------------
// Invoice totals
// ---------------------------------------------------------------------------

export function computeInvoiceTotals(
  items: readonly { quantity: number; unit_price: number }[],
  vatRate: number,
): { subtotal: number; vatAmount: number; total: number } {
  const subtotal = round2(items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0))
  const vatAmount = round2(subtotal * (Number(vatRate) || 0))
  const total = round2(subtotal + vatAmount)
  return { subtotal, vatAmount, total }
}

// ---------------------------------------------------------------------------
// Invoice line items derived from production tasks
// ---------------------------------------------------------------------------

export type TaskVatState = "empty" | "all" | "none" | "mixed"

/** Tasks that count toward billing — cancelled tasks are excluded everywhere. */
export function activeTasks(tasks: readonly OrderTask[]): OrderTask[] {
  return tasks.filter((t) => t.status !== "cancelled")
}

const taskChargedVat = (t: OrderTask): boolean => t.calc_payload?.vat_enabled === true

/** all = every active task charged VAT; none = zero did; mixed = some; empty = no active tasks. */
export function taskVatState(tasks: readonly OrderTask[]): TaskVatState {
  const active = activeTasks(tasks)
  if (active.length === 0) return "empty"
  const withVat = active.filter(taskChargedVat).length
  if (withVat === active.length) return "all"
  if (withVat === 0) return "none"
  return "mixed"
}

/** The uniform VAT rate across VAT-charging active tasks, or null if they differ / none charge. */
export function taskVatRate(tasks: readonly OrderTask[]): number | null {
  const rates = activeTasks(tasks)
    .filter(taskChargedVat)
    .map((t) => Number(t.calc_payload?.vat_rate) || 0)
  if (rates.length === 0) return null
  return rates.every((r) => r === rates[0]) ? rates[0] : null
}

/** A task's price with any VAT it charged backed out (ex-VAT). */
export function taskExVatAmount(task: OrderTask): number {
  const price = Number(task.price) || 0
  if (!taskChargedVat(task)) return price
  const rate = Number(task.calc_payload?.vat_rate) || 0
  return rate > 0 ? price / (1 + rate) : price
}

/** One ex-VAT invoice line per active task. Line amounts are rounded to cents; unit_price is kept exact. */
export function invoiceLinesFromTasks(
  tasks: readonly OrderTask[],
): Array<{ description: string; quantity: number; unit_price: number; amount: number }> {
  return activeTasks(tasks).map((t) => {
    const amount = round2(taskExVatAmount(t))
    const qty = Number(t.quantity) || 0
    // unrounded on purpose: quantity * unit_price must reconstruct amount exactly so computeInvoiceTotals reconciles
    const unit_price = qty > 0 ? amount / qty : amount
    const desc = t.material_name ? `${t.name} — ${t.material_name}` : t.name
    return { description: desc, quantity: qty, unit_price, amount }
  })
}

export type InvoiceFormat = "simple" | "detailed"
export interface InvoiceLineInput { description: string; quantity: number; unit_price: number; amount: number }

/**
 * Compose invoice lines from a selection of tasks plus optional shipping.
 * Cancelled tasks are always excluded. Amounts are ex-VAT; a single invoice
 * VAT rate is applied later by computeInvoiceTotals.
 */
export function buildInvoiceLines(opts: {
  tasks: readonly OrderTask[]
  format: InvoiceFormat
  orderTitle: string
  shipping?: { include: boolean; cost: number; label?: string }
}): InvoiceLineInput[] {
  const active = activeTasks(opts.tasks)
  const lines: InvoiceLineInput[] = []
  if (active.length > 0) {
    if (opts.format === "detailed") {
      lines.push(...invoiceLinesFromTasks(active))
    } else {
      const amount = round2(active.reduce((s, t) => s + taskExVatAmount(t), 0))
      lines.push({ description: opts.orderTitle || "Production", quantity: 1, unit_price: amount, amount })
    }
  }
  if (opts.shipping?.include) {
    const cost = round2(Number(opts.shipping.cost) || 0)
    if (cost > 0) lines.push({ description: opts.shipping.label || "Shipping", quantity: 1, unit_price: cost, amount: cost })
  }
  return lines
}

// ---------------------------------------------------------------------------
// Quote → headline total (reproduces components/quotation-document.tsx logic)
// ---------------------------------------------------------------------------

export type QuoteTotals = { total: number; subtotal: number; vat: number; vatRate: number }

/**
 * The single headline total a customer pays for a quote, plus its ex-VAT
 * subtotal and VAT amount. Uses the stored `final_price` when present
 * (authoritative, VAT-inclusive for business quotes) and otherwise recomputes
 * from `landed_cost * 1/(1-margin) + emergency_fee`, applying VAT when the quote
 * is a business quote with VAT enabled.
 */
export function quoteHeadlineTotals(quote: Record<string, any>): QuoteTotals {
  const marginPercentage = parseFloat(quote?.selected_margin || "0") / 100
  const marginMultiplier = marginPercentage > 0 ? 1 / (1 - marginPercentage) : 1
  const landed = Number(quote?.landed_cost) || 0
  const emergency = quote?.is_emergency ? Number(quote?.emergency_fee) || 0 : 0
  const vatApplies = quoteVatApplies(quote)
  const vatRate = quote?.vat_rate ?? 0.23

  const priceExVat = landed * marginMultiplier + emergency
  const recomputedVat = vatApplies ? priceExVat * vatRate : 0
  const recomputedFinal = priceExVat + recomputedVat

  const total = quote?.final_price != null ? Number(quote.final_price) : recomputedFinal
  // When final_price is stored it is VAT-inclusive (business). Back out the parts.
  const subtotal = vatApplies ? round2(total / (1 + vatRate)) : round2(total)
  const vat = round2(total - subtotal)
  return { total: round2(total), subtotal, vat, vatRate }
}

// ---------------------------------------------------------------------------
// Due-date intelligence
// ---------------------------------------------------------------------------

export type DueState = "none" | "overdue" | "today" | "tomorrow" | "soon" | "normal"

const DAY_MS = 24 * 60 * 60 * 1000
const SOON_DAYS = 3

/** Midnight-aligned day difference (target - now), so "today" is stable. */
function dayDelta(due: Date, now: Date): number {
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate())
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((a - b) / DAY_MS)
}

export function dueState(dueDate: string | null | undefined, now: Date = new Date()): DueState {
  if (!dueDate) return "none"
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return "none"
  const delta = dayDelta(due, now)
  if (delta < 0) return "overdue"
  if (delta === 0) return "today"
  if (delta === 1) return "tomorrow"
  if (delta <= SOON_DAYS) return "soon"
  return "normal"
}

export function dueStateLabel(state: DueState): string {
  switch (state) {
    case "overdue":
      return "Overdue"
    case "today":
      return "Due today"
    case "tomorrow":
      return "Due tomorrow"
    case "soon":
      return "Due soon"
    case "normal":
      return "On track"
    default:
      return "No due date"
  }
}

// ---------------------------------------------------------------------------
// Queue ordering
// ---------------------------------------------------------------------------

/**
 * Deterministic order for cards inside a status column: manual queue_position
 * first, then higher priority, then older orders. Never sorts purely by
 * creation date (spec 19).
 */
export function sortForQueue<T extends Pick<Order, "queue_position" | "priority" | "created_at">>(
  orders: readonly T[],
): T[] {
  return [...orders].sort((a, b) => {
    const qa = Number.isFinite(a.queue_position) ? a.queue_position : Number.MAX_SAFE_INTEGER
    const qb = Number.isFinite(b.queue_position) ? b.queue_position : Number.MAX_SAFE_INTEGER
    if (qa !== qb) return qa - qb
    const pr = priorityRank(b.priority) - priorityRank(a.priority)
    if (pr !== 0) return pr
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  })
}

/** Next queue position for a status column = max existing + 1 (0 when empty). */
export function nextQueuePosition(existing: readonly Pick<Order, "queue_position">[]): number {
  if (existing.length === 0) return 0
  return Math.max(...existing.map((o) => (Number.isFinite(o.queue_position) ? o.queue_position : 0))) + 1
}
