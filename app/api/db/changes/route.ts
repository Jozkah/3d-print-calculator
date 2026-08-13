// Lightweight polling endpoint for near-real-time refresh. The browser polls
// this every couple of seconds (lib/db-realtime.ts); when a table's version has
// bumped since the last poll, the screens subscribed to it refetch.

import { NextResponse } from "next/server"
import { getChanges } from "@/lib/server-db/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getChanges(), {
    headers: { "Cache-Control": "no-store" },
  })
}
