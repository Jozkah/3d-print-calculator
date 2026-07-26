// One-time (idempotent) migration of legacy laser materials that were stored
// as filaments rows with material_type !== "filament". Pure so it's testable;
// lib/local-db.ts calls it when seeding the laser_materials table.

import type { Filament, LaserMaterial } from "@/types/db"

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function migrateLegacyLaserMaterials(filamentRows: Filament[], existing: LaserMaterial[]): LaserMaterial[] {
  const taken = new Set(existing.map((m) => (m.name || "").toLowerCase()))
  const now = new Date().toISOString()
  return filamentRows
    .filter((f) => f.material_type && f.material_type !== "filament")
    .filter((f) => !taken.has((f.name || "").toLowerCase()))
    .map((f) => ({
      id: newId(),
      name: f.name,
      color: f.color_hex ?? null,
      pricing_unit: "sheet" as const,
      price: Number(f.price_per_kg) || 0,
      sheet_width_cm: null,
      sheet_height_cm: null,
      stock_qty: null,
      notes: "Migrated from filament materials",
      created_at: now,
      updated_at: now,
    }))
}
