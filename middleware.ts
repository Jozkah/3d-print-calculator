import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Auth middleware (official @supabase/ssr pattern for the Next.js App Router).
 *
 * Every request refreshes the Supabase session (cookies are written to BOTH the
 * request and the response, as the supabase-ssr recipe requires) and
 * unauthenticated visitors are redirected to /login. Only /login, /auth/*,
 * /quote/view (fragment-decoded share links) and static assets are reachable
 * without a session.
 */
export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // No Supabase configured (e.g. local build without env vars): don't block
  // the request — the app itself will surface the missing configuration.
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
      },
    },
  })

  // IMPORTANT: do not run code between createServerClient and auth.getUser() —
  // it can cause hard-to-debug session issues (see supabase-ssr docs).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  // /quote/view is the self-contained share view: recipients of share links
  // are unauthenticated, and the whole document payload travels in the URL
  // fragment (which never reaches the server), so nothing leaks by serving it.
  const isPublicRoute =
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/auth") ||
    pathname === "/quote/view"

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = ""
    const redirectResponse = NextResponse.redirect(url)
    // Preserve any refreshed auth cookies on the redirect.
    supabaseResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie))
    return redirectResponse
  }

  // You MUST return the supabaseResponse object as-is so refreshed auth
  // cookies reach the browser.
  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico and common static assets (svg, png, jpg, jpeg, gif, webp, ico)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
