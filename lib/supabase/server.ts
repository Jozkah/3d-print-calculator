// Server-side data client, mirroring lib/supabase/client.ts.
//
// With Supabase configured this is a real cookie-aware server client. Without
// it the app has no server-side data layer at all — everything lives in the
// visitor's browser — so callers get the same localStorage-backed shim, which
// reads as empty on the server.
//
// Import this only from server components, route handlers and server actions:
// it pulls in next/headers.

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient as createLocalClient, type LocalDbClient } from "@/lib/local-db"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const isSupabaseBackend =
  process.env.NEXT_PUBLIC_DATA_BACKEND !== "local" && Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export async function createClient(): Promise<LocalDbClient> {
  if (!isSupabaseBackend) return createLocalClient()

  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Components cannot set cookies; whichever route handler or
          // middleware owns the response refreshes the session instead.
        }
      },
    },
  }) as unknown as LocalDbClient
}
