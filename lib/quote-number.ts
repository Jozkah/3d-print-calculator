// Sequential quote references ("Q-2026-001"), one sequence per year.
//
// Mirrors the invoice numbers (INV-YYYY-NNN) the invoice page mints from the
// "counters" table: every new quote gets the next number for the current year
// at save time, and backfillQuoteNumbers() assigns references to quotes saved
// before this system existed (oldest first, sequenced by their creation year).

import { createClient } from "@/lib/supabase/client"

function formatQuoteNumber(year: number, sequence: number): string {
  return `Q-${year}-${String(sequence).padStart(3, "0")}`
}

/** Creation year of a quote row, falling back to the current year when the timestamp is missing/invalid. */
function quoteYear(createdAt?: string | null): number {
  const year = createdAt ? new Date(createdAt).getFullYear() : Number.NaN
  return Number.isNaN(year) ? new Date().getFullYear() : year
}

/**
 * Reserve the next `count` sequence numbers for a year and return the first.
 * Persists the advanced counter so parallel documents can't reuse a number.
 */
async function reserveSequence(year: number, count: number): Promise<number> {
  const supabase = createClient()
  const key = `quote-${year}`
  const { data: counter } = await supabase.from("counters").select("*").eq("key", key).maybeSingle()
  const first = (counter?.value || 0) + 1
  if (counter) {
    await supabase.from("counters").update({ value: counter.value + count }).eq("id", counter.id)
  } else {
    await supabase.from("counters").insert([{ key, value: count }])
  }
  return first
}

/** Mint the next quote reference for the current year (call once per new quote). */
export async function mintQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const sequence = await reserveSequence(year, 1)
  return formatQuoteNumber(year, sequence)
}

// Session guard: the backfill is idempotent (it only touches rows without a
// quote_number) but there is no reason to re-scan on every page visit.
let backfillRan = false

/**
 * Assign references to quotes saved before the reference system existed.
 * Ordered oldest-first inside each creation year so the numbering follows
 * the real quote history. Safe to call on every load — it no-ops once all
 * quotes carry a number.
 */
export async function backfillQuoteNumbers(): Promise<void> {
  if (backfillRan) return
  backfillRan = true

  const supabase = createClient()
  const { data: quotes, error } = await supabase.from("quotes").select("*")
  if (error || !quotes) return

  const missing = quotes
    .filter((q: any) => !q.quote_number)
    .sort((a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
  if (missing.length === 0) return

  const byYear = new Map<number, any[]>()
  for (const quote of missing) {
    const year = quoteYear(quote.created_at)
    byYear.set(year, [...(byYear.get(year) || []), quote])
  }

  for (const [year, rows] of byYear) {
    let sequence = await reserveSequence(year, rows.length)
    for (const quote of rows) {
      await supabase
        .from("quotes")
        .update({ quote_number: formatQuoteNumber(year, sequence) })
        .eq("id", quote.id)
      sequence += 1
    }
  }
}
