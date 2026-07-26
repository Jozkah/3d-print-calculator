// Which calculator a quote belongs to. Extracted because three call sites
// (business page, personal page, quote history) each had their own copy of the
// legacy-mode list, and a third calculator would have made it four.

export const LEGACY_LASER_MODES = ["laser-engraving", "laser-cutting", "stickers"]

export type CalcType = "3d-print" | "laser" | "uv" | "legacy-laser"

/** Laser/sticker quote, including rows saved before the laser rework. */
export const isLaserQuote = (quote: { quote_type_mode?: string }): boolean =>
  quote.quote_type_mode === "laser" || LEGACY_LASER_MODES.includes(quote.quote_type_mode ?? "")

export const isUvQuote = (quote: { quote_type_mode?: string }): boolean => quote.quote_type_mode === "uv"

/**
 * Editing an existing quote pins the calculator to that quote's mode; otherwise
 * the `?type=` search param picks it, defaulting to 3D print.
 */
export function resolveCalcType(args: {
  isEditing: boolean
  editingQuoteMode?: string
  typeParam?: string | null
}): CalcType {
  if (args.isEditing) {
    if (args.editingQuoteMode === "laser") return "laser"
    if (args.editingQuoteMode === "uv") return "uv"
    if (LEGACY_LASER_MODES.includes(args.editingQuoteMode ?? "")) return "legacy-laser"
    return "3d-print"
  }
  if (args.typeParam === "laser") return "laser"
  if (args.typeParam === "uv") return "uv"
  return "3d-print"
}
