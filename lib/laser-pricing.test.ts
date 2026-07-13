import { describe, it, expect } from "vitest"
import {
  machineCostPerHour,
  itemMaterialCost,
  itemMachineCost,
  discountPctForQty,
  resolveMinJobPrice,
  computeLaserQuote,
  LASER_DEFAULTS,
  type LaserMachineLike,
  type LaserItem,
  type LaserMaterialLike,
  type LaserQuoteInput,
} from "./laser-pricing"

const machine = (over: Partial<LaserMachineLike> = {}): LaserMachineLike => ({
  id: "m1",
  name: "Laser",
  machine_type: "laser",
  printer_cost: 2000,
  additional_upfront_cost: 0,
  estimated_annual_maintenance: 100,
  estimated_life_years: 5,
  estimated_printer_uptime_percent: 0.5,
  average_power_consumption_watts: 400,
  ...over,
})

const item = (over: Partial<LaserItem> = {}): LaserItem => ({
  id: "i1",
  name: "Keychain",
  quantity: 1,
  material_id: "mat1",
  usage: 1,
  machine_id: "m1",
  machine_minutes: 0,
  ...over,
})

const sheetMaterial: LaserMaterialLike = { id: "mat1", name: "Plywood 3mm", pricing_unit: "sheet", price: 8 }

describe("machineCostPerHour", () => {
  it("amortizes capital cost and adds electricity, with 1.3 buffer", () => {
    // lifetime = 2000 + 100*5 = 2500; uptime hrs/yr = 8760*0.5 = 4380
    // capital/hr = 2500 / (4380*5) = 0.11415…; electricity = 0.4kW*0.2 = 0.08
    // (0.11415… + 0.08) * 1.3 = 0.25240…
    expect(machineCostPerHour(machine(), 0.2)).toBeCloseTo(0.2524, 3)
  })

  it("guards a zero-lifetime/uptime machine to electricity-only cost", () => {
    const m = machine({ estimated_life_years: 0 })
    // capital denominator 0 → capital 0; 0.4kW*0.2*1.3 = 0.104
    expect(machineCostPerHour(m, 0.2)).toBeCloseTo(0.104, 5)
  })
})

describe("itemMaterialCost", () => {
  it("multiplies usage × price × qty × efficiency", () => {
    expect(itemMaterialCost(item({ usage: 0.25, quantity: 10 }), sheetMaterial, 1.1)).toBeCloseTo(22, 5)
  })
  it("is unit-agnostic — area material priced per cm²", () => {
    const vinyl: LaserMaterialLike = { id: "v", name: "Vinyl", pricing_unit: "area", price: 0.02 }
    expect(itemMaterialCost(item({ usage: 96, quantity: 50 }), vinyl, 1.1)).toBeCloseTo(105.6, 5)
  })
  it("returns 0 for missing material, zero qty, or negative usage", () => {
    expect(itemMaterialCost(item(), undefined, 1.1)).toBe(0)
    expect(itemMaterialCost(item({ quantity: 0 }), sheetMaterial, 1.1)).toBe(0)
    expect(itemMaterialCost(item({ usage: -3 }), sheetMaterial, 1.1)).toBe(0)
  })
})

describe("itemMachineCost", () => {
  it("charges minutes/60 × cost-per-hour × qty", () => {
    // machine below: capital 0, electricity 1kW × €1 = 1 → ×1.3 = 1.3/hr
    const m = machine({ printer_cost: 0, estimated_annual_maintenance: 0, average_power_consumption_watts: 1000, estimated_printer_uptime_percent: 1, estimated_life_years: 1 })
    expect(itemMachineCost(item({ machine_minutes: 6, quantity: 10 }), m, 1)).toBeCloseTo(1.3, 5)
  })
  it("returns 0 for a missing machine", () => {
    expect(itemMachineCost(item({ machine_minutes: 60 }), undefined, 1)).toBe(0)
  })
})

describe("discountPctForQty", () => {
  it("applies the highest qualifying tier, with boundaries inclusive", () => {
    const tiers = LASER_DEFAULTS.qty_discount_tiers
    expect(discountPctForQty(9, tiers)).toBe(0)
    expect(discountPctForQty(10, tiers)).toBe(5)
    expect(discountPctForQty(49, tiers)).toBe(5)
    expect(discountPctForQty(50, tiers)).toBe(10)
  })
  it("handles unsorted tiers and empty lists", () => {
    expect(discountPctForQty(100, [{ min_qty: 50, discount_pct: 10 }, { min_qty: 10, discount_pct: 5 }])).toBe(10)
    expect(discountPctForQty(100, [])).toBe(0)
  })
})

describe("resolveMinJobPrice", () => {
  const machines = new Map([
    ["laser1", machine({ id: "laser1", machine_type: "laser" })],
    ["stick1", machine({ id: "stick1", machine_type: "sticker-printer" })],
  ])
  it("uses the laser minimum for laser-only quotes", () => {
    expect(resolveMinJobPrice([item({ machine_id: "laser1" })], machines, 15, 10)).toBe(15)
  })
  it("uses the sticker minimum for sticker-only quotes", () => {
    expect(resolveMinJobPrice([item({ machine_id: "stick1" })], machines, 15, 10)).toBe(10)
  })
  it("uses the higher minimum when both machine kinds appear", () => {
    expect(resolveMinJobPrice([item({ machine_id: "laser1" }), item({ machine_id: "stick1" })], machines, 15, 10)).toBe(15)
  })
})

/** Machine with capital 0 and exactly €1.3/hr electricity-buffered cost. */
const simpleMachine = machine({
  id: "laser1",
  machine_type: "laser",
  printer_cost: 0,
  estimated_annual_maintenance: 0,
  average_power_consumption_watts: 1000,
  estimated_printer_uptime_percent: 1,
  estimated_life_years: 1,
})

const pieceMaterial: LaserMaterialLike = { id: "mat1", name: "Blank", pricing_unit: "piece", price: 1 }

const baseInput = (over: Partial<LaserQuoteInput> = {}): LaserQuoteInput => ({
  items: [item({ machine_id: "laser1", machine_minutes: 6, usage: 1, quantity: 1 })],
  materialsById: new Map([["mat1", pieceMaterial]]),
  machinesById: new Map([["laser1", simpleMachine]]),
  electricityCostPerKwh: 1,
  materialEfficiencyFactor: 1,
  laborCost: 0,
  packagingCost: 0,
  fuelCost: 0,
  setupFee: 0,
  marginPct: 50,
  qtyDiscountTiers: LASER_DEFAULTS.qty_discount_tiers,
  applyDiscountsAndMinimum: true,
  laserMinJobPrice: 15,
  stickerMinJobPrice: 10,
  emergencyFee: 0,
  vatRate: 0,
  ...over,
})

describe("computeLaserQuote", () => {
  it("bumps a small job to the minimum job price and reports the adjustment", () => {
    // direct = material 1 + machine 0.13 = 1.13; ×2 (50% margin) = 2.26 < 15
    const b = computeLaserQuote(baseInput())
    expect(b.baseCost).toBeCloseTo(1.13, 5)
    expect(b.sellBeforeMinimum).toBeCloseTo(2.26, 5)
    expect(b.minPriceApplied).toBe(true)
    expect(b.minPriceAdjustment).toBeCloseTo(12.74, 5)
    expect(b.total).toBeCloseTo(15, 5)
  })

  it("does not bump above-minimum jobs and applies VAT + emergency on top", () => {
    const b = computeLaserQuote(baseInput({
      items: [item({ machine_id: "laser1", machine_minutes: 60, usage: 10, quantity: 2 })],
      emergencyFee: 10,
      vatRate: 0.23,
    }))
    // material 10*1*2=20, machine 1.3*2=2.6 → base 22.6 → sell 45.2 (no discount, qty 2)
    expect(b.minPriceApplied).toBe(false)
    expect(b.totalExVat).toBeCloseTo(55.2, 5)
    expect(b.total).toBeCloseTo(55.2 * 1.23, 4)
  })

  it("applies the qty discount per item and reports per-piece figures", () => {
    const b = computeLaserQuote(baseInput({
      items: [item({ machine_id: "laser1", machine_minutes: 0, usage: 1, quantity: 10 })],
    }))
    // material 10 → sell full 20, 5% tier → line 19; per piece 1.9
    expect(b.items[0].discountPct).toBe(5)
    expect(b.items[0].lineSell).toBeCloseTo(19, 5)
    expect(b.items[0].sellPerPiece).toBeCloseTo(1.9, 5)
    expect(b.discountAmount).toBeCloseTo(1, 5)
    expect(b.sellExVat).toBeCloseTo(19, 5)
  })

  it("sells the setup fee with margin as its own line (not allocated to items)", () => {
    const b = computeLaserQuote(baseInput({ setupFee: 5 }))
    expect(b.setupFeeSell).toBeCloseTo(10, 5)
    expect(b.baseCost).toBeCloseTo(6.13, 5)
    // items keep their own sell: 2.26 + setup 10 = 12.26 < 15 → still bumped
    expect(b.sellBeforeMinimum).toBeCloseTo(12.26, 5)
    expect(b.minPriceApplied).toBe(true)
  })

  it("allocates labor/packaging/fuel overhead across items by direct-cost share", () => {
    const b = computeLaserQuote(baseInput({
      laborCost: 10,
      items: [
        item({ id: "a", machine_id: "laser1", machine_minutes: 0, usage: 3, quantity: 1 }),
        item({ id: "b", machine_id: "laser1", machine_minutes: 0, usage: 1, quantity: 1 }),
      ],
    }))
    // direct a=3, b=1 → overhead splits 7.5/2.5 → allocated 10.5/3.5 → sell 21/7
    expect(b.items[0].lineSell).toBeCloseTo(21, 5)
    expect(b.items[1].lineSell).toBeCloseTo(7, 5)
  })

  it("skips discounts and minimum in target-price mode", () => {
    const b = computeLaserQuote(baseInput({
      applyDiscountsAndMinimum: false,
      items: [item({ machine_id: "laser1", machine_minutes: 0, usage: 1, quantity: 50 })],
    }))
    expect(b.items[0].discountPct).toBe(0)
    expect(b.minPriceApplied).toBe(false)
  })

  it("sells pure-overhead quotes (no items) directly", () => {
    const b = computeLaserQuote(baseInput({ items: [], laborCost: 20 }))
    expect(b.sellBeforeMinimum).toBeCloseTo(40, 5)
    expect(b.minPriceApplied).toBe(false) // 40 > 15
  })
})
