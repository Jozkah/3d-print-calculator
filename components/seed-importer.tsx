"use client"

import { useEffect } from "react"

// One-time importer for a local data dump.
//
// If a file is present at `public/seed-data.json`, the first time the app runs
// in a given browser this loads its contents into localStorage (one key per
// table, `3dpc:<table>`), then reloads so the pages pick up the data.
//
// The seed file is OPTIONAL and git-ignored — it holds private data and is
// never committed. Public users simply won't have one, so this is a no-op for
// them (the fetch 404s and nothing happens).
//
// To use your own data: drop a `public/seed-data.json` shaped like
// `{ "printers": [...], "filaments": [...], "quotes": [...], ... }` and load
// the app once.
const SEEDED_FLAG = "3dpc:__seeded"

export function SeedImporter() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (localStorage.getItem(SEEDED_FLAG)) return

    let cancelled = false
    fetch("/seed-data.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((seed) => {
        if (cancelled || !seed || typeof seed !== "object") return
        for (const [table, rows] of Object.entries(seed)) {
          localStorage.setItem(`3dpc:${table}`, JSON.stringify(rows))
        }
        localStorage.setItem(SEEDED_FLAG, "1")
        // Reload so any already-mounted page re-reads the freshly seeded data.
        window.location.reload()
      })
      .catch(() => {
        // No seed file (or it's malformed) — nothing to import.
      })

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
