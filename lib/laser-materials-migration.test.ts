import { describe, it, expect } from "vitest"
import { migrateLegacyLaserMaterials } from "./laser-materials-migration"
import type { Filament, LaserMaterial } from "@/types/db"

const filament = (over: Partial<Filament>): Filament => ({
  id: "f1",
  name: "PLA Black",
  price_per_kg: 20,
  requires_heating: false,
  heating_time_hours: 0,
  material_type: "filament",
  ...over,
})

describe("migrateLegacyLaserMaterials", () => {
  it("converts non-filament rows to sheet-priced laser materials", () => {
    const rows = [
      filament({ id: "f1", material_type: "filament" }),
      filament({ id: "f2", name: "Plywood Sheet", material_type: "material", price_per_kg: 8, color_hex: "#a07040" }),
    ]
    const out = migrateLegacyLaserMaterials(rows, [])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ name: "Plywood Sheet", pricing_unit: "sheet", price: 8, color: "#a07040" })
    expect(out[0].id).toBeTruthy()
    expect(out[0].created_at).toBeTruthy()
  })

  it("is idempotent — skips names that already exist (case-insensitive)", () => {
    const rows = [filament({ id: "f2", name: "Plywood Sheet", material_type: "material" })]
    const existing = [{ name: "plywood sheet" } as LaserMaterial]
    expect(migrateLegacyLaserMaterials(rows, existing)).toHaveLength(0)
  })

  it("defaults a missing price to 0", () => {
    const rows = [filament({ id: "f2", name: "Cork", material_type: "material", price_per_kg: undefined as any })]
    expect(migrateLegacyLaserMaterials(rows, [])[0].price).toBe(0)
  })
})
