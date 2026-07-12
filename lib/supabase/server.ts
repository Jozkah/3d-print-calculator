// Kept for backwards compatibility with existing imports.
// The app no longer uses Supabase and no longer has a server-side data layer —
// data is stored locally in the browser. See lib/local-db.ts.
export { createClient } from "@/lib/local-db"
