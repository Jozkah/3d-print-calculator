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
  // Bundled product-image key from lib/printer-images.ts ("generic" opts out
  // of name matching). Absent on legacy rows, which auto-match by name.
  image_key?: string | null
  material_type?: string
  // "3d-printer" (default for legacy rows) | "laser" | "sticker-printer".
  machine_type?: string
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
  // Spool inventory (filament rows only). null/absent = stock not tracked.
  grams_in_stock?: number | null
  // Amber low-stock badge threshold in grams (default 1000).
  low_stock_threshold_g?: number
  [key: string]: any
}

export type LaserMaterial = {
  id: string
  name: string
  color?: string | null
  // How this material is bought/charged: per sheet, per cm², per cm, per piece.
  pricing_unit: "sheet" | "area" | "length" | "piece"
  price: number
  sheet_width_cm?: number | null
  sheet_height_cm?: number | null
  stock_qty?: number | null
  notes?: string | null
  created_at: string
  updated_at?: string
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
  // VAT rate stored as a fraction (0.23 = 23%). Rows written before this
  // field existed fall back to 0.23 at every read site.
  vat_rate?: number
  currency_symbol?: string
  // How many days a new quote stays valid (drives quotes.valid_until).
  validity_days?: number
  // Business identity rendered as a letterhead on quote/invoice documents.
  // All optional; empty strings mean "not configured" and the documents fall
  // back to their plain layout.
  company_name?: string
  company_address?: string
  company_email?: string
  company_phone?: string
  company_tax_id?: string
  // Logo as a data-URI string (uploaded via file input, capped ~200KB).
  company_logo?: string
  // Laser & Stickers pricing levers. Absent on legacy rows; read sites fall
  // back to LASER_DEFAULTS from lib/laser-pricing.
  laser_min_job_price?: number
  sticker_min_job_price?: number
  default_setup_fee?: number
  qty_discount_tiers?: { min_qty: number; discount_pct: number }[]
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
  // VAT fraction the quote was priced with (0.23 = 23%). Absent on legacy
  // rows, which re-render with the historical 0.23.
  vat_rate?: number
  // ISO timestamp after which the quote is no longer valid. Absent on legacy
  // rows, which fall back to created_at + 30 days.
  valid_until?: string
  // Invoice fields, minted the first time the invoice document is opened.
  // invoice_number is sequential per year ("INV-2026-001").
  invoice_number?: string
  invoice_date?: string
  due_date?: string
  // ISO timestamp when the invoice was marked paid; null/absent = unpaid.
  paid_at?: string | null
  // Set once the quote reached "finished" and filament stock was decremented,
  // so repeated status flips never double-deduct inventory.
  stock_deducted?: boolean
  [key: string]: any
}

/** Per-year sequential counters (e.g. invoice numbering): key "invoice-2026". */
export type Counter = {
  id: string
  key: string
  value: number
  [key: string]: any
}

/** A reusable quote structure saved from an existing quote (no client/pricing identity). */
export type QuoteTemplate = {
  id: string
  name: string
  payload: Partial<Quote>
  created_at?: string
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
  laser_materials: LaserMaterial
  clients: Client
  quotes: Quote
  global_settings: GlobalSettings
  imported_csv_files: UnknownRow
  quote_headers: UnknownRow
  quote_parts: UnknownRow
  counters: Counter
  quote_templates: QuoteTemplate
}
