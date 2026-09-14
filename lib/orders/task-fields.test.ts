import { describe, it, expect } from "vitest"
import { taskRequiresCalculator, clearIncompatibleTaskFields } from "./task-fields"

describe("taskRequiresCalculator", () => {
  it("is true for machine types, false for generic", () => {
    for (const ty of ["3d_print", "laser_cut", "laser_engrave", "uv_print"]) expect(taskRequiresCalculator(ty)).toBe(true)
    for (const ty of ["design", "post_processing", "assembly", "packaging", "delivery", "other"]) expect(taskRequiresCalculator(ty)).toBe(false)
  })
})

describe("clearIncompatibleTaskFields", () => {
  it("clears machine/material/colour/payload for a generic type", () => {
    expect(clearIncompatibleTaskFields("design")).toEqual({
      printer_id: null, machine_name: null, material_id: null, material_name: null, material_color: null, calc_payload: null,
    })
  })
  it("clears the same fields for a calc type (payload is kind-specific — force re-cost)", () => {
    expect(clearIncompatibleTaskFields("laser_cut")).toEqual({
      printer_id: null, machine_name: null, material_id: null, material_name: null, material_color: null, calc_payload: null,
    })
  })
})
