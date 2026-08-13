// Minimal ambient types for Node's built-in SQLite module. The installed
// @types/node (v20) predates node:sqlite, so we declare the small surface used
// by lib/server-db/store.ts. Node 24 provides the runtime implementation.

declare module "node:sqlite" {
  interface StatementSync {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }

  interface DatabaseSyncOptions {
    open?: boolean
    readOnly?: boolean
  }

  export class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
