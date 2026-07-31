// Presentation-side grouping for saved UV quote lines.
//
// A double-sided job is stored as two rows — the front and its back side — so
// each pass keeps its own ink, minutes and nesting. To the client, though, they
// bought ONE product: the quote, the invoice and the history detail must show a
// single line whose price is both passes added together.
//
// Costs are summed; quantity is not, because both rows describe the same
// physical pieces (that is exactly what a back side means).

export type UvQuoteLine = {
  id?: string
  name?: string
  material_name?: string
  machine_name?: string
  quantity?: number
  pieces_per_run?: number
  minutes_per_run?: number
  runs?: number
  cost_per_piece?: number
  sell_per_piece?: number
  line_sell?: number
  discount_pct?: number
  ink?: { ml_per_run?: number }[]
  back_of_item_id?: string | null
  /** How many printed sides this line represents (2 once merged). */
  sides?: number
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)

/**
 * Merge every back-side row into the row it belongs to. Rows arrive in save
 * order; the merged line keeps the front row's position, identity and quantity.
 * A back side whose front row is missing (hand-edited backup, deleted item) is
 * kept as its own line rather than silently dropped from the totals.
 */
export function groupUvQuoteLines<T extends UvQuoteLine>(items: readonly T[]): (T & { sides: number })[] {
  const byId = new Map<string, T & { sides: number }>()
  const out: (T & { sides: number })[] = []

  for (const item of items) {
    if (item.back_of_item_id) continue
    const line = { ...item, sides: 1 }
    out.push(line)
    if (item.id) byId.set(item.id, line)
  }

  for (const back of items) {
    if (!back.back_of_item_id) continue
    const front = byId.get(back.back_of_item_id)
    if (!front) {
      out.push({ ...back, sides: 1 })
      continue
    }
    front.sides += 1
    front.runs = num(front.runs) + num(back.runs)
    front.minutes_per_run = num(front.minutes_per_run) + num(back.minutes_per_run)
    front.cost_per_piece = num(front.cost_per_piece) + num(back.cost_per_piece)
    front.sell_per_piece = num(front.sell_per_piece) + num(back.sell_per_piece)
    front.line_sell = num(front.line_sell) + num(back.line_sell)
    front.ink = [...(front.ink ?? []), ...(back.ink ?? [])]
  }

  return out
}

/** Total ml of ink a line consumes across the whole job, both sides included. */
export function lineInkMl(line: UvQuoteLine): number {
  const qty = num(line.quantity)
  const perRun = Math.max(1, num(line.pieces_per_run) || 1)
  return (line.ink ?? []).reduce((sum, u) => sum + num(u.ml_per_run) * (qty / perRun), 0)
}
