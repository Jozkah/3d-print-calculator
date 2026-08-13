// Backend-aware "data changed" subscription. Screens call onDbChange(cb) to
// refetch when data changes anywhere.
//
//   local backend  → the write happened in this browser; delegate to the
//                    localStorage window/storage events (lib/local-db.ts).
//   server backend → the write may have happened in someone else's browser, so
//                    poll /api/db/changes and fire cb(table) for each table whose
//                    version bumped. A single shared poller fans out to every
//                    subscriber (one request every few seconds, not one per hook).
//
// Supersedes direct imports of onLocalDbChange so both backends refresh live.

import { isServerBackend } from "@/lib/data-backend"
import { onLocalDbChange } from "@/lib/local-db"
import type { ChangeVersions } from "@/lib/server-db/query-types"

const POLL_MS = 2500

type Sub = (table?: string) => void

const subscribers = new Set<Sub>()
let timer: ReturnType<typeof setInterval> | null = null
let lastVersions: Record<string, number> | null = null

async function poll(): Promise<void> {
  let changes: ChangeVersions
  try {
    const res = await fetch("/api/db/changes", { cache: "no-store" })
    if (!res.ok) return
    changes = (await res.json()) as ChangeVersions
  } catch {
    return // transient network error — try again next tick
  }

  const prev = lastVersions
  lastVersions = { ...changes.tables }
  if (prev === null) return // first poll establishes the baseline; don't fire

  for (const [table, version] of Object.entries(changes.tables)) {
    if ((prev[table] ?? 0) !== version) {
      subscribers.forEach((cb) => cb(table))
    }
  }
}

function startPoller(): void {
  if (timer !== null || typeof window === "undefined") return
  lastVersions = null
  void poll() // establish baseline immediately
  timer = setInterval(() => void poll(), POLL_MS)
}

function stopPoller(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
  lastVersions = null
}

/**
 * Subscribe to data changes. Returns an unsubscribe function.
 * The callback receives the changed table name when known.
 */
export function onDbChange(cb: Sub): () => void {
  if (!isServerBackend) return onLocalDbChange(cb)

  subscribers.add(cb)
  startPoller()
  return () => {
    subscribers.delete(cb)
    if (subscribers.size === 0) stopPoller()
  }
}
