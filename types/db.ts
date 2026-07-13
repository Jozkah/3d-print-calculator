// Shared row types for the local data layer (lib/local-db.ts).
//
// These shapes are derived from how the app actually reads and writes each
// table today — they are not a generated schema. This is incremental typing:
// every row type keeps a `[key: string]: any` index signature so legacy
// columns, join artifacts, and fields written by older versions of the app
// remain accessible without compile errors. Tighten fields here as call sites
// get cleaned up.

export type Printer = {
  id: string
  name: string
  owner: string
  printer_cost: number
  estimated_life_years: number
  average_power_consumption_watts: number
  additional_upfront_cost: number
  estimated_annual_maintenance: number
  estimated_printer_uptime_percent: number
  has_enclosure: boolean
  material_type?: string
  [key: string]: any
}

export type Filament = {
  id: string
  name: string
  price_per_kg: number
  requires_heating: boolean
  heating_time_hours: number
  material_type: string
  brand?: string
  color?: string
  color_hex?: string | null
  [key: string]: any
}

export type Client = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  created_at: string
  [key: string]: any
}

export type GlobalSettings = {
  id: string
  electricity_cost_per_kwh: number
  fuel_cost_per_liter: number
  car_fuel_consumption_per_100km: number
  labor_hourly_rate: number
  emergency_fee_fixed: number
  material_efficiency_factor?: number
  cost_buffer_factor?: number
  double_heating_cost?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: any
}

export type Quote = {
  id: string
  quote_type: string
  quote_name: string
  client_id?: string | null
  printer_id?: string
  // JSONB-style item arrays. Their element shapes vary between quote versions
  // (legacy single-filament parts vs. multi-filament parts), so they stay
  // loose here; pages that need structure narrow them locally.
  printed_parts: any[]
  dried_batches: any[]
  materials: any[]
  labor_items: any[]
  packaging_items: any[]
  distance_traveled_km: number
  is_emergency: boolean
  total_printing_cost: number
  machine_cost: number
  drying_cost: number
  materials_cost: number
  labor_cost: number
  packaging_cost: number
  fuel_cost: number
  emergency_fee: number
  electricity_cost: number
  landed_cost: number
  margin_30: number
  margin_40: number
  margin_50: number
  margin_60: number
  selected_margin: string
  selected_margin_percentage: number | null
  owner_a_receives: number
  owner_b_receives: number
  created_at: string
  is_draft?: boolean
  status?: string
  // Authoritative total stored for target-price quotes (operator's exact
  // entered total, already inclusive of emergency fee and VAT). null/absent
  // when the quote used margin mode.
  final_price?: number | null
  vat_enabled?: boolean
  [key: string]: any
}

/** Rows for tables the app touches without a concrete shared shape. */
export type UnknownRow = Record<string, any>

/**
 * Table name -> row type. Used by lib/local-db.ts to type query results:
 * `createClient().from("printers").select()` resolves rows to `Printer`.
 */
export interface Tables {
  printers: Printer
  filaments: Filament
  laser_materials: UnknownRow
  clients: Client
  quotes: Quote
  global_settings: GlobalSettings
  imported_csv_files: UnknownRow
  quote_headers: UnknownRow
  quote_parts: UnknownRow
}
