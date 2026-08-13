// Browser client for the shared SQLite backend. Implements the same tiny
// query-builder surface as lib/local-db.ts (.from().select().eq().order()
// .single(), insert/update/delete, channel/removeChannel), but every query is
// serialized and POSTed to /api/db instead of read from localStorage — so all
// visitors share one database on the host. Selected when
// NEXT_PUBLIC_DATA_BACKEND=server; no call site changes.

import type { Tables } from "@/types/db"
import type { LocalDbClient, Result } from "@/lib/local-db"
import type { QueryOp, DbResult } from "@/lib/server-db/query-types"
import { onDbChange } from "@/lib/db-realtime"

type Row = Record<string, any>
type TableRow<T extends string> = T extends keyof Tables ? Tables[T] : Row

const ENDPOINT = "/api/db"

async function post(op: QueryOp): Promise<DbResult> {
  if (typeof window === "undefined") {
    return { data: null, error: { message: "remote-db is browser-only; data access must run client-side" } }
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(op),
    })
    if (!res.ok) {
      return { data: null, error: { message: `Server returned ${res.status}` } }
    }
    return (await res.json()) as DbResult
  } catch (e: any) {
    return { data: null, error: { message: e?.message ?? "Network error contacting /api/db" } }
  }
}

class RemoteQueryBuilder<T, R = T[]> implements PromiseLike<Result<R>> {
  private op: QueryOp["op"] = "select"
  private payload: any = null
  private filters: QueryOp["filters"] = []
  private orders: QueryOp["orders"] = []
  private limitN: number | null = null
  private singleMode: QueryOp["single"] = null

  constructor(private table: string) {}

  select(_cols?: string): this {
    return this
  }
  insert(rows: Row | Row[]): this {
    this.op = "insert"
    this.payload = Array.isArray(rows) ? rows : [rows]
    return this
  }
  update(values: Row): this {
    this.op = "update"
    this.payload = values
    return this
  }
  delete(): this {
    this.op = "delete"
    return this
  }
  eq(col: string, val: any): this {
    this.filters.push({ col, op: "eq", val })
    return this
  }
  in(col: string, val: any[]): this {
    this.filters.push({ col, op: "in", val })
    return this
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col, asc: opts?.ascending !== false })
    return this
  }
  limit(n: number): this {
    this.limitN = n
    return this
  }
  single(): RemoteQueryBuilder<T, T> {
    this.singleMode = "single"
    return this as unknown as RemoteQueryBuilder<T, T>
  }
  maybeSingle(): RemoteQueryBuilder<T, T | null> {
    this.singleMode = "maybe"
    return this as unknown as RemoteQueryBuilder<T, T | null>
  }

  then<TResult1 = Result<R>, TResult2 = never>(
    onfulfilled?: ((value: Result<R>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const op: QueryOp = {
      table: this.table,
      op: this.op,
      filters: this.filters,
      orders: this.orders,
      limit: this.limitN,
      single: this.singleMode,
      payload: this.payload,
    }
    return post(op).then((r) => r as Result<R>).then(onfulfilled, onrejected)
  }
}

// Supabase-style realtime channel, backed by the change poller. Mirrors
// LocalChannel so components using .channel().on().subscribe() work unchanged.
class RemoteChannel {
  private callbacks: Array<{ table: string | null; cb: () => void }> = []
  private unsubscribe: (() => void) | null = null

  on(_event: string, filter: any, cb: () => void): this {
    this.callbacks.push({ table: typeof filter?.table === "string" ? filter.table : null, cb })
    return this
  }
  subscribe(): this {
    this.unsubscribe = onDbChange((changedTable) => {
      this.callbacks.forEach(({ table, cb }) => {
        if (!changedTable || !table || table === changedTable) cb()
      })
    })
    return this
  }
  teardown(): void {
    if (this.unsubscribe) this.unsubscribe()
    this.unsubscribe = null
  }
}

export function createRemoteClient(): LocalDbClient {
  return {
    from<T extends string>(table: T) {
      return new RemoteQueryBuilder<TableRow<T>>(table) as any
    },
    channel(_name: string) {
      return new RemoteChannel() as any
    },
    removeChannel(channel: any) {
      if (channel && typeof channel.teardown === "function") channel.teardown()
    },
  }
}

/** One-shot whole-table replace used by the data import in server mode. */
export async function serverReplaceAll(table: string, rows: Row[]): Promise<DbResult> {
  return post({ table, op: "replaceAll", filters: [], orders: [], limit: null, single: null, payload: rows })
}
