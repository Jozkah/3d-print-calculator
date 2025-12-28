import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Whitelist of allowed IP addresses
const ALLOWED_IPS = ["0.0.0.0", "0.0.0.0"]

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  if (pathname.startsWith("/quote/")) {
    console.log("[v0] Allowing public access to quote page")
    return NextResponse.next()
  }

  // Get the IP address from the request
  // Vercel provides the real IP in x-forwarded-for or x-real-ip headers
  const forwardedFor = request.headers.get("x-forwarded-for")
  const realIp = request.headers.get("x-real-ip")

  // Extract the client IP (first IP in x-forwarded-for chain)
  const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : realIp || request.ip || "unknown"

  console.log("[v0] Incoming request from IP:", clientIp)

  // Allow localhost for development
  if (clientIp === "::1" || clientIp === "127.0.0.1" || clientIp === "localhost" || clientIp === "unknown") {
    console.log("[v0] Allowing localhost/development access")
    return NextResponse.next()
  }

  // Check if IP is in whitelist
  if (ALLOWED_IPS.includes(clientIp)) {
    console.log("[v0] IP is whitelisted, allowing access")
    return NextResponse.next()
  }

  // Block all other IPs
  console.log("[v0] IP not whitelisted, blocking access")
  return new NextResponse("Access Denied: Your IP address is not authorized to access this application.", {
    status: 403,
    headers: {
      "Content-Type": "text/plain",
    },
  })
}

// Apply middleware to all routes except static files and API routes you want to exclude
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
