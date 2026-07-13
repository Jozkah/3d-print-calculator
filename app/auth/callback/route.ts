import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

/**
 * Auth callback for magic-link / OTP sign-in.
 * Exchanges the one-time code for a session, then redirects to the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")

  if (code && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}/`)
    }
  }

  // Missing/invalid code or exchange failure: back to the login screen.
  return NextResponse.redirect(`${origin}/login`)
}
