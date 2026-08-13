// Which data backend this build talks to. Extracted into its own module so the
// browser client, the realtime subscription, and the remote client can all read
// the flags without importing each other (avoids import cycles).
//
//   NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY → Supabase
//   NEXT_PUBLIC_DATA_BACKEND=server                          → shared SQLite via /api/db
//   NEXT_PUBLIC_DATA_BACKEND=local (or nothing set)          → browser localStorage
//
// Precedence: an explicit `local` forces localStorage even if Supabase creds
// exist (local preview of a configured deployment); otherwise `server` picks the
// SQLite backend; otherwise Supabase creds pick Supabase; otherwise localStorage.

const BACKEND = process.env.NEXT_PUBLIC_DATA_BACKEND
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** True when data lives in the shared server-side SQLite database (/api/db). */
export const isServerBackend = BACKEND === "server"

/** True when this build talks to Supabase. `local`/`server` override the creds. */
export const isSupabaseBackend =
  BACKEND !== "local" && BACKEND !== "server" && Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
