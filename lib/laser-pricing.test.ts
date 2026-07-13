import { describe, it, expect } from "vitest"
import { machineCostPerHour, type LaserMachineLike } from "./laser-pricing"

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
