// Shared server-side data store, backed by SQLite (node:sqlite — built into
// Node 24, no native module to compile). One row per record stored as JSON in a
// `(id TEXT PRIMARY KEY, doc TEXT)` table per entity, which mirrors the untyped
// row shape the app used under localStorage exactly, so query results are
// identical to what every call site already expects.
//
// Writes are ROW-LEVEL (INSERT / UPDATE…WHERE id / DELETE…WHERE id) inside a
// transaction, never whole-table rewrites — so two people editing at once can't
// clobber each other's unrelated rows the way the localStorage backend could.
//
// Reads load the table and filter/sort in JS, matching lib/local-db.ts's
// semantics byte-for-byte (same eq/in matching, same numeric-vs-locale sort).

import { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import type { QueryOp, DbResult, ChangeVersions, Filter, Order } from "./query-types"
import { SEEDABLE_TABLES, seedRows } from "./seed"

type Row = Record<string, any>

// Every table the app reads (from a `.from("...")` audit). Created up front so
// selects on an empty table return [] instead of throwing "no such table".
const TABLES = [
  "global_settings", "printers", "filaments", "laser_materials", "uv_materials",
  "uv_inks", "clients", "quotes", "quote_templates", "quote_headers", "quote_parts",
  "counters", "imported_csv_files", "orders", "order_tasks", "order_notes",
  "order_attachments", "order_activity", "order_quote_links", "invoices", "payments",
] as const

const DEFAULT_PATH = resolve(process.cwd(), "data", "app.db")

let db: DatabaseSync | null = null
const versions: Record<string, number> = {}
let globalVersion = 0
const seeded = new Set<string>()

function ident(table: string): string {
  // Table names come only from the fixed TABLES list / KNOWN import list, never
  // user input, but validate anyway before interpolating into DDL/SQL.
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(`Invalid table name: ${table}`)
  return `"${table}"`
}

function getDb(): DatabaseSync {
  if (db) return db
  const path = process.env.SQLITE_PATH ? resolve(process.env.SQLITE_PATH) : DEFAULT_PATH
  mkdirSync(dirname(path), { recursive: true })
  const d = new DatabaseSync(path)
  d.exec("PRAGMA journal_mode = WAL")
  d.exec("PRAGMA foreign_keys = OFF")
  for (const t of TABLES) {
    d.exec(`CREATE TABLE IF NOT EXISTS ${ident(t)} (id TEXT PRIMARY KEY, doc TEXT NOT NULL)`)
    versions[t] = 0
  }
  db = d
  return d
}

function bump(table: string): void {
  globalVersion += 1
  versions[table] = (versions[table] ?? 0) + 1
}

function loadTable(d: DatabaseSync, table: string): Row[] {
  // Seed a seedable table the first time it is touched and is still empty.
  if (!seeded.has(table) && (SEEDABLE_TABLES as readonly string[]).includes(table)) {
    seeded.add(table)
    const count = d.prepare(`SELECT COUNT(*) AS n FROM ${ident(table)}`).get() as { n: number }
    if (count.n === 0) {
      const rows = seedRows(table)
      const insert = d.prepare(`INSERT INTO ${ident(table)} (id, doc) VALUES (?, ?)`)
      for (const r of rows) insert.run(r.id, JSON.stringify(r))
    }
  }
  const raw = d.prepare(`SELECT doc FROM ${ident(table)}`).all() as { doc: string }[]
  return raw.map((r) => JSON.parse(r.doc) as Row)
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    if (f.op === "eq") return row[f.col] === f.val
    if (f.op === "in") return Array.isArray(f.val) && f.val.includes(row[f.col])
    return true
  })
}

function applyOrder(rows: Row[], orders: Order[]): Row[] {
  if (orders.length === 0) return rows
  const sorted = [...rows]
  sorted.sort((a, b) => {
    for (const o of orders) {
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

function wrapSingle(rows: Row[], single: QueryOp["single"]): DbResult {
  if (single === "single") {
    if (rows.length === 0) return { data: null, error: { code: "PGRST116", message: "No rows found" } }
    return { data: rows[0], error: null }
  }
  if (single === "maybe") return { data: rows.length > 0 ? rows[0] : null, error: null }
  return { data: rows, error: null }
}

/** Execute a serialized query against SQLite. Never throws — errors are returned. */
export function runQuery(q: QueryOp): DbResult {
  try {
    const d = getDb()
    const table = ident(q.table) // validates; throws on bad name (caught below)

    if (q.op === "select") {
      let rows = loadTable(d, q.table).filter((r) => matches(r, q.filters))
      rows = applyOrder(rows, q.orders)
      if (q.limit !== null) rows = rows.slice(0, q.limit)
      return wrapSingle(rows, q.single)
    }

    if (q.op === "insert") {
      const now = new Date().toISOString()
      const inserted: Row[] = (q.payload as Row[]).map((r) => ({
        id: r.id ?? randomUUID(),
        created_at: r.created_at ?? now,
        ...r,
      }))
      const stmt = d.prepare(`INSERT INTO ${table} (id, doc) VALUES (?, ?)`)
      const tx = () => {
        for (const r of inserted) stmt.run(r.id, JSON.stringify(r))
      }
      transaction(d, tx)
      if (inserted.length) bump(q.table)
      return wrapSingle(inserted, q.single)
    }

    if (q.op === "update") {
      loadTable(d, q.table) // ensure seeded before we read for matching
      const all = loadTable(d, q.table)
      const targets = all.filter((r) => matches(r, q.filters))
      const updated: Row[] = targets.map((r) => ({ ...r, ...q.payload }))
      const stmt = d.prepare(`UPDATE ${table} SET doc = ? WHERE id = ?`)
      transaction(d, () => {
        for (const r of updated) stmt.run(JSON.stringify(r), r.id)
      })
      if (updated.length) bump(q.table)
      return wrapSingle(updated, q.single)
    }

    if (q.op === "delete") {
      const all = loadTable(d, q.table)
      const removed = all.filter((r) => matches(r, q.filters))
      const stmt = d.prepare(`DELETE FROM ${table} WHERE id = ?`)
      transaction(d, () => {
        for (const r of removed) stmt.run(r.id)
      })
      if (removed.length) bump(q.table)
      return wrapSingle(removed, q.single)
    }

    if (q.op === "replaceAll") {
      // Whole-table replace, used only by the one-shot data import. Treated as a
      // single logical change so subscribers refetch once.
      const rows = (q.payload as Row[]) ?? []
      const del = d.prepare(`DELETE FROM ${table}`)
      const ins = d.prepare(`INSERT INTO ${table} (id, doc) VALUES (?, ?)`)
      transaction(d, () => {
        del.run()
        for (const r of rows) {
          const withId = { id: r.id ?? randomUUID(), ...r }
          ins.run(withId.id, JSON.stringify(withId))
        }
      })
      seeded.add(q.table) // an explicit import supersedes seeding
      bump(q.table)
      return { data: rows, error: null }
    }

    return { data: null, error: { message: `Unsupported operation: ${q.op}` } }
  } catch (e: any) {
    return { data: null, error: { message: e?.message ?? String(e) } }
  }
}

/**
 * Run several queries in one call. The DB connection is shared and in-process,
 * so this is N cheap local queries behind a SINGLE HTTP round-trip — the fix for
 * page loads that otherwise fire one request per table (slow over a network).
 */
export function runBatch(ops: QueryOp[]): DbResult[] {
  return ops.map((op) => runQuery(op))
}

function transaction(d: DatabaseSync, fn: () => void): void {
  d.exec("BEGIN")
  try {
    fn()
    d.exec("COMMIT")
  } catch (e) {
    d.exec("ROLLBACK")
    throw e
  }
}

/** Current per-table change versions, for the polling endpoint. */
export function getChanges(): ChangeVersions {
  getDb()
  return { global: globalVersion, tables: { ...versions } }
}
