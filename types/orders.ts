// Order-management domain types.
//
// These shapes describe the rows the Orders feature reads and writes through
// the shared local-db layer (lib/local-db.ts). Like types/db.ts they each keep
// a `[key: string]: any` index signature so older rows and forward-compatible
// fields stay accessible without compile errors.
//
// Status/priority/etc. are string-literal unions kept here so the whole app
// agrees on one vocabulary; label/colour/ordering metadata lives in
// lib/orders/status.ts.

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Production lifecycle of an order. `on_hold`/`cancelled` are handled off the main board. */
export type OrderStatus =
  | "draft"
  | "awaiting_approval"
  | "queued"
  | "in_production"
  | "post_processing"
  | "ready"
  | "completed"
  | "on_hold"
  | "cancelled"

export type OrderPriority = "low" | "normal" | "high" | "urgent"

/** A single production operation inside an order. */
export type OrderTaskType =
  | "3d_print"
  | "laser_cut"
  | "laser_engrave"
  | "uv_print"
  | "design"
  | "post_processing"
  | "assembly"
  | "packaging"
  | "delivery"
  | "other"

export type OrderTaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "paused"
  | "failed"
  | "completed"
  | "cancelled"

/** Why a production attempt failed (analytics-friendly, kept coarse). */
export type FailureReason =
  | "adhesion"
  | "filament"
  | "machine"
  | "power"
  | "quality"
  | "design"
  | "other"

export type FulfilmentType = "pickup" | "local_delivery" | "shipping" | "digital"

/** Payment lifecycle of an order/invoice, derived from recorded payments. */
export type PaymentStatus =
  | "not_invoiced"
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "refunded"
  | "void"

export type PaymentMethod = "cash" | "card" | "bank_transfer" | "mbway" | "paypal" | "other"

export type AttachmentCategory =
  | "customer"
  | "production"
  | "reference"
  | "artwork"
  | "model"
  | "invoice"
  | "other"

/** Machine-readable activity kinds so the timeline can icon/group entries. */
export type ActivityType =
  | "order_created"
  | "order_updated"
  | "status_changed"
  | "priority_changed"
  | "due_changed"
  | "quote_linked"
  | "quote_unlinked"
  | "invoice_created"
  | "invoice_paid"
  | "payment_recorded"
  | "file_uploaded"
  | "file_deleted"
  | "task_added"
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "task_updated"
  | "note_added"
  | "order_completed"
  | "order_reopened"
  | "order_cancelled"
  | "order_archived"
  | "order_duplicated"
  | "note"

// ---------------------------------------------------------------------------
// Snapshots (immutable copies preserved at creation time)
// ---------------------------------------------------------------------------

/** Client identity copied onto the order so it survives edits/deletion of the client record. */
export type ClientSnapshot = {
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type Order = {
  id: string
  order_number: string
  title: string
  description?: string | null

  client_id?: string | null
  client_snapshot?: ClientSnapshot | null

  status: OrderStatus
  priority: OrderPriority
  /** Manual ordering within a status column (queue position). Lower = earlier. */
  queue_position: number

  // Scheduling. All ISO strings.
  order_date?: string | null
  due_date?: string | null
  target_date?: string | null
  /** Operator-entered workload estimate in minutes (aggregate of task estimates when tasks exist). */
  estimated_minutes?: number | null
  actual_minutes?: number | null

  // Financial snapshot. Preserved as entered/quoted — never silently recomputed.
  currency_symbol?: string
  estimated_cost?: number | null
  subtotal?: number | null
  vat_rate?: number | null
  vat_amount?: number | null
  total?: number | null
  /** Where the financials came from: an accepted quote, manual entry, or the sum of production tasks. */
  pricing_source?: "quote" | "manual" | "tasks"

  // Quote linkage (denormalised for convenience; the source of truth is order_quote_links).
  primary_quote_id?: string | null
  /** The quote this order was originally converted from, if any. */
  source_quote_id?: string | null

  // Fulfilment.
  fulfilment_type?: FulfilmentType | null
  shipping_address?: string | null
  shipping_carrier?: string | null
  shipping_tracking?: string | null
  shipping_cost?: number | null
  delivered_at?: string | null

  tags?: string[]

  cancel_reason?: string | null

  created_at: string
  updated_at?: string
  completed_at?: string | null
  archived_at?: string | null
  cancelled_at?: string | null

  [key: string]: any
}

export type OrderTask = {
  id: string
  order_id: string
  name: string
  type: OrderTaskType
  status: OrderTaskStatus
  quantity: number
  /** Ordering of tasks within an order. Lower = earlier. */
  sequence: number

  /**
   * Client the task belongs to — always mirrors the parent order's client and
   * is never edited directly. Changing the order's client cascades here
   * (lib/orders/data.ts changeOrderClient).
   */
  client_id?: string | null
  client_name?: string | null

  printer_id?: string | null
  machine_name?: string | null
  material_id?: string | null
  material_name?: string | null
  material_color?: string | null

  estimated_minutes?: number | null
  actual_minutes?: number | null
  /** Internal production cost estimate (from the embedded calculator's landed cost). */
  estimated_cost?: number | null
  /** Customer-facing charge for this task (calculator sell total, or entered manually). */
  price?: number | null

  notes?: string | null

  /**
   * Full calculator payload (a quote-shaped object) captured when the task was
   * costed with the embedded 3D calculator. Lets the task be re-opened and
   * edited in the calculator later. Absent for quick/manual tasks.
   */
  calc_payload?: Record<string, any> | null

  // Failure / retry tracking. A failed task is retained; a retry creates a new
  // task that points back via retry_of.
  failure_reason?: FailureReason | null
  failure_notes?: string | null
  wasted_minutes?: number | null
  wasted_material_g?: number | null
  retry_of?: string | null
  attempt?: number

  created_at: string
  started_at?: string | null
  completed_at?: string | null
  updated_at?: string

  [key: string]: any
}

export type OrderNote = {
  id: string
  order_id: string
  content: string
  pinned?: boolean
  created_at: string
  updated_at?: string
  [key: string]: any
}

/**
 * Metadata for a file attached to an order. The binary Blob is NOT stored here —
 * it lives in IndexedDB keyed by this row's id (lib/attachment-store.ts). These
 * rows go through the normal local-db JSON layer so they back up and sync like
 * everything else.
 */
export type OrderAttachment = {
  id: string
  order_id: string
  /** Sanitised original filename. */
  file_name: string
  /** Operator-editable display name (defaults to file_name). */
  display_name?: string
  mime_type: string
  size: number
  category?: AttachmentCategory
  description?: string | null
  created_at: string
  updated_at?: string
  [key: string]: any
}

export type OrderActivity = {
  id: string
  order_id: string
  type: ActivityType
  message: string
  /** Optional structured context (from/to values, ids) for future rendering. */
  meta?: Record<string, unknown> | null
  created_at: string
  [key: string]: any
}

/** Links an order to a quote. An order may reference several revisions; one is primary/accepted. */
export type OrderQuoteLink = {
  id: string
  order_id: string
  quote_id: string
  is_primary?: boolean
  /** Quote headline total captured when linked, so the order shows a stable number. */
  quoted_total?: number | null
  quote_number?: string | null
  quote_name?: string | null
  created_at: string
  [key: string]: any
}

/** A single billed line on an invoice (embedded array on the invoice row). */
export type InvoiceItem = {
  id: string
  description: string
  quantity: number
  unit_price: number
  /** quantity * unit_price, stored so historical totals never drift. */
  amount: number
}

export type Invoice = {
  id: string
  invoice_number: string
  order_id: string
  client_id?: string | null
  client_snapshot?: ClientSnapshot | null

  issue_date: string
  due_date?: string | null

  items: InvoiceItem[]
  subtotal: number
  vat_rate: number
  vat_amount: number
  total: number

  currency_symbol?: string

  /** External accounting-software reference, if the real invoice lives elsewhere. */
  external_reference?: string | null
  notes?: string | null

  /** Explicit void flag; paid/partial state is derived from payments. */
  voided_at?: string | null
  created_at: string
  updated_at?: string
  [key: string]: any
}

export type Payment = {
  id: string
  order_id: string
  invoice_id?: string | null
  amount: number
  method: PaymentMethod
  /** ISO date of the payment. */
  paid_at: string
  reference?: string | null
  note?: string | null
  /** Negative-intent marker for refunds (amount stays positive; this flags direction). */
  is_refund?: boolean
  created_at: string
  [key: string]: any
}

// ---------------------------------------------------------------------------
// Derived view-models (computed, never persisted)
// ---------------------------------------------------------------------------

export type OrderProgress = {
  total: number
  completed: number
  /** 0..1; 0 when there are no countable tasks. */
  fraction: number
  hasTasks: boolean
}

export type OrderFinancials = {
  total: number
  paid: number
  outstanding: number
  status: PaymentStatus
}
