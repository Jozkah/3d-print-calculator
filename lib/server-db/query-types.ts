// Wire format shared by the browser remote client (lib/remote-db.ts) and the
// server route (app/api/db). A query is serialized to this shape, POSTed to
// /api/db, executed against SQLite, and the result returned. Kept dependency-free
// so it is safe to import from both the browser and the Node server.

export type Filter = { col: string; op: "eq" | "in"; val: any }
export type Order = { col: string; asc: boolean }

export type QueryOp = {
  table: string
  op: "select" | "insert" | "update" | "delete" | "replaceAll"
  filters: Filter[]
  orders: Order[]
  limit: number | null
  single: "single" | "maybe" | null
  // insert/replaceAll: rows to write. update: the partial values to merge.
  payload: any
}

export type DbError = { code?: string; message: string }
export type DbResult<R = any> = { data: R; error: DbError | null }

/** Per-table change versions, returned by GET /api/db/changes for polling. */
export type ChangeVersions = { global: number; tables: Record<string, number> }
