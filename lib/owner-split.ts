// Shared 50/50 owner-split rule used by the 3D, laser, and UV calculators when
// a quote is in Dual mode. Role assignment: Owner A = electricity + labour +
// fuel + setup (whatever the caller folds into ownerALabour); Owner B =
// materials/ink + packaging + machine capital + VAT. Profit and emergency are
// split by the configured ratios. Pure and DOM-free so it is unit-tested.

import { PROFIT_SPLIT_RATIO, EMERGENCY_SPLIT_RATIO } from "@/lib/business-config"

export interface OwnerSplitBuckets {
  /** Machine capital attributed to Owner A's machines (by machine owner). */
  ownerAMachine: number
  /** Machine capital attributed to Owner B's machines (default when owner unset). */
  ownerBMachine: number
  /** All electricity → Owner A. */
  electricity: number
  /** Owner A's cost pot: labour + fuel (+ drying for 3D, + setup for laser/UV). */
  ownerALabour: number
  /** Owner B's cost pot: materials/filament + ink + packaging. */
  ownerBMaterials: number
  /** Markup (sell ex-VAT minus base cost). Split by profitRatio. */
  profit: number
  /** Emergency fee. Split by emergencyRatio. */
  emergency: number
  /** VAT charged → Owner B. */
  vat: number
}

export function computeOwnerSplit(
  b: OwnerSplitBuckets,
  profitRatio: number = PROFIT_SPLIT_RATIO,
  emergencyRatio: number = EMERGENCY_SPLIT_RATIO,
): { ownerAReceives: number; ownerBReceives: number } {
  const ownerAReceives =
    b.ownerAMachine + b.electricity + b.ownerALabour +
    b.profit * profitRatio + b.emergency * emergencyRatio
  const ownerBReceives =
    b.ownerBMachine + b.ownerBMaterials +
    b.profit * (1 - profitRatio) + b.emergency * (1 - emergencyRatio) + b.vat
  return { ownerAReceives, ownerBReceives }
}
