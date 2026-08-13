// Server-side seed rows, written the first time a seedable table is read so the
// app works out of the box (the calculators expect one global_settings row).
//
// Mirrors the SEED block in lib/local-db.ts, minus the localStorage-specific
// laser_materials migration (that path reads the browser's `filaments` key,
// which does not exist on the server — laser_materials starts empty here and is
// populated by an import instead).

import { randomUUID } from "node:crypto"
import { LASER_DEFAULTS } from "@/lib/laser-pricing"
import { UV_DEFAULTS, UV_INK_SEED } from "@/lib/uv-pricing"

type Row = Record<string, any>

export const SEEDABLE_TABLES = ["global_settings", "uv_inks"] as const

export function seedRows(table: string): Row[] {
  const now = new Date().toISOString()
  if (table === "global_settings") {
    return [
      {
        id: randomUUID(),
        electricity_cost_per_kwh: 0.2,
        fuel_cost_per_liter: 2.0,
        car_fuel_consumption_per_100km: 7.5,
        labor_hourly_rate: 7.5,
        material_efficiency_factor: 1.1,
        cost_buffer_factor: 1.3,
        emergency_fee_fixed: 10.0,
        double_heating_cost: true,
        vat_rate: 0.23,
        currency_symbol: "€",
        validity_days: 30,
        ...LASER_DEFAULTS,
        ...UV_DEFAULTS,
        company_name: "",
        company_address: "",
        company_email: "",
        company_phone: "",
        company_tax_id: "",
        company_logo: "",
        created_at: now,
        updated_at: now,
      },
    ]
  }
  if (table === "uv_inks") {
    return UV_INK_SEED.map((ink) => ({
      id: randomUUID(),
      ...ink,
      oem_price: 0,
      oem_volume_ml: 0,
      refill_price: null,
      refill_volume_ml: null,
      created_at: now,
      updated_at: now,
    }))
  }
  return []
}
