import { describe, it, expect } from "vitest"
import { normalizeOwnerMode, quoteVatApplies } from "./quote-modes"

describe("normalizeOwnerMode", () => {
  it("maps legacy and new values", () => {
    expect(normalizeOwnerMode("business")).toBe("dual")
    expect(normalizeOwnerMode("dual")).toBe("dual")
    expect(normalizeOwnerMode("personal")).toBe("single")
    expect(normalizeOwnerMode("single")).toBe("single")
    expect(normalizeOwnerMode(undefined)).toBe("single")
    expect(normalizeOwnerMode("weird")).toBe("single")
  })
})

describe("quoteVatApplies", () => {
  it("honours the explicit flag regardless of owner mode", () => {
    expect(quoteVatApplies({ vat_enabled: true, quote_type: "single" })).toBe(true)
    expect(quoteVatApplies({ vat_enabled: false, quote_type: "dual" })).toBe(false)
  })
  it("falls back to legacy behaviour when the flag is absent", () => {
    expect(quoteVatApplies({ quote_type: "business" })).toBe(true)
    expect(quoteVatApplies({ quote_type: "personal" })).toBe(false)
    expect(quoteVatApplies({})).toBe(false)
  })
})
