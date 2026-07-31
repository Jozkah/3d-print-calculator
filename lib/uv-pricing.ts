// Pure pricing math for the UV printing calculator. No React, no storage —
// everything here is unit-tested in lib/uv-pricing.test.ts.
//
// The one rule that shapes this whole module: the client is always billed as
// if OEM ink was used. Loading cheaper refill ink changes what the job costs
// us, never what it sells for — so every total is computed twice, once with
// each ink price, and the difference is the operator's margin.

import {
  COST_BUFFER_FACTOR,
  discountPctForQty,
  machineCostPerHour,
  type LaserMachineLike,
  type LaserMaterialLike,
  type QtyDiscountTier,
} from "./laser-pricing"

export const UV_COLOR_KEYS = ["cyan", "magenta", "yellow", "black", "white", "gloss"] as const
export type UvColorKey = (typeof UV_COLOR_KEYS)[number]

/** Seed defaults for the pricing levers stored on global_settings. */
export const UV_DEFAULTS = {
  uv_min_job_price: 15,
}

/**
 * Rows written the first time the uv_inks table is read. Prices start at 0 —
 * the settings page's "Fill from kit" helper is how they get filled in, which
 * is safer than guessing a kit price on the operator's behalf.
 */
export const UV_INK_SEED: { color_key: UvColorKey; name: string; hex: string; sort_order: number }[] = [
  { color_key: "cyan", name: "Cyan", hex: "#00AEEF", sort_order: 1 },
  { color_key: "magenta", name: "Magenta", hex: "#EC008C", sort_order: 2 },
  { color_key: "yellow", name: "Yellow", hex: "#FFF200", sort_order: 3 },
  { color_key: "black", name: "Black", hex: "#231F20", sort_order: 4 },
  { color_key: "white", name: "White", hex: "#FFFFFF", sort_order: 5 },
  { color_key: "gloss", name: "Gloss / varnish", hex: "#C9D4DD", sort_order: 6 },
]

/** Finite and > 0, else 0 — every external number passes through this. */
const pos = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export interface UvInkLike {
  color_key: string
  oem_price: number
  oem_volume_ml: number
  refill_price?: number | null
  refill_volume_ml?: number | null
}

/** €/ml at the OEM price. A zero volume prices the ink at 0 rather than Infinity. */
export function inkOemPerMl(ink: UvInkLike | undefined): number {
  if (!ink) return 0
  const volume = pos(ink.oem_volume_ml)
  return volume > 0 ? pos(ink.oem_price) / volume : 0
}

/** €/ml at the third-party refill price; falls back to OEM when no refill is recorded. */
export function inkRefillPerMl(ink: UvInkLike | undefined): number {
  if (!ink) return 0
  const volume = pos(ink.refill_volume_ml)
  return volume > 0 ? pos(ink.refill_price) / volume : inkOemPerMl(ink)
}

export interface UvInkUsage {
  color_key: string
  /** ml this colour uses for ONE run, straight from the RIP report. */
  ml_per_run: number
  /** Cheaper third-party ink was loaded. Affects cost only, never the billed price. */
  use_refill: boolean
}

export interface UvItem {
  id: string
  name: string
  /** Pieces the client wants. */
  quantity: number
  /** How many copies are nested on one bed. */
  pieces_per_run: number
  machine_id: string
  /** Minutes for ONE run, straight from the RIP report. */
  minutes_per_run: number
  /** Empty string = none / customer-supplied. */
  material_id: string
  /** Material used per PIECE, in the material's native unit. */
  usage: number
  usage_width_cm?: number | null
  usage_height_cm?: number | null
  ink: UvInkUsage[]
  /**
   * Id of the item this one is the reverse side of. A back side is a second
   * pass over the SAME physical pieces: it prints its own ink and machine
   * minutes (with its own nesting), but it neither adds pieces to the job nor
   * consumes a second substrate. null = a normal, standalone item.
   */
  back_of_item_id?: string | null
}

export type UvOperationScope = "quote" | "run" | "piece"

export interface UvOperation {
  id: string
  name: string
  kind: "labour" | "cost"
  /** kind "labour" — charged at the shop's hourly rate. */
  minutes: number
  /** kind "cost" — fixed € per occurrence. */
  amount: number
  scope: UvOperationScope
  /** null = applies to every item in the quote. */
  item_id: string | null
}

export const itemQty = (item: UvItem): number => Math.floor(pos(item.quantity))

/**
 * Resolve reverse-side items against the list they belong to.
 *
 * A back side has no quantity or material of its own: it inherits the front
 * item's piece count and rides on the substrate that item already paid for.
 * Normalising here (rather than special-casing every cost function) keeps the
 * per-item maths a plain function of a single item — the same numbers the card
 * shows, and the same numbers a saved quote replays.
 *
 * A link to a missing or itself-linked item is dropped, so a hand-edited backup
 * cannot produce a cycle or an item that inherits from nothing.
 */
export function resolveBackSides(items: readonly UvItem[]): UvItem[] {
  const byId = new Map(items.map((it) => [it.id, it]))
  return items.map((it) => {
    const parentId = it.back_of_item_id
    if (!parentId || parentId === it.id) return it
    const parent = byId.get(parentId)
    if (!parent || parent.back_of_item_id) return { ...it, back_of_item_id: null }
    // Both sides of the same batch go through the printer in the same nesting,
    // so pieces-per-run is inherited too — the two rows always agree on how
    // many runs the job takes.
    // The name follows the front item too: both rows describe the same product,
    // and every surface that prints a back side appends its own "(back side)"
    // marker rather than relying on the operator to type one.
    return {
      ...it,
      name: parent.name,
      quantity: parent.quantity,
      pieces_per_run: parent.pieces_per_run,
      material_id: "",
      usage: 0,
    }
  })
}

/** True when this item is a reverse-side pass over another item's pieces. */
export const isBackSide = (item: UvItem): boolean => Boolean(item.back_of_item_id)

export const itemPiecesPerRun = (item: UvItem): number => Math.max(1, Math.floor(pos(item.pieces_per_run) || 1))

/** Runs needed for the whole item — rounded up, so a 2-piece tail is still a run. */
export const itemRuns = (item: UvItem): number => {
  const qty = itemQty(item)
  return qty > 0 ? Math.ceil(qty / itemPiecesPerRun(item)) : 0
}

/**
 * Ink cost for all pieces of one item. Per-run ml is divided by pieces-per-run
 * and multiplied by the real quantity, so a partial last run is only charged
 * for the pieces it actually prints. "billed" always uses the OEM price;
 * "actual" uses whichever ink each colour was loaded with.
 */
export function itemInkCost(
  item: UvItem,
  inksByKey: ReadonlyMap<string, UvInkLike>,
  mode: "billed" | "actual",
): number {
  const perPieceFactor = itemQty(item) / itemPiecesPerRun(item)
  if (perPieceFactor <= 0) return 0
  return (item.ink ?? []).reduce((sum, usage) => {
    const ink = inksByKey.get(usage.color_key)
    if (!ink) return sum
    const perMl = mode === "actual" && usage.use_refill ? inkRefillPerMl(ink) : inkOemPerMl(ink)
    return sum + pos(usage.ml_per_run) * perPieceFactor * perMl
  }, 0)
}

/** Machine cost for all pieces of one item: per-run minutes pro-rated per piece. */
export function itemMachineCost(
  item: UvItem,
  machine: LaserMachineLike | undefined,
  electricityCostPerKwh: number,
): number {
  if (!machine) return 0
  const perPieceMinutes = pos(item.minutes_per_run) / itemPiecesPerRun(item)
  return (perPieceMinutes / 60) * machineCostPerHour(machine, electricityCostPerKwh) * itemQty(item)
}

/**
 * The electricity slice of an item's machine cost — the part of
 * itemMachineCost that comes from the printer's power draw rather than from
 * depreciation. Reported separately so a quote can show a real kWh figure
 * instead of a permanent zero; the two never double-count, because the machine
 * line subtracts what this returns.
 */
export function itemElectricityCost(
  item: UvItem,
  machine: LaserMachineLike | undefined,
  electricityCostPerKwh: number,
): number {
  if (!machine) return 0
  const perPieceMinutes = pos(item.minutes_per_run) / itemPiecesPerRun(item)
  const perHour = (pos(machine.average_power_consumption_watts) / 1000) * pos(electricityCostPerKwh)
  // Same buffer the machine rate applies, so machine + electricity still add up
  // to exactly itemMachineCost.
  return (perPieceMinutes / 60) * perHour * COST_BUFFER_FACTOR * itemQty(item)
}

/**
 * How many units of substrate ONE piece consumes.
 *
 * Derived rather than typed: a sheet feeds a whole bed, so each piece uses
 * 1/pieces-per-run of it, while piece-priced stock (blanks, envelopes) is one
 * unit per piece by definition. Area- and length-priced stock has no piece
 * geometry to work from and is charged as a single unit per piece.
 */
export function itemMaterialUsage(item: UvItem, material: LaserMaterialLike | undefined): number {
  if (!material) return 0
  return material.pricing_unit === "sheet" ? 1 / itemPiecesPerRun(item) : 1
}

/** Material cost for all pieces of one item: usage × unit price × qty × waste factor. */
export function itemMaterialCost(
  item: UvItem,
  material: LaserMaterialLike | undefined,
  materialEfficiencyFactor: number,
): number {
  if (!material) return 0
  const efficiency = pos(materialEfficiencyFactor) || 1
  return itemMaterialUsage(item, material) * pos(material.price) * itemQty(item) * efficiency
}

/** What one occurrence of an operation costs. */
export function operationUnitCost(op: UvOperation, laborHourlyRate: number): number {
  return op.kind === "cost" ? pos(op.amount) : (pos(op.minutes) / 60) * pos(laborHourlyRate)
}

/**
 * How many times an operation happens. Quote scope is once; run and piece scope
 * count over the attached item, or over every item when unattached. An operation
 * pointing at a deleted item happens zero times.
 *
 * A step attached to a two-sided item covers BOTH passes when it is per-run:
 * the bed is loaded, printed, and loaded again with the pieces flipped, so a
 * jig load really does happen twice. Per-piece steps are not doubled — a piece
 * is still one piece however many sides it has. To bill a step against one side
 * only, attach it to that row directly ("… (back side)" in the picker).
 */
export function operationOccurrences(op: UvOperation, items: UvItem[]): number {
  if (op.scope === "quote") return 1
  const targets = op.item_id
    ? items.filter(
        (it) => it.id === op.item_id || (op.scope === "run" && it.back_of_item_id === op.item_id),
      )
    : items
  return targets.reduce((sum, it) => sum + (op.scope === "run" ? itemRuns(it) : itemQty(it)), 0)
}

export interface UvQuoteInput {
  items: UvItem[]
  operations: UvOperation[]
  inksByKey: ReadonlyMap<string, UvInkLike>
  materialsById: ReadonlyMap<string, LaserMaterialLike>
  machinesById: ReadonlyMap<string, LaserMachineLike>
  electricityCostPerKwh: number
  materialEfficiencyFactor: number
  laborHourlyRate: number
  packagingCost: number
  fuelCost: number
  setupFee: number
  marginPct: number
  qtyDiscountTiers: QtyDiscountTier[]
  /** false in target-price mode — the operator sets the exact total. */
  applyDiscountsAndMinimum: boolean
  uvMinJobPrice: number
  emergencyFee: number
  /** 0 when VAT is not charged. */
  vatRate: number
}

export interface UvItemBreakdown {
  id: string
  runs: number
  inkBilled: number
  inkActual: number
  materialCost: number
  /** Depreciation share only — the power draw is reported as electricityCost. */
  machineCost: number
  electricityCost: number
  operationsCost: number
  /** Billed direct cost — material + machine + OEM ink + attached operations. */
  directCost: number
  costPerPiece: number
  discountPct: number
  sellPerPiece: number
  lineSell: number
}

export interface UvOperationBreakdown {
  id: string
  occurrences: number
  unitCost: number
  total: number
}

export interface UvQuoteBreakdown {
  materialCost: number
  /** Depreciation share only; add electricityCost for the full machine cost. */
  machineCost: number
  /** What the printers actually draw from the wall, buffered like the rest. */
  electricityCost: number
  inkCostBilled: number
  inkCostActual: number
  /** Billed − actual: the extra margin refill ink earns. Internal only. */
  inkSaving: number
  operationsCost: number
  /** Quote-scoped operations + packaging + fuel — allocated into lines by cost share. */
  overheadCost: number
  setupFee: number
  /** Setup fee with margin applied — rendered as its own document line. */
  setupFeeSell: number
  baseCost: number
  /** Base cost with the ink actually loaded. Internal only. */
  actualBaseCost: number
  /** sellExVat − actualBaseCost. Internal only. */
  actualProfit: number
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
  items: UvItemBreakdown[]
  operations: UvOperationBreakdown[]
}

export function computeUvQuote(rawInput: UvQuoteInput): UvQuoteBreakdown {
  // Back sides inherit quantity from their front item and carry no material,
  // so every downstream calculation (including operation occurrences) works
  // from the resolved list.
  const input: UvQuoteInput = { ...rawInput, items: resolveBackSides(rawInput.items) }
  const marginPct = Math.min(95, pos(input.marginPct))
  const multiplier = 1 / (1 - marginPct / 100)

  // Operations first: item-scoped rows join their item's direct cost, quote-scoped
  // rows join the overhead pot.
  const opsByItem = new Map<string, number>()
  let quoteScopeOpsCost = 0
  const operations: UvOperationBreakdown[] = (input.operations ?? []).map((op) => {
    const unitCost = operationUnitCost(op, input.laborHourlyRate)
    const occurrences = operationOccurrences(op, input.items)
    if (op.scope === "quote") {
      quoteScopeOpsCost += unitCost * occurrences
    } else {
      const targets = op.item_id ? input.items.filter((it) => it.id === op.item_id) : input.items
      for (const it of targets) {
        const times = op.scope === "run" ? itemRuns(it) : itemQty(it)
        opsByItem.set(it.id, (opsByItem.get(it.id) ?? 0) + unitCost * times)
      }
    }
    return { id: op.id, occurrences, unitCost, total: unitCost * occurrences }
  })

  const directs = input.items.map((it) => {
    const material = itemMaterialCost(it, input.materialsById.get(it.material_id), input.materialEfficiencyFactor)
    const machineTotal = itemMachineCost(it, input.machinesById.get(it.machine_id), input.electricityCostPerKwh)
    const electricity = itemElectricityCost(it, input.machinesById.get(it.machine_id), input.electricityCostPerKwh)
    // Split so the quote can show a real electricity figure; the pair still
    // sums to the machine cost that drives the price.
    const machine = machineTotal - electricity
    const inkBilled = itemInkCost(it, input.inksByKey, "billed")
    const inkActual = itemInkCost(it, input.inksByKey, "actual")
    const ops = opsByItem.get(it.id) ?? 0
    return { it, material, machine, electricity, inkBilled, inkActual, ops }
  })

  const materialCost = directs.reduce((s, d) => s + d.material, 0)
  const machineCost = directs.reduce((s, d) => s + d.machine, 0)
  const electricityCost = directs.reduce((s, d) => s + d.electricity, 0)
  const inkCostBilled = directs.reduce((s, d) => s + d.inkBilled, 0)
  const inkCostActual = directs.reduce((s, d) => s + d.inkActual, 0)
  const itemOpsCost = directs.reduce((s, d) => s + d.ops, 0)

  const directTotal = materialCost + machineCost + electricityCost + inkCostBilled + itemOpsCost
  const overheadCost = quoteScopeOpsCost + pos(input.packagingCost) + pos(input.fuelCost)
  const setupFee = pos(input.setupFee)
  const baseCost = directTotal + overheadCost + setupFee
  const actualBaseCost = baseCost - inkCostBilled + inkCostActual
  const setupFeeSell = setupFee * multiplier

  const items: UvItemBreakdown[] = directs.map(({ it, material, machine, electricity, inkBilled, inkActual, ops }) => {
    const direct = material + machine + electricity + inkBilled + ops
    // Shares come from BILLED cost so a refill checkbox never moves a line price.
    const share = directTotal > 0 ? direct / directTotal : input.items.length > 0 ? 1 / input.items.length : 0
    const allocated = direct + overheadCost * share
    const qty = itemQty(it)
    const discountPct = input.applyDiscountsAndMinimum ? discountPctForQty(qty, input.qtyDiscountTiers) : 0
    const lineSell = allocated * multiplier * (1 - discountPct / 100)
    return {
      id: it.id,
      runs: itemRuns(it),
      inkBilled,
      inkActual,
      materialCost: material,
      machineCost: machine,
      electricityCost: electricity,
      operationsCost: ops,
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

  const minJobPrice = input.applyDiscountsAndMinimum ? pos(input.uvMinJobPrice) : 0
  const minPriceApplied = baseCost > 0 && sellBeforeMinimum < minJobPrice
  const sellExVat = minPriceApplied ? minJobPrice : sellBeforeMinimum
  const minPriceAdjustment = minPriceApplied ? minJobPrice - sellBeforeMinimum : 0

  const totalExVat = sellExVat + pos(input.emergencyFee)
  const vatAmount = totalExVat * pos(input.vatRate)

  return {
    materialCost,
    machineCost,
    electricityCost,
    inkCostBilled,
    inkCostActual,
    inkSaving: inkCostBilled - inkCostActual,
    operationsCost: quoteScopeOpsCost + itemOpsCost,
    overheadCost,
    setupFee,
    setupFeeSell,
    baseCost,
    actualBaseCost,
    actualProfit: sellExVat - actualBaseCost,
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
    operations,
  }
}
