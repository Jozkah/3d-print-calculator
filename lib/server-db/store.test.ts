// Query-engine tests for the shared SQLite backend. Uses a temp DB file so it
// exercises the real node:sqlite path (row-level writes, seeding, versioning).

import { describe, it, expect, beforeAll } from "vitest"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Point the store at a throwaway DB before it is imported (getDb reads this).
process.env.SQLITE_PATH = join(tmpdir(), `3dpc-test-${process.pid}.db`)

// Imported after the env var is set so the singleton opens the temp file.
const { runQuery, getChanges } = await import("./store")

describe("server SQLite store", () => {
  beforeAll(() => {
    // Start each entity table used below from a clean slate.
    for (const t of ["printers", "clients"]) {
      runQuery({ table: t, op: "replaceAll", filters: [], orders: [], limit: null, single: null, payload: [] })
    }
  })

  it("inserts and selects rows, assigning id and created_at", async () => {
    const ins = runQuery({
      table: "printers", op: "insert", filters: [], orders: [], limit: null, single: null,
      payload: [{ name: "A2" }],
    })
    expect(ins.error).toBeNull()
    expect(ins.data[0].id).toBeTruthy()
    expect(ins.data[0].created_at).toBeTruthy()

    const sel = runQuery({ table: "printers", op: "select", filters: [], orders: [], limit: null, single: null, payload: null })
    expect(sel.data).toHaveLength(1)
    expect(sel.data[0].name).toBe("A2")
  })

  it("filters with eq and in", () => {
    runQuery({ table: "clients", op: "insert", filters: [], orders: [], limit: null, single: null,
      payload: [{ id: "c1", name: "Ann" }, { id: "c2", name: "Bob" }, { id: "c3", name: "Cy" }] })

    const eq = runQuery({ table: "clients", op: "select", filters: [{ col: "name", op: "eq", val: "Bob" }], orders: [], limit: null, single: null, payload: null })
    expect(eq.data.map((r: any) => r.id)).toEqual(["c2"])

    const inq = runQuery({ table: "clients", op: "select", filters: [{ col: "id", op: "in", val: ["c1", "c3"] }], orders: [], limit: null, single: null, payload: null })
    expect(inq.data.map((r: any) => r.name).sort()).toEqual(["Ann", "Cy"])
  })

  it("orders and limits", () => {
    const desc = runQuery({ table: "clients", op: "select", filters: [], orders: [{ col: "name", asc: false }], limit: 2, single: null, payload: null })
    expect(desc.data.map((r: any) => r.name)).toEqual(["Cy", "Bob"])
  })

  it("single() returns PGRST116 when empty, the row otherwise", () => {
    const none = runQuery({ table: "clients", op: "select", filters: [{ col: "id", op: "eq", val: "nope" }], orders: [], limit: null, single: "single", payload: null })
    expect(none.data).toBeNull()
    expect(none.error?.code).toBe("PGRST116")

    const one = runQuery({ table: "clients", op: "select", filters: [{ col: "id", op: "eq", val: "c1" }], orders: [], limit: null, single: "single", payload: null })
    expect(one.error).toBeNull()
    expect((one.data as any).name).toBe("Ann")
  })

  it("updates only matching rows and returns them", () => {
    const upd = runQuery({ table: "clients", op: "update", filters: [{ col: "id", op: "eq", val: "c1" }], orders: [], limit: null, single: null, payload: { name: "Annie" } })
    expect(upd.data).toHaveLength(1)
    expect(upd.data[0].name).toBe("Annie")

    const check = runQuery({ table: "clients", op: "select", filters: [{ col: "id", op: "eq", val: "c2" }], orders: [], limit: null, single: "single", payload: null })
    expect((check.data as any).name).toBe("Bob") // untouched
  })

  it("deletes matching rows and returns them", () => {
    const del = runQuery({ table: "clients", op: "delete", filters: [{ col: "id", op: "eq", val: "c3" }], orders: [], limit: null, single: null, payload: null })
    expect(del.data.map((r: any) => r.id)).toEqual(["c3"])
    const remaining = runQuery({ table: "clients", op: "select", filters: [], orders: [], limit: null, single: null, payload: null })
    expect(remaining.data.map((r: any) => r.id).sort()).toEqual(["c1", "c2"])
  })

  it("bumps the change version on writes", () => {
    const before = getChanges().global
    runQuery({ table: "printers", op: "insert", filters: [], orders: [], limit: null, single: null, payload: [{ name: "B1" }] })
    expect(getChanges().global).toBeGreaterThan(before)
  })

  it("seeds global_settings on first read", () => {
    const gs = runQuery({ table: "global_settings", op: "select", filters: [], orders: [], limit: null, single: "maybe", payload: null })
    expect(gs.data).not.toBeNull()
    expect((gs.data as any).currency_symbol).toBe("€")
  })

  it("replaceAll swaps the whole table", () => {
    runQuery({ table: "printers", op: "replaceAll", filters: [], orders: [], limit: null, single: null, payload: [{ id: "p9", name: "Only" }] })
    const all = runQuery({ table: "printers", op: "select", filters: [], orders: [], limit: null, single: null, payload: null })
    expect(all.data).toHaveLength(1)
    expect(all.data[0].name).toBe("Only")
  })
})
