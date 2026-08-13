// Load several tables in ONE round-trip.
//
// Under the shared-SQLite backend every `.from(t).select()` is a separate HTTP
// POST to /api/db, so a page that reads 6 tables pays 6× the network latency —
// slow on another machine. loadTables() sends all reads as a single batch to
// /api/db in server mode, and falls back to parallel client queries for the
// localStorage/Supabase backends (where there's no batch endpoint and the
// latency either doesn't exist or is per-connection anyway).

import { isServerBackend } from "@/lib/data-backend"
import { createClient } from "@/lib/supabase/client"
import type { Result } from "@/lib/local-db"

export type LoadSpec = {
  table: string
  filters?: { col: string; op: "eq" | "in"; val: any }[]
  orders?: { col: string; asc: boolean }[]
  limit?: number | null
  single?: "single" | "maybe" | null
}

async function loadViaBatch(specs: LoadSpec[]): Promise<Result<any>[]> {
  const ops = specs.map((s) => ({
    table: s.table,
    op: "select" as const,
    filters: s.filters ?? [],
    orders: s.orders ?? [],
    limit: s.limit ?? null,
    single: s.single ?? null,
    payload: null,
  }))
  const res = await fetch("/api/db", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batch: ops }),
  })
  if (!res.ok) throw new Error(`Batch load failed: ${res.status}`)
  const json = (await res.json()) as { results?: Result<any>[] }
  return json.results ?? specs.map(() => ({ data: null, error: { message: "Malformed batch response" } }))
}

function loadViaClient(specs: LoadSpec[]): Promise<Result<any>[]> {
  const c = createClient()
  return Promise.all(
    specs.map((s) => {
      let q: any = c.from(s.table).select("*")
      for (const f of s.filters ?? []) q = f.op === "in" ? q.in(f.col, f.val) : q.eq(f.col, f.val)
      for (const o of s.orders ?? []) q = q.order(o.col, { ascending: o.asc })
      if (s.limit != null) q = q.limit(s.limit)
      if (s.single === "single") q = q.single()
      else if (s.single === "maybe") q = q.maybeSingle()
      return q as Promise<Result<any>>
    }),
  )
}

/**
 * Read several tables at once. Returns results in the same order as `specs`,
 * each shaped like a normal query result (`{ data, error }`).
 */
export function loadTables(specs: LoadSpec[]): Promise<Result<any>[]> {
  if (specs.length === 0) return Promise.resolve([])
  return isServerBackend ? loadViaBatch(specs) : loadViaClient(specs)
}
