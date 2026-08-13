// Safe UUID generator that works in NON-secure contexts.
//
// `crypto.randomUUID()` only exists in a secure context (https:// or
// localhost). When the app is served over plain http:// to a LAN IP
// (e.g. http://192.168.1.170:4001 — exactly the multi-user hosting case),
// `crypto.randomUUID` is undefined and every call throws
// "crypto.randomUUID is not a function".
//
// `crypto.getRandomValues()`, by contrast, IS available over plain http, so we
// build a proper RFC-4122 v4 UUID from it, and fall back to Math.random only if
// even that is missing. Use this everywhere instead of crypto.randomUUID().

export function uuid(): string {
  const c = typeof crypto !== "undefined" ? (crypto as Crypto) : undefined

  // Fast path: secure context (https / localhost) or Node.
  if (c && typeof c.randomUUID === "function") return c.randomUUID()

  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }

  // Set the version (4) and variant (10xx) bits per RFC 4122.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex: string[] = []
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, "0"))
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  )
}
