// G-code metadata extraction for the calculator's per-part import button.
//
// Slicers embed print-time and filament-usage estimates as comments. We only
// scan comment lines, so passing the first/last chunks of a large file is
// enough (slicers put metadata in the header or footer).
//
// Supported:
// - PrusaSlicer / OrcaSlicer / Bambu Studio:
//     "; estimated printing time (normal mode) = 1d 2h 3m 4s"  (any subset of units)
//     "; total filament used [g] = 12.34"
//     "; filament used [g] = 12.34"
// - Cura:
//     ";TIME:5460"            (seconds)
//     ";Filament used: 3.99m" (meters only -> grams unknown, skipped)

export type GcodeEstimates = {
  hours?: number
  grams?: number
}

/** Parse "1d 2h 3m 4s"-style durations (any subset of units) into hours. */
function parseDurationToHours(text: string): number | undefined {
  let total = 0
  let matched = false
  const re = /(\d+(?:\.\d+)?)\s*(d|h|m|s)\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const value = Number.parseFloat(m[1])
    if (!Number.isFinite(value)) continue
    matched = true
    switch (m[2].toLowerCase()) {
      case "d":
        total += value * 24
        break
      case "h":
        total += value
        break
      case "m":
        total += value / 60
        break
      case "s":
        total += value / 3600
        break
    }
  }
  return matched ? total : undefined
}

/**
 * Extract time/filament estimates from G-code text. Returns whichever of
 * hours/grams could be found; both absent means no recognizable metadata.
 */
export function parseGcode(text: string): GcodeEstimates {
  const result: GcodeEstimates = {}

  // PrusaSlicer / Orca / Bambu: "; estimated printing time (normal mode) = 1d 2h 3m 4s"
  // (also matches variants like "silent mode" or no mode qualifier).
  const prusaTime = text.match(/;\s*estimated printing time[^=\n]*=\s*([^\n]+)/i)
  if (prusaTime) {
    const hours = parseDurationToHours(prusaTime[1])
    if (hours !== undefined) result.hours = hours
  }

  // Cura: ";TIME:5460" (seconds).
  if (result.hours === undefined) {
    const curaTime = text.match(/^;TIME:(\d+)/m)
    if (curaTime) {
      const seconds = Number.parseInt(curaTime[1], 10)
      if (Number.isFinite(seconds)) result.hours = seconds / 3600
    }
  }

  // PrusaSlicer / Orca / Bambu grams: "; total filament used [g] =" or
  // "; filament used [g] =". Prefer the total when both are present.
  const totalGrams = text.match(/;\s*total filament used \[g\]\s*=\s*(\d+(?:\.\d+)?)/i)
  const usedGrams = text.match(/;\s*filament used \[g\]\s*=\s*(\d+(?:\.\d+)?)/i)
  const gramsMatch = totalGrams || usedGrams
  if (gramsMatch) {
    const grams = Number.parseFloat(gramsMatch[1])
    if (Number.isFinite(grams)) result.grams = grams
  }
  // Cura's ";Filament used: 3.99m" only reports meters — without filament
  // diameter/density we can't convert to grams, so grams stays undefined.

  return result
}
