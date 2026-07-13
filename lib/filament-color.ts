// Resolve a filament's display color: the stored color_hex wins; otherwise
// parse a color word out of the color-name field or the filament name
// ("Bambulab PLA Basic Green" -> green). Longest names match first so
// "light gray" beats "gray". Returns null when nothing matches (callers
// render the neutral gray spool).

const NAME_TO_HEX: Record<string, string> = {
  "rose gold": "#b76e79",
  "light gray": "#c9ccd1",
  "light grey": "#c9ccd1",
  "dark gray": "#4b4f55",
  "dark grey": "#4b4f55",
  "space gray": "#5f6672",
  "light blue": "#8ec9e8",
  "sky blue": "#8ec9e8",
  "dark blue": "#1a337e",
  "navy blue": "#1a337e",
  "light green": "#a5d8a7",
  "dark green": "#1f5e33",
  "transparent": "#dfe5ea",
  "natural": "#efe9dc",
  "clear": "#dfe5ea",
  "black": "#1a1a1a",
  "white": "#f5f5f5",
  "gray": "#8d8d8d",
  "grey": "#8d8d8d",
  "silver": "#c0c4c9",
  "red": "#d32f2f",
  "crimson": "#b0173a",
  "orange": "#f57c00",
  "yellow": "#fbc02d",
  "green": "#388e3c",
  "mint": "#a5d8bd",
  "teal": "#00897b",
  "cyan": "#00acc1",
  "turquoise": "#2ab5b0",
  "blue": "#1976d2",
  "navy": "#1a337e",
  "purple": "#7b1fa2",
  "violet": "#8656c9",
  "lavender": "#c5b3e6",
  "lilac": "#d9b8e8",
  "magenta": "#c2185b",
  "pink": "#e91e8c",
  "rose": "#f2b8c6",
  "peach": "#f7c5a8",
  "brown": "#6d4c41",
  "chocolate": "#4e342e",
  "beige": "#e0d3b8",
  "tan": "#d2b48c",
  "cream": "#f3ecd8",
  "ivory": "#f4f0e1",
  "gold": "#c9a227",
  "copper": "#b87333",
  "bronze": "#a97142",
  "marble": "#d8d8d3",
  "wood": "#a5794f",
}

// Longest keys first so multi-word colors win over their last word.
// Each entry carries a precomputed word-boundary regex so color words only
// match as whole words ("tan" must not match inside "Titanium").
const ORDERED: Array<[string, string, RegExp]> = Object.entries(NAME_TO_HEX)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([word, hex]) => [word, hex, new RegExp("\\b" + word.replace(/ /g, "\\s+") + "\\b", "i")])

/**
 * Display color for a filament row. Checks color_hex, then the color-name
 * field, then the filament name itself.
 */
export function resolveFilamentColor(f: {
  color_hex?: string | null
  color?: string | null
  name?: string | null
}): string | null {
  if (f.color_hex && /^#[0-9a-fA-F]{6}$/.test(f.color_hex)) return f.color_hex
  for (const source of [f.color, f.name]) {
    if (!source) continue
    for (const [, hex, re] of ORDERED) {
      if (re.test(source)) return hex
    }
  }
  return null
}
