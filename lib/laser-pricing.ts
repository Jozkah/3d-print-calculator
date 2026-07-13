// Pure pricing math for the Laser & Stickers calculator. No React, no storage —
// everything here is unit-tested in lib/laser-pricing.test.ts.

export type LaserPricingUnit = "sheet" | "area" | "length" | "piece"

export interface QtyDiscountTier {
  min_qty: number
  discount_pct: number
}

/** Seed defaults for the pricing levers stored on global_settings. */
export const LASER_DEFAULTS = {
  laser_min_job_price: 15,
  sticker_min_job_price: 10,
  default_setup_fee: 5,
  qty_discount_tiers: [
    { min_qty: 10, discount_pct: 5 },
    { min_qty: 50, discount_pct: 10 },
  ] as QtyDiscountTier[],
}

/** Same buffer the 3D calculator applies to machine capital + electricity. */
export const COST_BUFFER_FACTOR = 1.3

export interface LaserMaterialLike {
  id: string
  name: string
  pricing_unit: LaserPricingUnit
  price: number
  sheet_width_cm?: number | null
  sheet_height_cm?: number | null
}

/** Subset of the printers row the pricing math needs. */
export interface LaserMachineLike {
  id: string
  name: string
  machine_type?: string
  printer_cost: number
  additional_upfront_cost: number
  estimated_annual_maintenance: number
  estimated_life_years: number
  estimated_printer_uptime_percent: number
  average_power_consumption_watts: number
}

export interface LaserItem {
  id: string
  name: string
  quantity: number
  material_id: string
  /** Per single piece, in the material's native unit (sheets, cm², cm, pieces). */
  usage: number
  usage_width_cm?: number | null
  usage_height_cm?: number | null
  machine_id: string
  /** Minutes of machine time per single piece. */
  machine_minutes: number
}

/** Finite and ≥ 0, else 0 — every external number passes through this. */
const pos = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export const itemQty = (item: LaserItem): number => Math.floor(pos(item.quantity))

export function pricingUnitLabel(unit: LaserPricingUnit, symbol = "€"): string {
  return { sheet: `${symbol}/sheet`, area: `${symbol}/cm²`, length: `${symbol}/cm`, piece: `${symbol}/piece` }[unit]
}

export function usageUnitLabel(unit: LaserPricingUnit): string {
  return { sheet: "sheets", area: "cm²", length: "cm", piece: "pieces" }[unit]
}

/**
 * Machine cost per hour: capital amortized over lifetime uptime plus
 * electricity, both buffered — the exact formula the 3D calculator uses for
 * printers (guarding zero uptime/lifetime to 0 capital).
 */
export function machineCostPerHour(machine: LaserMachineLike, electricityCostPerKwh: number): number {
  const totalInvestment = pos(machine.printer_cost) + pos(machine.additional_upfront_cost)
  const lifetimeCost = totalInvestment + pos(machine.estimated_annual_maintenance) * pos(machine.estimated_life_years)
  const uptimeHoursPerYear = 8760 * pos(machine.estimated_printer_uptime_percent)
  const denominator = uptimeHoursPerYear * pos(machine.estimated_life_years)
  const capitalPerHour = denominator > 0 ? lifetimeCost / denominator : 0
  const electricityPerHour = (pos(machine.average_power_consumption_watts) / 1000) * pos(electricityCostPerKwh)
  return (capitalPerHour + electricityPerHour) * COST_BUFFER_FACTOR
}

/** Material cost for all pieces of one item: usage × unit price × qty × waste factor. */
export function itemMaterialCost(
  item: LaserItem,
  material: LaserMaterialLike | undefined,
  materialEfficiencyFactor: number,
): number {
  if (!material) return 0
  const efficiency = pos(materialEfficiencyFactor) || 1
  return pos(item.usage) * pos(material.price) * itemQty(item) * efficiency
}

/** Machine cost for all pieces of one item: (minutes/60) × €/hr × qty. */
export function itemMachineCost(
  item: LaserItem,
  machine: LaserMachineLike | undefined,
  electricityCostPerKwh: number,
): number {
  if (!machine) return 0
  return (pos(item.machine_minutes) / 60) * machineCostPerHour(machine, electricityCostPerKwh) * itemQty(item)
}

/** Highest discount among tiers whose min_qty the quantity reaches. */
export function discountPctForQty(qty: number, tiers: QtyDiscountTier[]): number {
  let discount = 0
  for (const tier of tiers ?? []) {
    if (qty >= pos(tier.min_qty) && pos(tier.discount_pct) > discount) discount = pos(tier.discount_pct)
  }
  return Math.min(95, discount)
}

/**
 * Minimum job price for a quote: sticker-printer-only quotes use the sticker
 * minimum, anything touching a laser uses the laser minimum, and a mixed quote
 * takes the higher of the two.
 */
export function resolveMinJobPrice(
  items: LaserItem[],
  machinesById: ReadonlyMap<string, LaserMachineLike>,
  laserMinJobPrice: number,
  stickerMinJobPrice: number,
): number {
  let hasSticker = false
  let hasLaser = false
  for (const it of items) {
    const machine = machinesById.get(it.machine_id)
    if (!machine) continue
    if (machine.machine_type === "sticker-printer") hasSticker = true
    else hasLaser = true
  }
  if (hasSticker && hasLaser) return Math.max(pos(laserMinJobPrice), pos(stickerMinJobPrice))
  if (hasSticker) return pos(stickerMinJobPrice)
  return pos(laserMinJobPrice)
}

export interface LaserQuoteInput {
  items: LaserItem[]
  materialsById: ReadonlyMap<string, LaserMaterialLike>
  machinesById: ReadonlyMap<string, LaserMachineLike>
  electricityCostPerKwh: number
  materialEfficiencyFactor: number
  laborCost: number
  packagingCost: number
  fuelCost: number
  setupFee: number
  marginPct: number
  qtyDiscountTiers: QtyDiscountTier[]
  /** false in target-price mode — the operator sets the exact total. */
  applyDiscountsAndMinimum: boolean
  laserMinJobPrice: number
  stickerMinJobPrice: number
  emergencyFee: number
  /** 0 when VAT is not charged. */
  vatRate: number
}

export interface LaserItemBreakdown {
  id: string
  directCost: number
  costPerPiece: number
  discountPct: number
  sellPerPiece: number
  lineSell: number
}

export interface LaserQuoteBreakdown {
  materialCost: number
  machineCost: number
  /** labor + packaging + fuel — allocated into item lines by direct-cost share. */
  overheadCost: number
  setupFee: number
  /** Setup fee with margin applied — rendered as its own document line. */
  setupFeeSell: number
  baseCost: number
  marginPct: number
  sellBeforeMinimum: number
  discountAmount: number
  minJobPrice: number
  minPriceApplied: boolean
  minPriceAdjustment: number
  sellExVat: number
  totalExVat: number
  vatAmount: number
  total: number
  items: LaserItemBreakdown[]
}

export function computeLaserQuote(input: LaserQuoteInput): LaserQuoteBreakdown {
  const marginPct = Math.min(95, pos(input.marginPct))
  const multiplier = 1 / (1 - marginPct / 100)

  const directs = input.items.map((it) => ({
    it,
    material: itemMaterialCost(it, input.materialsById.get(it.material_id), input.materialEfficiencyFactor),
    machine: itemMachineCost(it, input.machinesById.get(it.machine_id), input.electricityCostPerKwh),
  }))
  const materialCost = directs.reduce((s, d) => s + d.material, 0)
  const machineCost = directs.reduce((s, d) => s + d.machine, 0)
  const directTotal = materialCost + machineCost
  const overheadCost = pos(input.laborCost) + pos(input.packagingCost) + pos(input.fuelCost)
  const setupFee = pos(input.setupFee)
  const baseCost = directTotal + overheadCost + setupFee
  const setupFeeSell = setupFee * multiplier

  const items: LaserItemBreakdown[] = directs.map(({ it, material, machine }) => {
    const direct = material + machine
    const share = directTotal > 0 ? direct / directTotal : input.items.length > 0 ? 1 / input.items.length : 0
    const allocated = direct + overheadCost * share
    const qty = itemQty(it)
    const discountPct = input.applyDiscountsAndMinimum ? discountPctForQty(qty, input.qtyDiscountTiers) : 0
    const lineSell = allocated * multiplier * (1 - discountPct / 100)
    return {
      id: it.id,
      directCost: direct,
      costPerPiece: qty > 0 ? allocated / qty : 0,
      discountPct,
      sellPerPiece: qty > 0 ? lineSell / qty : 0,
      lineSell,
    }
  })

  const itemsSell = items.reduce((s, i) => s + i.lineSell, 0)
  // With no items there are no lines to carry the overhead — sell it directly.
  const overheadSell = input.items.length === 0 ? overheadCost * multiplier : 0
  const sellBeforeMinimum = itemsSell + overheadSell + setupFeeSell
  const discountAmount = items.reduce(
    (s, i) => s + (i.discountPct > 0 ? i.lineSell / (1 - i.discountPct / 100) - i.lineSell : 0),
    0,
  )

  const minJobPrice = input.applyDiscountsAndMinimum
    ? resolveMinJobPrice(input.items, input.machinesById, input.laserMinJobPrice, input.stickerMinJobPrice)
    : 0
  const minPriceApplied = baseCost > 0 && sellBeforeMinimum < minJobPrice
  const sellExVat = minPriceApplied ? minJobPrice : sellBeforeMinimum
  const minPriceAdjustment = minPriceApplied ? minJobPrice - sellBeforeMinimum : 0

  const totalExVat = sellExVat + pos(input.emergencyFee)
  const vatAmount = totalExVat * pos(input.vatRate)
  return {
    materialCost,
    machineCost,
    overheadCost,
    setupFee,
    setupFeeSell,
    baseCost,
    marginPct,
    sellBeforeMinimum,
    discountAmount,
    minJobPrice,
    minPriceApplied,
    minPriceAdjustment,
    sellExVat,
    totalExVat,
    vatAmount,
    total: totalExVat + vatAmount,
    items,
  }
}
