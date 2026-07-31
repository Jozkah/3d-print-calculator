import { describe, it, expect } from "vitest"
import {
  UV_COLOR_KEYS,
  UV_INK_SEED,
  inkOemPerMl,
  inkRefillPerMl,
  itemRuns,
  itemPiecesPerRun,
  itemInkCost,
  itemMaterialCost,
  itemMachineCost,
  itemElectricityCost,
  operationOccurrences,
  operationUnitCost,
  computeUvQuote,
  resolveBackSides,
  type UvInkLike,
  type UvItem,
  type UvOperation,
  type UvQuoteInput,
} from "./uv-pricing"
import type { LaserMachineLike, LaserMaterialLike } from "./laser-pricing"

// The real kit: €174.99 for 380ml cleaner + 100ml of each of six colours.
// Cleaner is excluded from the denominator so its cost rides on printed ml.
const KIT_PRICE = 174.99
const kitInk = (over: Partial<UvInkLike> = {}): UvInkLike => ({
  color_key: "cyan",
  oem_price: KIT_PRICE / 6,
  oem_volume_ml: 100,
  refill_price: 25,
  refill_volume_ml: 200,
  ...over,
})

const inkMap = (inks: UvInkLike[]) => new Map(inks.map((i) => [i.color_key, i]))
const allKitInks = () => inkMap(UV_COLOR_KEYS.map((k) => kitInk({ color_key: k })))

const machine = (over: Partial<LaserMachineLike> = {}): LaserMachineLike => ({
  id: "uv1",
  name: "UV printer",
  machine_type: "uv-printer",
  printer_cost: 3000,
  additional_upfront_cost: 0,
  estimated_annual_maintenance: 200,
  estimated_life_years: 5,
  estimated_printer_uptime_percent: 0.5,
  average_power_consumption_watts: 300,
  ...over,
})

const blank: LaserMaterialLike = { id: "mat1", name: "Acrylic blank", pricing_unit: "piece", price: 2 }

const item = (over: Partial<UvItem> = {}): UvItem => ({
  id: "i1",
  name: "Coaster",
  quantity: 1,
  pieces_per_run: 1,
  machine_id: "uv1",
  minutes_per_run: 0,
  material_id: "mat1",
  usage: 1,
  ink: [],
  ...over,
})

const input = (over: Partial<UvQuoteInput> = {}): UvQuoteInput => ({
  items: [],
  operations: [],
  inksByKey: allKitInks(),
  materialsById: new Map([[blank.id, blank]]),
  machinesById: new Map([[machine().id, machine()]]),
  electricityCostPerKwh: 0.2,
  materialEfficiencyFactor: 1,
  laborHourlyRate: 12,
  packagingCost: 0,
  fuelCost: 0,
  setupFee: 0,
  marginPct: 50,
  qtyDiscountTiers: [],
  applyDiscountsAndMinimum: true,
  uvMinJobPrice: 0,
  emergencyFee: 0,
  vatRate: 0,
  ...over,
})

describe("ink pricing", () => {
  it("derives €/ml from the kit with cleaner folded in", () => {
    expect(inkOemPerMl(kitInk())).toBeCloseTo(KIT_PRICE / 600, 6)
  })

  it("falls back to the OEM price when no refill is recorded", () => {
    const ink = kitInk({ refill_price: null, refill_volume_ml: null })
    expect(inkRefillPerMl(ink)).toBeCloseTo(inkOemPerMl(ink), 6)
  })

  it("prices a refill from its own bottle price", () => {
    expect(inkRefillPerMl(kitInk())).toBeCloseTo(0.125, 6)
  })

  it("treats a zero volume as free rather than Infinity", () => {
    expect(inkOemPerMl(kitInk({ oem_volume_ml: 0 }))).toBe(0)
  })

  it("seeds six colours", () => {
    expect(UV_INK_SEED).toHaveLength(6)
    expect(UV_INK_SEED.map((i) => i.color_key)).toEqual([...UV_COLOR_KEYS])
  })
})

describe("runs", () => {
  it("rounds runs up and clamps pieces-per-run to at least one", () => {
    expect(itemRuns(item({ quantity: 50, pieces_per_run: 12 }))).toBe(5)
    expect(itemPiecesPerRun(item({ pieces_per_run: 0 }))).toBe(1)
    expect(itemRuns(item({ quantity: 0, pieces_per_run: 12 }))).toBe(0)
  })
})

describe("ink cost per item", () => {
  const nested = item({
    quantity: 50,
    pieces_per_run: 12,
    ink: [{ color_key: "white", ml_per_run: 12, use_refill: true }],
  })

  it("bills OEM ml pro-rata across pieces, not runs", () => {
    // 12ml per run / 12 pieces = 1ml per piece × 50 pieces × OEM €/ml
    expect(itemInkCost(nested, allKitInks(), "billed")).toBeCloseTo(50 * (KIT_PRICE / 600), 6)
  })

  it("costs the refill price when the refill box is ticked", () => {
    expect(itemInkCost(nested, allKitInks(), "actual")).toBeCloseTo(50 * 0.125, 6)
  })

  it("costs OEM when the box is unticked", () => {
    const oem = item({ ...nested, ink: [{ color_key: "white", ml_per_run: 12, use_refill: false }] })
    expect(itemInkCost(oem, allKitInks(), "actual")).toBeCloseTo(itemInkCost(oem, allKitInks(), "billed"), 6)
  })

  it("ignores ink rows with no matching catalogue entry", () => {
    const orphan = item({ quantity: 1, ink: [{ color_key: "neon", ml_per_run: 5, use_refill: false }] })
    expect(itemInkCost(orphan, allKitInks(), "billed")).toBe(0)
  })
})

describe("operations", () => {
  const items = [item({ id: "a", quantity: 50, pieces_per_run: 12 }), item({ id: "b", quantity: 3 })]

  const op = (over: Partial<UvOperation> = {}): UvOperation => ({
    id: "o1",
    name: "Step",
    kind: "labour",
    minutes: 30,
    amount: 0,
    scope: "quote",
    item_id: null,
    ...over,
  })

  it("charges labour minutes at the hourly rate", () => {
    expect(operationUnitCost(op(), 12)).toBeCloseTo(6, 6)
  })

  it("charges a fixed cost row at its amount", () => {
    expect(operationUnitCost(op({ kind: "cost", amount: 1.5 }), 12)).toBe(1.5)
  })

  it("counts a quote-scoped operation once", () => {
    expect(operationOccurrences(op(), items)).toBe(1)
  })

  it("counts per-run occurrences across every item when unattached", () => {
    expect(operationOccurrences(op({ scope: "run" }), items)).toBe(5 + 3)
  })

  it("counts per-piece occurrences for one attached item", () => {
    expect(operationOccurrences(op({ scope: "piece", item_id: "a" }), items)).toBe(50)
  })

  it("counts nothing for an operation attached to a deleted item", () => {
    expect(operationOccurrences(op({ scope: "piece", item_id: "gone" }), items)).toBe(0)
  })
})

describe("computeUvQuote", () => {
  it("keeps the client price identical whether or not refill ink is used", () => {
    const withRefill = item({ quantity: 10, ink: [{ color_key: "cyan", ml_per_run: 2, use_refill: true }] })
    const withOem = item({ ...withRefill, ink: [{ color_key: "cyan", ml_per_run: 2, use_refill: false }] })

    const a = computeUvQuote(input({ items: [withRefill] }))
    const b = computeUvQuote(input({ items: [withOem] }))

    expect(a.total).toBeCloseTo(b.total, 6)
    expect(a.items[0].lineSell).toBeCloseTo(b.items[0].lineSell, 6)
    expect(a.inkCostBilled).toBeCloseTo(b.inkCostBilled, 6)
    expect(a.inkCostActual).toBeLessThan(b.inkCostActual)
    expect(a.inkSaving).toBeCloseTo(a.inkCostBilled - a.inkCostActual, 6)
    expect(a.actualProfit).toBeGreaterThan(b.actualProfit)
  })

  it("bills 50 pieces of ink and 5 runs of per-run work for a 50/12 job", () => {
    const it50 = item({
      quantity: 50,
      pieces_per_run: 12,
      minutes_per_run: 24,
      usage: 0,
      material_id: "",
      ink: [{ color_key: "cyan", ml_per_run: 12, use_refill: false }],
    })
    const jigLoad: UvOperation = {
      id: "o1", name: "Jig load", kind: "labour", minutes: 6, amount: 0, scope: "run", item_id: null,
    }
    const b = computeUvQuote(input({ items: [it50], operations: [jigLoad], marginPct: 0 }))

    expect(b.inkCostBilled).toBeCloseTo(50 * (KIT_PRICE / 600), 6)
    // 6 min at €12/h = €1.20 per run × 5 runs
    expect(b.operationsCost).toBeCloseTo(6, 6)
    expect(b.operations[0].occurrences).toBe(5)
  })

  it("puts quote-scoped operations in overhead and item-scoped ones in the line", () => {
    const one = item({ id: "a", quantity: 2, usage: 0, material_id: "" })
    const filePrep: UvOperation = {
      id: "o1", name: "File prep", kind: "labour", minutes: 60, amount: 0, scope: "quote", item_id: null,
    }
    const wipe: UvOperation = {
      id: "o2", name: "Wipe", kind: "cost", minutes: 0, amount: 0.5, scope: "piece", item_id: "a",
    }
    const b = computeUvQuote(input({ items: [one], operations: [filePrep, wipe], marginPct: 0 }))

    expect(b.overheadCost).toBeCloseTo(12, 6)
    expect(b.items[0].directCost).toBeCloseTo(1, 6)
    expect(b.baseCost).toBeCloseTo(13, 6)
  })

  it("applies margin, quantity discount, minimum job price, emergency fee and VAT", () => {
    const one = item({ quantity: 10, usage: 1, material_id: "mat1" })
    const b = computeUvQuote(
      input({
        items: [one],
        marginPct: 50,
        qtyDiscountTiers: [{ min_qty: 10, discount_pct: 10 }],
        uvMinJobPrice: 100,
        emergencyFee: 10,
        vatRate: 0.23,
      }),
    )
    expect(b.items[0].discountPct).toBe(10)
    expect(b.minPriceApplied).toBe(true)
    expect(b.sellExVat).toBeCloseTo(100, 6)
    expect(b.totalExVat).toBeCloseTo(110, 6)
    expect(b.total).toBeCloseTo(110 * 1.23, 6)
  })

  it("skips discounts and the minimum in target-price mode", () => {
    const one = item({ quantity: 10, usage: 1, material_id: "mat1" })
    const b = computeUvQuote(
      input({
        items: [one],
        qtyDiscountTiers: [{ min_qty: 10, discount_pct: 10 }],
        uvMinJobPrice: 500,
        applyDiscountsAndMinimum: false,
      }),
    )
    expect(b.items[0].discountPct).toBe(0)
    expect(b.minPriceApplied).toBe(false)
  })

  it("prices a back side as a second pass over the same pieces, not new pieces", () => {
    const front = item({ id: "front", quantity: 30, usage: 1, material_id: "mat1", minutes_per_run: 10 })
    const back = item({
      id: "back",
      // Deliberately wrong on the row itself: quantity and material must come
      // from the front item, not from whatever is stored here.
      quantity: 1,
      material_id: "mat1",
      usage: 1,
      back_of_item_id: "front",
      minutes_per_run: 10,
    })
    const b = computeUvQuote(input({ items: [front, back] }))
    // 30 blanks at EUR 2, charged once for both sides.
    expect(b.materialCost).toBeCloseTo(60, 6)
    // Both passes bill machine time: same minutes, same qty on each row.
    const onlyFront = computeUvQuote(input({ items: [front] }))
    expect(b.machineCost).toBeCloseTo(onlyFront.machineCost * 2, 6)
  })

  it("gives a back side the front item's name, quantity and nesting", () => {
    const front = item({ id: "front", name: "Hangtags QR", quantity: 100, pieces_per_run: 20 })
    const back = item({ id: "back", name: "whatever the operator typed", quantity: 1, pieces_per_run: 3, back_of_item_id: "front" })
    const [, resolved] = resolveBackSides([front, back])
    expect(resolved.name).toBe("Hangtags QR")
    expect(resolved.quantity).toBe(100)
    expect(resolved.pieces_per_run).toBe(20)
    expect(resolved.material_id).toBe("")
  })

  it("drops a back-side link that points at nothing or at another back side", () => {
    const front = item({ id: "front", quantity: 5 })
    const orphan = item({ id: "orphan", quantity: 7, back_of_item_id: "gone" })
    const chained = item({ id: "chained", quantity: 7, back_of_item_id: "orphan" })
    const selfLink = item({ id: "self", quantity: 7, back_of_item_id: "self" })
    const resolved = resolveBackSides([front, orphan, chained, selfLink])
    expect(resolved[1].back_of_item_id).toBeNull()
    expect(resolved[2].back_of_item_id).toBeNull()
    expect(resolved[3].quantity).toBe(7)
    // Quantities of dropped links stay as entered rather than collapsing to 0.
    expect(resolved[1].quantity).toBe(7)
  })

  it("reports a real electricity figure that does not double-count machine cost", () => {
    const one = item({ quantity: 10, pieces_per_run: 2, minutes_per_run: 30, material_id: "" })
    const m = machine()
    const total = itemMachineCost(one, m, 0.2)
    const power = itemElectricityCost(one, m, 0.2)

    // 30 min over 2 pieces = 15 min/piece; 10 pieces = 150 min = 2.5 h.
    // 300 W at EUR 0.20/kWh = EUR 0.06/h, buffered by 1.3.
    expect(power).toBeCloseTo(2.5 * 0.06 * 1.3, 6)
    expect(power).toBeGreaterThan(0)

    const b = computeUvQuote(input({ items: [one] }))
    // The split is presentational: the two lines still add up to the machine cost.
    expect(b.machineCost + b.electricityCost).toBeCloseTo(total, 6)
    expect(b.electricityCost).toBeCloseTo(power, 6)
  })

  it("charges no electricity when the item has no machine", () => {
    const one = item({ quantity: 10, minutes_per_run: 30, machine_id: "missing", material_id: "" })
    const b = computeUvQuote(input({ items: [one] }))
    expect(b.electricityCost).toBe(0)
  })

  it("splits a sheet across the pieces nested on it", () => {
    const sheet = { id: "sheet", name: "A3 sheet", pricing_unit: "sheet" as const, price: 1.5 }
    // 100 pieces, 6 to a bed: 100/6 sheets, not 100.
    const nested = item({ quantity: 100, pieces_per_run: 6, material_id: "sheet" })
    expect(itemMaterialCost(nested, sheet, 1)).toBeCloseTo((100 / 6) * 1.5, 6)

    // Piece-priced stock stays one unit per piece.
    const blanks = item({ quantity: 100, pieces_per_run: 6, material_id: "mat1" })
    expect(itemMaterialCost(blanks, blank, 1)).toBeCloseTo(100 * 2, 6)
  })

  it("charges a per-run step for both sides of a two-sided item", () => {
    const front = item({ id: "front", quantity: 100, pieces_per_run: 20 })
    const back = item({ id: "back", back_of_item_id: "front" })
    const resolved = resolveBackSides([front, back])
    const jig = { id: "op", name: "Jig load", kind: "labour" as const, minutes: 5, amount: 0, scope: "run" as const, item_id: "front" }

    // 5 beds per side, loaded and flipped: 10 jig loads.
    expect(operationOccurrences(jig, resolved)).toBe(10)

    // A per-piece step is not doubled — 100 pieces stay 100 pieces.
    expect(operationOccurrences({ ...jig, scope: "piece" }, resolved)).toBe(100)

    // Attaching to the back row alone bills that side only.
    expect(operationOccurrences({ ...jig, item_id: "back" }, resolved)).toBe(5)
  })

  it("returns zeros, not NaN, for an empty or broken quote", () => {
    const broken = item({ quantity: 0, material_id: "missing", machine_id: "missing", minutes_per_run: 10 })
    const b = computeUvQuote(input({ items: [broken] }))
    expect(b.baseCost).toBe(0)
    expect(b.total).toBe(0)
    expect(Number.isNaN(b.total)).toBe(false)
  })
})
