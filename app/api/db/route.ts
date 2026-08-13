// Data endpoint for the shared SQLite backend. The browser client
// (lib/remote-db.ts) POSTs a serialized query here; we run it and return
// { data, error }. Only active when NEXT_PUBLIC_DATA_BACKEND=server.

import { NextResponse } from "next/server"
import { runQuery } from "@/lib/server-db/store"
import type { QueryOp } from "@/lib/server-db/query-types"

// node:sqlite needs the Node runtime, not the Edge runtime.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ data: null, error: { message: "Invalid JSON body" } }, { status: 400 })
  }

  const q = body as Partial<QueryOp>
  if (!q || typeof q.table !== "string" || typeof q.op !== "string") {
    return NextResponse.json(
      { data: null, error: { message: "Body must include table and op" } },
      { status: 400 },
    )
  }

  const result = runQuery({
    table: q.table,
    op: q.op,
    filters: Array.isArray(q.filters) ? q.filters : [],
    orders: Array.isArray(q.orders) ? q.orders : [],
    limit: typeof q.limit === "number" ? q.limit : null,
    single: q.single === "single" || q.single === "maybe" ? q.single : null,
    payload: q.payload ?? null,
  })

  return NextResponse.json(result)
}
