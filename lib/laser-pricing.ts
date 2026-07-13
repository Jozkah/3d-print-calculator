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
