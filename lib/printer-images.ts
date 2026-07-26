// Registry of bundled printer product images + name-based matching.
// Aliases are matched against a normalized printer name (lowercase,
// non-alphanumerics stripped), most-specific entry first, so "A1 mini"
// resolves to a1-mini and never to a1.

export type PrinterImageEntry = {
  key: string
  label: string
  src: string
  aliases: string[]
}

export const GENERIC_PRINTER_KEY = "generic"

export const PRINTER_IMAGES: PrinterImageEntry[] = [
  { key: "a1-mini", label: "Bambu Lab A1 mini", src: "/printers/a1-mini.png", aliases: ["a1mini"] },
  { key: "a2l", label: "Bambu Lab A2L", src: "/printers/a2l.png", aliases: ["a2l"] },
  { key: "p1s", label: "Bambu Lab P1S", src: "/printers/p1s.png", aliases: ["p1s", "p1p"] },
  { key: "p2s", label: "Bambu Lab P2S", src: "/printers/p2s.png", aliases: ["p2s"] },
  { key: "x1c", label: "Bambu Lab X1C", src: "/printers/x1c.png", aliases: ["x1c", "x1carbon", "x1e"] },
  { key: "x2d", label: "Bambu Lab X2D", src: "/printers/x2d.png", aliases: ["x2d"] },
  { key: "h2d", label: "Bambu Lab H2D", src: "/printers/h2d.png", aliases: ["h2d"] },
  { key: "h2s", label: "Bambu Lab H2S", src: "/printers/h2s.png", aliases: ["h2s"] },
  { key: "h2c", label: "Bambu Lab H2C", src: "/printers/h2c.png", aliases: ["h2c"] },
  // "a1" last among A-series so "a1mini" wins first.
  { key: "a1", label: "Bambu Lab A1", src: "/printers/a1.png", aliases: ["a1"] },
]

const byKey = new Map(PRINTER_IMAGES.map((e) => [e.key, e]))

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/**
 * Resolve a printer row to a bundled image. Explicit image_key wins
 * ("generic" forces the silhouette); otherwise the printer name is
 * alias-matched. Returns null when nothing matches (caller renders the
 * generic silhouette).
 */
export function resolvePrinterImage(name: string, imageKey?: string | null): PrinterImageEntry | null {
  if (imageKey === GENERIC_PRINTER_KEY) return null
  if (imageKey && byKey.has(imageKey)) return byKey.get(imageKey)!
  const n = normalize(name || "")
  if (!n) return null
  return PRINTER_IMAGES.find((e) => e.aliases.some((a) => n.includes(a))) || null
}
