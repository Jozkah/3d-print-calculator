import { describe, it, expect } from "vitest"
import { groupUvQuoteLines, lineInkMl } from "./uv-quote-items"

const front = {
  id: "front",
  name: "Hangtags QR",
  quantity: 100,
  pieces_per_run: 20,
  minutes_per_run: 5,
  runs: 5,
  cost_per_piece: 0.07,
  sell_per_piece: 0.16,
  line_sell: 15.76,
  ink: [{ ml_per_run: 0.04 }],
  back_of_item_id: null,
}

const back = {
  ...front,
  id: "back",
  runs: 5,
  cost_per_piece: 0.08,
  sell_per_piece: 0.19,
  line_sell: 18.54,
  ink: [{ ml_per_run: 0.02 }],
  back_of_item_id: "front",
}

describe("groupUvQuoteLines", () => {
  it("bills a front and its back side as one line", () => {
    const [line, ...rest] = groupUvQuoteLines([front, back])
    expect(rest).toHaveLength(0)
    expect(line.sides).toBe(2)
    expect(line.name).toBe("Hangtags QR")
    // Same physical pieces: quantity must NOT double.
    expect(line.quantity).toBe(100)
    expect(line.line_sell).toBeCloseTo(15.76 + 18.54, 6)
    expect(line.cost_per_piece).toBeCloseTo(0.15, 6)
    expect(line.sell_per_piece).toBeCloseTo(0.35, 6)
    expect(line.runs).toBe(10)
  })

  it("keeps the quote total unchanged when lines are merged", () => {
    const ungrouped = [front, back].reduce((s, i) => s + i.line_sell, 0)
    const grouped = groupUvQuoteLines([front, back]).reduce((s, i) => s + (i.line_sell ?? 0), 0)
    expect(grouped).toBeCloseTo(ungrouped, 6)
  })

  it("sums ink across both sides", () => {
    const [line] = groupUvQuoteLines([front, back])
    // (0.04 + 0.02) ml per run over 100/20 = 5 runs.
    expect(lineInkMl(line)).toBeCloseTo(0.3, 6)
  })

  it("keeps an orphaned back side visible instead of dropping its price", () => {
    const lines = groupUvQuoteLines([{ ...back, back_of_item_id: "deleted" }])
    expect(lines).toHaveLength(1)
    expect(lines[0].line_sell).toBeCloseTo(18.54, 6)
  })

  it("leaves single-sided quotes untouched", () => {
    const lines = groupUvQuoteLines([front])
    expect(lines).toHaveLength(1)
    expect(lines[0].sides).toBe(1)
    expect(lines[0].line_sell).toBeCloseTo(15.76, 6)
  })
})
