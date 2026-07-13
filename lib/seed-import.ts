// Validated importer for local data dumps.
//
// Takes a parsed seed object shaped like `{ printers: [...], quotes: [...] }`,
// validates it against the tables the app actually uses, migrates legacy
// schemas (owner display names, per-person payout columns, Postgres-style
// timestamps) and writes each table into localStorage (`3dpc:<table>`).
//
// Used by the manual "Import data" card in Settings — nothing is fetched or
// imported automatically.

import { OWNER_A_KEY, OWNER_B_KEY } from "@/lib/business-config"

const PREFIX = "3dpc:"

// Tables the app reads. Anything else in the file is skipped, not written.
const KNOWN_TABLES = [
  "printers",
  "filaments",
  "laser_materials",
  "clients",
  "quotes",
  "global_settings",
  "imported_csv_files",
  "quote_headers",
  "quote_parts",
] as const

export type SeedImportSummary = {
  imported: { table: string; rows: number }[]
  skipped: string[]
  errors: string[]
}

// Postgres dumps store "2026-01-24 19:11:46.539101+00"; Safari's Date parser
// rejects the space separator and bare "+00" offset, and mixed formats break
// string-based ordering against ISO rows written by the app.
function normalizeTimestamp(value: unknown): unknown {
  if (typeof value !== "string") return value
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) return value
  let iso = value.replace(" ", "T")
  iso = iso.replace(/\+00(:00)?$/, "Z")
  return iso
}

function normalizeRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...row }
  for (const col of ["created_at", "updated_at"]) {
    if (col in out) out[col] = normalizeTimestamp(out[col])
  }
  return out
}

/**
 * Legacy seeds store printers.owner as real display names and quote payouts
 * as `<name>_receives` columns. The app matches on the stable OWNER_A_KEY /
 * OWNER_B_KEY, so unknown owner names are mapped — in order of first
 * appearance in the printers list — to Owner A then Owner B, and the payout
 * columns are renamed to owner_a_receives / owner_b_receives accordingly.
 */
function buildOwnerMapping(printers: Record<string, any>[]): Map<string, string> {
  const mapping = new Map<string, string>()
  const stable = [OWNER_A_KEY, OWNER_B_KEY]
  let next = 0
  for (const p of printers) {
    const owner = p?.owner
    if (typeof owner !== "string" || owner.length === 0) continue
    if (stable.includes(owner) || mapping.has(owner)) continue
    if (next < stable.length) mapping.set(owner, stable[next++])
  }
  return mapping
}

function migrateOwners(seed: Record<string, any[]>): void {
  const printers = Array.isArray(seed.printers) ? seed.printers : []
  const mapping = buildOwnerMapping(printers)
  if (mapping.size === 0) return

  for (const p of printers) {
    if (typeof p?.owner === "string" && mapping.has(p.owner)) {
      p.owner = mapping.get(p.owner)
    }
  }

  // `<legacy name>_receives` -> `owner_a_receives` / `owner_b_receives`.
  const payoutColumn = new Map<string, string>()
  for (const [legacy, stable] of mapping) {
    const suffix = stable === OWNER_A_KEY ? "owner_a_receives" : "owner_b_receives"
    payoutColumn.set(`${legacy.toLowerCase()}_receives`, suffix)
  }
  const quotes = Array.isArray(seed.quotes) ? seed.quotes : []
  for (const q of quotes) {
    if (!q || typeof q !== "object") continue
    for (const [legacyCol, stableCol] of payoutColumn) {
      if (legacyCol in q) {
        if (q[stableCol] === undefined || q[stableCol] === null) q[stableCol] = q[legacyCol]
        delete q[legacyCol]
      }
    }
  }
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/**
 * Validate and import a parsed seed object into localStorage, replacing the
 * existing contents of each table present in the file. Returns a summary;
 * throws only if the input is not an object at all.
 */
export function importSeedObject(seed: unknown): SeedImportSummary {
  const summary: SeedImportSummary = { imported: [], skipped: [], errors: [] }

  if (!isPlainObject(seed)) {
    throw new Error("Backup file must be a JSON object mapping table names to arrays of rows.")
  }

  // Work on a structural copy so migration doesn't mutate the caller's data.
  const data: Record<string, any> = JSON.parse(JSON.stringify(seed))
  migrateOwners(data)

  for (const [table, rows] of Object.entries(data)) {
    if (!(KNOWN_TABLES as readonly string[]).includes(table)) {
      summary.skipped.push(table)
      continue
    }
    if (!Array.isArray(rows)) {
      summary.errors.push(`"${table}" is not an array — skipped.`)
      continue
    }
    const invalid = rows.findIndex((r) => !isPlainObject(r))
    if (invalid !== -1) {
      summary.errors.push(`"${table}" row ${invalid} is not an object — table skipped.`)
      continue
    }
    const normalized = rows.map(normalizeRow)
    try {
      window.localStorage.setItem(PREFIX + table, JSON.stringify(normalized))
      summary.imported.push({ table, rows: normalized.length })
    } catch (e: any) {
      summary.errors.push(`"${table}" failed to write: ${e?.message ?? String(e)}`)
    }
  }

  return summary
}
