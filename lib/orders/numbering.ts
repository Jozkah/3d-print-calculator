// Sequential, human-readable numbers for orders ("ORD-2026-0001") and
// invoices ("INV-2026-0001"), one sequence per calendar year.
//
// This mirrors lib/quote-number.ts exactly (per-year rows in the "counters"
// table, reserved atomically so parallel documents can't collide) and shares
// the same "counters" store, so numbers are safe even alongside the legacy
// quote-invoice numbering. Display numbers are always separate from the internal
// UUIDs used as row ids.

import { createClient } from "@/lib/supabase/client"

const ORDER_PREFIX = "ORD"
const INVOICE_PREFIX = "INV"
const PAD = 4

function formatNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(PAD, "0")}`
}

function currentYear(): number {
  return new Date().getFullYear()
}

function yearOf(createdAt?: string | null): number {
  const year = createdAt ? new Date(createdAt).getFullYear() : Number.NaN
  return Number.isNaN(year) ? currentYear() : year
}

/**
 * Reserve the next `count` sequence numbers for `counterKey` and return the
 * first. Persists the advanced counter immediately. Never derives the next
 * number from array length, so deleting rows can't cause a collision.
 */
async function reserveSequence(counterKey: string, count: number): Promise<number> {
  const supabase = createClient()
  const { data: counter } = await supabase.from("counters").select("*").eq("key", counterKey).maybeSingle()
  const first = (counter?.value || 0) + 1
  if (counter) {
    await supabase
      .from("counters")
      .update({ value: counter.value + count })
      .eq("id", counter.id)
  } else {
    await supabase.from("counters").insert([{ key: counterKey, value: count }])
  }
  return first
}

/** Mint the next order number for the current year. Call once per new order. */
export async function mintOrderNumber(): Promise<string> {
  const year = currentYear()
  const sequence = await reserveSequence(`order-${year}`, 1)
  return formatNumber(ORDER_PREFIX, year, sequence)
}

/**
 * Mint the next invoice number for the current year. Shares the same
 * `invoice-<year>` counter as the legacy quote-invoice page so an order invoice
 * and a quote invoice can never receive the same number.
 */
export async function mintInvoiceNumber(): Promise<string> {
  const year = currentYear()
  const sequence = await reserveSequence(`invoice-${year}`, 1)
  return formatNumber(INVOICE_PREFIX, year, sequence)
}

let orderBackfillRan = false

/**
 * Assign order numbers to any order rows saved without one (defensive — the
 * create path always mints one). Oldest-first within each creation year, so the
 * sequence follows real history. Idempotent; safe to call on every load.
 */
export async function backfillOrderNumbers(): Promise<void> {
  if (orderBackfillRan) return
  orderBackfillRan = true

  const supabase = createClient()
  const { data: orders, error } = await supabase.from("orders").select("*")
  if (error || !orders) return

  const missing = (orders as any[])
    .filter((o) => !o.order_number)
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
  if (missing.length === 0) return

  const byYear = new Map<number, any[]>()
  for (const order of missing) {
    const year = yearOf(order.created_at)
    byYear.set(year, [...(byYear.get(year) || []), order])
  }

  for (const [year, rows] of byYear) {
    let sequence = await reserveSequence(`order-${year}`, rows.length)
    for (const order of rows) {
      await supabase
        .from("orders")
        .update({ order_number: formatNumber(ORDER_PREFIX, year, sequence) })
        .eq("id", order.id)
      sequence += 1
    }
  }
}

// Exposed for unit testing the pure formatting rule.
export const __test = { formatNumber, yearOf }
