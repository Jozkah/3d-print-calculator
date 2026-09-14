import { describe, it, expect } from "vitest"
import { computeOwnerSplit } from "./owner-split"

describe("computeOwnerSplit", () => {
  it("assigns each bucket to the correct owner and splits profit/emergency 50/50", () => {
    const r = computeOwnerSplit({
      ownerAMachine: 5, ownerBMachine: 15, electricity: 4,
      ownerALabour: 20, ownerBMaterials: 30, profit: 40, emergency: 10, vat: 25,
    })
    // A = 5 + 4 + 20 + 20(profit) + 5(emergency) = 54
    expect(r.ownerAReceives).toBe(54)
    // B = 15 + 30 + 20(profit) + 5(emergency) + 25(vat) = 95
    expect(r.ownerBReceives).toBe(95)
  })

  it("reproduces the current 3D formula for a worked example", () => {
    // Mirrors excel-calculator lines 827-843 with a concrete set of numbers.
    const ownerAMachine = 2, ownerBMachine = 3, electricity = 1.5, drying = 0.5
    const labor = 8, fuel = 2, filament = 6, materials = 4, packaging = 1.5
    const profit = 18, emergency = 6, vat = 12
    const r = computeOwnerSplit({
      ownerAMachine, ownerBMachine, electricity,
      ownerALabour: labor + fuel + drying,
      ownerBMaterials: filament + materials + packaging,
      profit, emergency, vat,
    })
    const expectedA = ownerAMachine + electricity + labor + fuel + drying + profit / 2 + emergency / 2
    const expectedB = ownerBMachine + filament + materials + packaging + profit / 2 + emergency / 2 + vat
    expect(r.ownerAReceives).toBeCloseTo(expectedA, 6)
    expect(r.ownerBReceives).toBeCloseTo(expectedB, 6)
  })
})
