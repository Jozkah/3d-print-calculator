// Local, backend-free data store.
//
// This replaces Supabase with a browser-side data layer backed by
// localStorage. It exposes a tiny subset of the Supabase query-builder API
// (`.from(table).select().eq().order().single()` plus insert/update/delete),
// so the existing components keep working unchanged — they still call
// `createClient().from("printers")...`.
//
// All data lives in the visitor's browser (localStorage). Nothing leaves the
// machine and there is no server/database to configure. Clearing browser data
// wipes everything; use the export/backup features if you need persistence
// across machines.

type Row = Record<string, any>
type Result = { data: any; error: any }

const PREFIX = "3dpc:"
const CHANGE_EVENT = "local-db-change"

// ---------------------------------------------------------------------------
// Seed data — written the first time a table is read so the app works out of
// the box (the calculators expect a single global_settings row to exist).
// ---------------------------------------------------------------------------
const SEED: Record<string, () => Row[]> = {
  global_settings: () => [
    {
      id: uuid(),
      electricity_cost_per_kwh: 0.2,
      fuel_cost_per_liter: 2.0,
      car_fuel_consumption_per_100km: 7.5,
      labor_hourly_rate: 7.5,
      material_efficiency_factor: 1.1,
      cost_buffer_factor: 1.3,
      emergency_fee_fixed: 10.0,
      double_heating_cost: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
}

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  // Fallback for older environments.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage
}

function load(table: string): Row[] {
  if (!hasStorage()) return []
  const key = PREFIX + table
  const raw = window.localStorage.getItem(key)
  if (raw !== null) {
    try {
      return JSON.parse(raw) as Row[]
    } catch {
      return []
    }
  }
  const seeded = SEED[table] ? SEED[table]() : []
  window.localStorage.setItem(key, JSON.stringify(seeded))
  return seeded
}

function save(table: string, rows: Row[]): void {
  if (!hasStorage()) return
  window.localStorage.setItem(PREFIX + table, JSON.stringify(rows))
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { table } }))
}

/**
 * Subscribe to local-db writes. Returns an unsubscribe function.
 * Pages use this to reload their data after a mutation happens anywhere.
 *
 * Fires for writes in this window (via CHANGE_EVENT) and in other tabs (via
 * the native `storage` event, which browsers only deliver cross-tab) — so an
 * edit made in one tab refreshes views in another instead of being silently
 * overwritten by the next whole-table write. The callback receives the table
 * name when known so subscribers can refetch selectively.
 */
export function onLocalDbChange(cb: (table?: string) => void): () => void {
  if (typeof window === "undefined") return () => {}
  const onLocal = (e: Event) => cb((e as CustomEvent)?.detail?.table)
  const onStorage = (e: StorageEvent) => {
    // key === null means the whole store was cleared.
    if (e.key === null) return cb(undefined)
    if (e.key.startsWith(PREFIX)) cb(e.key.slice(PREFIX.length))
  }
  window.addEventListener(CHANGE_EVENT, onLocal)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onLocal)
    window.removeEventListener("storage", onStorage)
  }
}

type Filter = { col: string; op: "eq" | "in"; val: any }
type Order = { col: string; asc: boolean }

class QueryBuilder implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select"
  private payload: any = null
  private filters: Filter[] = []
  private orders: Order[] = []
  private limitN: number | null = null
  private singleMode: "single" | "maybe" | null = null

  constructor(private table: string) {}

  select(_cols?: string): this {
    // Column projection is ignored — we always return full rows, which is a
    // harmless superset of what any caller reads.
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

  single(): this {
    this.singleMode = "single"
    return this
  }

  maybeSingle(): this {
    this.singleMode = "maybe"
    return this
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected)
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      if (f.op === "eq") return row[f.col] === f.val
      if (f.op === "in") return Array.isArray(f.val) && f.val.includes(row[f.col])
      return true
    })
  }

  private applyOrder(rows: Row[]): Row[] {
    if (this.orders.length === 0) return rows
    const sorted = [...rows]
    sorted.sort((a, b) => {
      for (const o of this.orders) {
        const av = a[o.col]
        const bv = b[o.col]
        let cmp = 0
        if (typeof av === "number" && typeof bv === "number") cmp = av - bv
        else cmp = String(av ?? "").localeCompare(String(bv ?? ""))
        if (cmp !== 0) return o.asc ? cmp : -cmp
      }
      return 0
    })
    return sorted
  }

  private wrapSingle(rows: Row[]): Result {
    if (this.singleMode === "single") {
      if (rows.length === 0) {
        return { data: null, error: { code: "PGRST116", message: "No rows found" } }
      }
      return { data: rows[0], error: null }
    }
    if (this.singleMode === "maybe") {
      return { data: rows.length > 0 ? rows[0] : null, error: null }
    }
    return { data: rows, error: null }
  }

  private exec(): Result {
    try {
      if (this.op === "select") {
        let rows = load(this.table).filter((r) => this.matches(r))
        rows = this.applyOrder(rows)
        if (this.limitN !== null) rows = rows.slice(0, this.limitN)
        return this.wrapSingle(rows)
      }

      if (this.op === "insert") {
        const all = load(this.table)
        const now = new Date().toISOString()
        const inserted: Row[] = (this.payload as Row[]).map((r) => ({
          id: r.id ?? uuid(),
          created_at: r.created_at ?? now,
          ...r,
        }))
        save(this.table, [...all, ...inserted])
        return this.wrapSingle(inserted)
      }

      if (this.op === "update") {
        const all = load(this.table)
        const updated: Row[] = []
        const next = all.map((r) => {
          if (this.matches(r)) {
            const merged = { ...r, ...this.payload }
            updated.push(merged)
            return merged
          }
          return r
        })
        save(this.table, next)
        return this.wrapSingle(updated)
      }

      if (this.op === "delete") {
        const all = load(this.table)
        const removed: Row[] = []
        const next = all.filter((r) => {
          if (this.matches(r)) {
            removed.push(r)
            return false
          }
          return true
        })
        save(this.table, next)
        return this.wrapSingle(removed)
      }

      return { data: null, error: { message: "Unsupported operation" } }
    } catch (e: any) {
      return { data: null, error: { message: e?.message ?? String(e) } }
    }
  }
}

// Stand-in for Supabase Realtime channels. The app subscribes to table changes
// to live-refresh open views; we wire those subscriptions to our local write
// event so edits made in one screen still refresh another that's open.
class LocalChannel {
  private callbacks: Array<{ table: string | null; cb: () => void }> = []
  private unsubscribe: (() => void) | null = null

  on(_event: string, filter: any, cb: () => void): this {
    // Supabase-style filter: { event, schema, table }. Honor the table so a
    // write to one table doesn't refetch every subscriber of every table.
    this.callbacks.push({ table: typeof filter?.table === "string" ? filter.table : null, cb })
    return this
  }

  subscribe(): this {
    this.unsubscribe = onLocalDbChange((changedTable) => {
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

// Return type is `any` on purpose: the old code was written against Supabase's
// generated row types. Typing the result as `any` lets those call sites keep
// compiling unchanged (query results flow through as `any`, exactly as an
// untyped Supabase client would behave).
export function createClient(): any {
  return {
    from(table: string) {
      return new QueryBuilder(table)
    },
    channel(_name: string) {
      return new LocalChannel()
    },
    removeChannel(channel: any) {
      if (channel && typeof channel.teardown === "function") channel.teardown()
    },
  }
}
