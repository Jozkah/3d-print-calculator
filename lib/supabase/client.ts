// Browser data client — one import for the whole app, two possible backends.
//
// By default the app runs with NO backend at all: data lives in the visitor's
// localStorage (lib/local-db.ts), which is why this project needs no env vars
// to run. Set the two Supabase env vars and the same import starts talking to
// a real Postgres, with no change at any call site.
//
//   NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY → Supabase
//   either one missing                                       → localStorage
//   NEXT_PUBLIC_DATA_BACKEND=local                           → force localStorage
//
// lib/local-db.ts deliberately implements the subset of the Supabase
// query-builder API this app uses (.from().select().eq().order().single(),
// insert/update/delete, channel/removeChannel), which is what makes the two
// interchangeable from a caller's point of view.

import { createBrowserClient } from "@supabase/ssr"
import { createClient as createLocalClient, type LocalDbClient } from "@/lib/local-db"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * True when this build talks to Supabase. Credentials alone flip it;
 * NEXT_PUBLIC_DATA_BACKEND=local overrides them, so a Supabase-configured
 * deployment can still run a purely local preview.
 */
export const isSupabaseBackend =
  process.env.NEXT_PUBLIC_DATA_BACKEND !== "local" && Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export function createClient(): LocalDbClient {
  if (!isSupabaseBackend) return createLocalClient()
  // The seam between the two backends. The real client implements a superset of
  // LocalDbClient but with its own generics, so the shared shape is asserted
  // here once rather than at all ~27 call sites.
  return createBrowserClient(SUPABASE_URL!, SUPABASE_ANON_KEY!) as unknown as LocalDbClient
}
