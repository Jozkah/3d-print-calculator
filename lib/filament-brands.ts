// Registry of filament brands with bundled logo marks + name matching.
// Matching mirrors lib/printer-images.ts: normalize to lowercase
// alphanumerics, first alias hit wins.

export type FilamentBrandEntry = {
  key: string
  label: string
  /** Bundled logo path, or null when no usable mark exists (monogram fallback). */
  src: string | null
  aliases: string[]
}

export const FILAMENT_BRANDS: FilamentBrandEntry[] = [
  { key: "bambu-lab", label: "Bambu Lab", src: "/brands/bambu-lab.png", aliases: ["bambu"] },
  { key: "prusament", label: "Prusament", src: "/brands/prusament.png", aliases: ["prusa"] },
  { key: "esun", label: "eSUN", src: "/brands/esun.png", aliases: ["esun"] },
  { key: "polymaker", label: "Polymaker", src: "/brands/polymaker.png", aliases: ["polymaker", "polyterra", "polylite", "polymax"] },
  { key: "sunlu", label: "SUNLU", src: "/brands/sunlu.png", aliases: ["sunlu"] },
  { key: "overture", label: "Overture", src: "/brands/overture.png", aliases: ["overture"] },
  { key: "hatchbox", label: "Hatchbox", src: "/brands/hatchbox.png", aliases: ["hatchbox"] },
  { key: "creality", label: "Creality", src: "/brands/creality.png", aliases: ["creality", "ender", "hyper"] },
  { key: "anycubic", label: "Anycubic", src: "/brands/anycubic.png", aliases: ["anycubic"] },
  { key: "elegoo", label: "ELEGOO", src: "/brands/elegoo.png", aliases: ["elegoo"] },
  { key: "eryone", label: "Eryone", src: "/brands/eryone.png", aliases: ["eryone"] },
  { key: "colorfabb", label: "colorFabb", src: "/brands/colorfabb.png", aliases: ["colorfabb"] },
  { key: "fillamentum", label: "Fillamentum", src: "/brands/fillamentum.png", aliases: ["fillamentum"] },
  { key: "formfutura", label: "FormFutura", src: "/brands/formfutura.png", aliases: ["formfutura"] },
  { key: "fiberlogy", label: "Fiberlogy", src: "/brands/fiberlogy.png", aliases: ["fiberlogy"] },
  { key: "spectrum", label: "Spectrum", src: "/brands/spectrum.png", aliases: ["spectrum"] },
  { key: "devil-design", label: "Devil Design", src: "/brands/devil-design.png", aliases: ["devildesign", "devil"] },
  { key: "kingroon", label: "Kingroon", src: "/brands/kingroon.png", aliases: ["kingroon"] },
]

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Resolve a free-text brand string to a registry entry, or null. */
export function resolveFilamentBrand(brand?: string | null): FilamentBrandEntry | null {
  if (!brand) return null
  const n = normalize(brand)
  if (!n) return null
  return FILAMENT_BRANDS.find((e) => e.aliases.some((a) => n.includes(a))) || null
}
