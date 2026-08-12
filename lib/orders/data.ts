// Data-access service for the Orders domain.
//
// All persistence goes through the shared local-db client (Supabase-compatible),
// so this works unchanged against localStorage today or a real Postgres later.
// Components never touch `createClient().from("orders")` directly — they call
// these functions, which also keep the activity log and derived snapshots
// consistent. Binary file bytes are delegated to lib/attachment-store.ts.

import { createClient } from "@/lib/supabase/client"
import type {
  Order,
  OrderTask,
  OrderNote,
  OrderAttachment,
  OrderQuoteLink,
  Invoice,
  InvoiceItem,
  Payment,
  OrderStatus,
  OrderPriority,
  ClientSnapshot,
  AttachmentCategory,
  FailureReason,
} from "@/types/orders"
import { mintOrderNumber, mintInvoiceNumber } from "@/lib/orders/numbering"
import { logActivity } from "@/lib/orders/activity"
import {
  quoteHeadlineTotals,
  nextQueuePosition,
  aggregateEstimatedMinutes,
  computeInvoiceTotals,
  round2,
} from "@/lib/orders/compute"
import {
  saveAttachmentBlob,
  deleteAttachmentBlob,
  deleteAttachmentsForOrder,
} from "@/lib/attachment-store"
import { orderStatusLabel, orderPriorityLabel, taskTypeLabel } from "@/lib/orders/status"

const now = () => new Date().toISOString()
const uid = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

function client() {
  return createClient()
}

// ---------------------------------------------------------------------------
// Clients helper
// ---------------------------------------------------------------------------

export function snapshotClient(c: Record<string, any> | null | undefined): ClientSnapshot | null {
  if (!c) return null
  return {
    name: c.name ?? "",
    email: c.email ?? null,
    phone: c.phone ?? null,
    address: c.address ?? null,
  }
}

async function findClient(clientId: string | null | undefined): Promise<Record<string, any> | null> {
  if (!clientId) return null
  const { data } = await client().from("clients").select("*").eq("id", clientId).maybeSingle()
  return (data as Record<string, any>) ?? null
}

// ---------------------------------------------------------------------------
// Orders — read
// ---------------------------------------------------------------------------

export async function listOrders(): Promise<Order[]> {
  const { data } = await client().from("orders").select("*").order("created_at", { ascending: false })
  return (data as Order[]) ?? []
}

export async function getOrder(id: string): Promise<Order | null> {
  const { data } = await client().from("orders").select("*").eq("id", id).maybeSingle()
  return (data as Order) ?? null
}

// ---------------------------------------------------------------------------
// Orders — create
// ---------------------------------------------------------------------------

export type CreateOrderInput = {
  title: string
  description?: string | null
  client_id?: string | null
  status?: OrderStatus
  priority?: OrderPriority
  due_date?: string | null
  currency_symbol?: string
  total?: number | null
  vat_rate?: number | null
  vat_amount?: number | null
  subtotal?: number | null
  estimated_cost?: number | null
  pricing_source?: "quote" | "manual" | "tasks"
  tags?: string[]
  source_quote_id?: string | null
  primary_quote_id?: string | null
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const supabase = client()
  const status = input.status ?? "draft"

  // Queue position = end of its status column.
  const { data: sameStatus } = await supabase.from("orders").select("*").eq("status", status)
  const queue_position = nextQueuePosition((sameStatus as Order[]) ?? [])

  const clientRow = await findClient(input.client_id)
  const timestamp = now()
  const order_number = await mintOrderNumber()

  const row: Order = {
    id: uid(),
    order_number,
    title: input.title.trim() || "Untitled order",
    description: input.description ?? null,
    client_id: input.client_id ?? null,
    client_snapshot: snapshotClient(clientRow),
    status,
    priority: input.priority ?? "normal",
    queue_position,
    order_date: timestamp,
    due_date: input.due_date ?? null,
    target_date: null,
    estimated_minutes: null,
    actual_minutes: null,
    currency_symbol: input.currency_symbol ?? "€",
    estimated_cost: input.estimated_cost ?? null,
    subtotal: input.subtotal ?? null,
    vat_rate: input.vat_rate ?? null,
    vat_amount: input.vat_amount ?? null,
    total: input.total ?? null,
    pricing_source: input.pricing_source ?? "manual",
    primary_quote_id: input.primary_quote_id ?? null,
    source_quote_id: input.source_quote_id ?? null,
    fulfilment_type: null,
    tags: input.tags ?? [],
    created_at: timestamp,
    updated_at: timestamp,
    completed_at: null,
    archived_at: null,
    cancelled_at: null,
  }

  await supabase.from("orders").insert([row])
  await logActivity(row.id, "order_created", `Order ${order_number} created`)
  return row
}

// ---------------------------------------------------------------------------
// Orders — create from quote (snapshot)
// ---------------------------------------------------------------------------

/** Build production tasks from a quote's line items (best-effort, per calculator). */
function tasksFromQuote(quote: Record<string, any>, orderId: string): OrderTask[] {
  const tasks: OrderTask[] = []
  const base = (partial: Partial<OrderTask>, seq: number): OrderTask => ({
    id: uid(),
    order_id: orderId,
    name: "Task",
    type: "other",
    status: "pending",
    quantity: 1,
    sequence: seq,
    created_at: now(),
    attempt: 1,
    ...partial,
  })

  const mode = quote?.quote_type_mode
  if (Array.isArray(quote?.printed_parts) && quote.printed_parts.length > 0) {
    quote.printed_parts.forEach((p: any, i: number) => {
      tasks.push(
        base(
          {
            name: p?.name || `Print part ${i + 1}`,
            type: "3d_print",
            printer_id: p?.printer_id ?? null,
            estimated_minutes: p?.printing_time_hr ? Math.round(Number(p.printing_time_hr) * 60) : null,
          },
          i,
        ),
      )
    })
  } else if (Array.isArray(quote?.laser_items) && quote.laser_items.length > 0) {
    quote.laser_items.forEach((it: any, i: number) => {
      tasks.push(
        base(
          {
            name: it?.material_name ? `Laser — ${it.material_name}` : `Laser job ${i + 1}`,
            type: mode === "laser" ? "laser_engrave" : "laser_cut",
            quantity: Number(it?.quantity) || 1,
            machine_name: it?.machine_name ?? null,
            material_name: it?.material_name ?? null,
            estimated_minutes: it?.machine_minutes ? Math.round(Number(it.machine_minutes)) : null,
          },
          i,
        ),
      )
    })
  } else if (Array.isArray(quote?.uv_items) && quote.uv_items.length > 0) {
    quote.uv_items.forEach((it: any, i: number) => {
      tasks.push(
        base(
          {
            name: it?.material_name ? `UV print — ${it.material_name}` : `UV job ${i + 1}`,
            type: "uv_print",
            quantity: Number(it?.quantity) || Number(it?.runs) || 1,
            machine_name: it?.machine_name ?? null,
            material_name: it?.material_name ?? null,
          },
          i,
        ),
      )
    })
  }
  return tasks
}

export type ConvertQuoteOptions = { status?: OrderStatus; seedTasks?: boolean }

export async function createOrderFromQuote(
  quote: Record<string, any>,
  options: ConvertQuoteOptions = {},
): Promise<Order> {
  const supabase = client()
  const totals = quoteHeadlineTotals(quote)
  const clientRow = await findClient(quote?.client_id)

  const order = await createOrder({
    title: quote?.quote_name || "Order from quote",
    client_id: quote?.client_id ?? null,
    status: options.status ?? "queued",
    priority: "normal",
    total: totals.total,
    subtotal: totals.subtotal,
    vat_amount: totals.vat,
    vat_rate: totals.vatRate,
    estimated_cost: Number(quote?.landed_cost) || null,
    pricing_source: "quote",
    source_quote_id: quote?.id ?? null,
    primary_quote_id: quote?.id ?? null,
  })

  // Link the source quote as primary, snapshotting its headline total.
  await supabase.from("order_quote_links").insert([
    {
      id: uid(),
      order_id: order.id,
      quote_id: quote?.id,
      is_primary: true,
      quoted_total: totals.total,
      quote_number: quote?.quote_number ?? null,
      quote_name: quote?.quote_name ?? null,
      created_at: now(),
    } as OrderQuoteLink,
  ])

  // Seed production tasks from the quote's line items.
  const seed = options.seedTasks !== false
  let estimated_minutes: number | null = null
  if (seed) {
    const tasks = tasksFromQuote(quote, order.id)
    if (tasks.length > 0) {
      await supabase.from("order_tasks").insert(tasks)
      estimated_minutes = aggregateEstimatedMinutes(tasks) || null
    }
  }

  const patch: Partial<Order> = { estimated_minutes, updated_at: now() }
  if (clientRow) patch.client_snapshot = snapshotClient(clientRow)
  await supabase.from("orders").update(patch).eq("id", order.id)

  await logActivity(
    order.id,
    "quote_linked",
    `Created from quote ${quote?.quote_number || quote?.quote_name || quote?.id}`,
  )
  return { ...order, ...patch }
}

/** Existing orders that already reference a given quote (dedupe warning). */
export async function ordersForQuote(quoteId: string): Promise<OrderQuoteLink[]> {
  const { data } = await client().from("order_quote_links").select("*").eq("quote_id", quoteId)
  return (data as OrderQuoteLink[]) ?? []
}

// ---------------------------------------------------------------------------
// Orders — update / status / lifecycle
// ---------------------------------------------------------------------------

export async function updateOrder(id: string, patch: Partial<Order>): Promise<void> {
  await client().from("orders").update({ ...patch, updated_at: now() }).eq("id", id)
}

export async function setOrderStatus(order: Order, status: OrderStatus): Promise<void> {
  if (order.status === status) return
  const supabase = client()
  const patch: Partial<Order> = { status, updated_at: now() }

  // Moving into a new column drops the card at the end of that column.
  const { data: sameStatus } = await supabase.from("orders").select("*").eq("status", status)
  patch.queue_position = nextQueuePosition((sameStatus as Order[]) ?? [])

  if (status === "completed" && !order.completed_at) patch.completed_at = now()
  if (status !== "completed" && order.completed_at) patch.completed_at = null

  await supabase.from("orders").update(patch).eq("id", id_of(order))
  await logActivity(
    order.id,
    "status_changed",
    `Status changed from ${orderStatusLabel(order.status)} to ${orderStatusLabel(status)}`,
    { from: order.status, to: status },
  )
  if (status === "completed") await logActivity(order.id, "order_completed", "Order completed")
}

function id_of(o: Order): string {
  return o.id
}

export async function setOrderPriority(order: Order, priority: OrderPriority): Promise<void> {
  if (order.priority === priority) return
  await updateOrder(order.id, { priority })
  await logActivity(
    order.id,
    "priority_changed",
    `Priority changed from ${orderPriorityLabel(order.priority)} to ${orderPriorityLabel(priority)}`,
    { from: order.priority, to: priority },
  )
}

export async function setOrderDueDate(order: Order, due_date: string | null): Promise<void> {
  await updateOrder(order.id, { due_date })
  await logActivity(order.id, "due_changed", due_date ? `Due date set to ${due_date.slice(0, 10)}` : "Due date cleared")
}

export async function archiveOrder(order: Order): Promise<void> {
  await updateOrder(order.id, { archived_at: now() })
  await logActivity(order.id, "order_archived", "Order archived")
}

export async function unarchiveOrder(order: Order): Promise<void> {
  await updateOrder(order.id, { archived_at: null })
}

export async function cancelOrder(order: Order, reason?: string): Promise<void> {
  await updateOrder(order.id, { status: "cancelled", cancelled_at: now(), cancel_reason: reason ?? null })
  await logActivity(order.id, "order_cancelled", reason ? `Order cancelled — ${reason}` : "Order cancelled")
}

export async function reopenOrder(order: Order): Promise<void> {
  await updateOrder(order.id, { status: "in_production", completed_at: null })
  await logActivity(order.id, "order_reopened", "Order reopened")
}

export async function completeOrder(order: Order): Promise<void> {
  await setOrderStatus(order, "completed")
}

// ---------------------------------------------------------------------------
// Orders — queue reordering
// ---------------------------------------------------------------------------

/** Persist a new manual ordering for the cards within a status column. */
export async function persistQueueOrder(orderedIds: string[]): Promise<void> {
  const supabase = client()
  await Promise.all(
    orderedIds.map((id, index) => supabase.from("orders").update({ queue_position: index }).eq("id", id)),
  )
}

// ---------------------------------------------------------------------------
// Orders — duplicate
// ---------------------------------------------------------------------------

export async function duplicateOrder(sourceId: string): Promise<Order | null> {
  const source = await getOrder(sourceId)
  if (!source) return null

  const copy = await createOrder({
    title: `${source.title} (copy)`,
    description: source.description,
    client_id: source.client_id,
    status: "draft",
    priority: source.priority,
    total: source.total,
    subtotal: source.subtotal,
    vat_rate: source.vat_rate,
    vat_amount: source.vat_amount,
    estimated_cost: source.estimated_cost,
    pricing_source: source.pricing_source,
    tags: source.tags ? [...source.tags] : [],
  })

  // Copy production tasks as fresh, un-started attempts (no history/timestamps).
  const tasks = await listTasks(sourceId)
  if (tasks.length > 0) {
    const supabase = client()
    await supabase.from("order_tasks").insert(
      tasks.map((t) => ({
        id: uid(),
        order_id: copy.id,
        name: t.name,
        type: t.type,
        status: "pending" as const,
        quantity: t.quantity,
        sequence: t.sequence,
        printer_id: t.printer_id ?? null,
        machine_name: t.machine_name ?? null,
        material_id: t.material_id ?? null,
        material_name: t.material_name ?? null,
        material_color: t.material_color ?? null,
        estimated_minutes: t.estimated_minutes ?? null,
        notes: t.notes ?? null,
        attempt: 1,
        created_at: now(),
      })),
    )
  }
  await logActivity(copy.id, "order_duplicated", `Duplicated from ${source.order_number}`)
  return copy
}

// ---------------------------------------------------------------------------
// Orders — deep delete (with attachment blob cleanup)
// ---------------------------------------------------------------------------

export async function deleteOrderDeep(id: string): Promise<void> {
  const supabase = client()
  // Remove binary blobs first so nothing is orphaned in IndexedDB.
  try {
    await deleteAttachmentsForOrder(id)
  } catch {
    /* continue — metadata cleanup below still runs */
  }
  await Promise.all([
    supabase.from("order_tasks").delete().eq("order_id", id),
    supabase.from("order_notes").delete().eq("order_id", id),
    supabase.from("order_attachments").delete().eq("order_id", id),
    supabase.from("order_activity").delete().eq("order_id", id),
    supabase.from("order_quote_links").delete().eq("order_id", id),
    supabase.from("invoices").delete().eq("order_id", id),
    supabase.from("payments").delete().eq("order_id", id),
  ])
  await supabase.from("orders").delete().eq("id", id)
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function listTasks(orderId: string): Promise<OrderTask[]> {
  const { data } = await client()
    .from("order_tasks")
    .select("*")
    .eq("order_id", orderId)
    .order("sequence", { ascending: true })
  return (data as OrderTask[]) ?? []
}

export type CreateTaskInput = Partial<OrderTask> & { order_id: string; name: string }

export async function createTask(input: CreateTaskInput): Promise<OrderTask> {
  const supabase = client()
  const existing = await listTasks(input.order_id)
  const row: OrderTask = {
    id: uid(),
    order_id: input.order_id,
    name: input.name.trim() || "Task",
    type: input.type ?? "other",
    status: input.status ?? "pending",
    quantity: input.quantity ?? 1,
    sequence: input.sequence ?? existing.length,
    printer_id: input.printer_id ?? null,
    machine_name: input.machine_name ?? null,
    material_id: input.material_id ?? null,
    material_name: input.material_name ?? null,
    material_color: input.material_color ?? null,
    estimated_minutes: input.estimated_minutes ?? null,
    estimated_cost: input.estimated_cost ?? null,
    price: input.price ?? null,
    calc_payload: input.calc_payload ?? null,
    notes: input.notes ?? null,
    attempt: 1,
    created_at: now(),
  }
  await supabase.from("order_tasks").insert([row])
  await logActivity(input.order_id, "task_added", `Task added: ${row.name}`)
  return row
}

/**
 * Derive a task's summary fields (time, cost, machine, material) from any
 * calculator payload (3D / laser / UV — distinguished by quote_type_mode).
 * `landed_cost` is the internal production cost. Estimated time is the sum of
 * per-part print time (3D) or machine minutes (laser); UV has no direct time.
 */
export function taskFieldsFromCalc(
  quoteData: Record<string, any>,
  printers: Array<{ id: string; name: string }> = [],
  filaments: Array<{ id: string; name: string; color?: string | null }> = [],
): Partial<OrderTask> {
  const mode = quoteData?.quote_type_mode
  const base: Partial<OrderTask> = {
    estimated_cost: quoteData?.landed_cost != null ? round2(Number(quoteData.landed_cost)) : null,
    // Customer-facing charge for this task = the calculator's headline sell total.
    price: round2(quoteHeadlineTotals(quoteData).total),
    calc_payload: quoteData,
  }

  if (mode === "laser" || (Array.isArray(quoteData?.laser_items) && quoteData.laser_items.length > 0)) {
    const items: any[] = quoteData.laser_items ?? []
    const minutes = Math.round(items.reduce((sum, it) => sum + (Number(it?.machine_minutes) || 0), 0))
    const first = items[0]
    return {
      ...base,
      estimated_minutes: minutes || null,
      machine_name: first?.machine_name ?? null,
      material_name: first?.material_name ?? null,
    }
  }

  if (mode === "uv" || (Array.isArray(quoteData?.uv_items) && quoteData.uv_items.length > 0)) {
    const items: any[] = quoteData.uv_items ?? []
    const first = items[0]
    return {
      ...base,
      estimated_minutes: null, // UV has no direct machine-time field
      machine_name: first?.machine_name ?? null,
      material_name: first?.material_name ?? null,
    }
  }

  // Default: 3D print.
  const parts: any[] = Array.isArray(quoteData?.printed_parts) ? quoteData.printed_parts : []
  const minutes = Math.round(parts.reduce((sum, p) => sum + (Number(p?.printing_time_hr) || 0) * 60, 0))
  const firstPart = parts[0]
  const printer = firstPart?.printer_id ? printers.find((p) => p.id === firstPart.printer_id) : undefined
  const firstFilId = firstPart?.filaments?.[0]?.filament_id ?? firstPart?.filament_id
  const fil = firstFilId ? filaments.find((f) => f.id === firstFilId) : undefined
  return {
    ...base,
    estimated_minutes: minutes || null,
    printer_id: firstPart?.printer_id ?? null,
    machine_name: printer?.name ?? null,
    material_name: fil?.name ?? null,
    material_color: fil?.color ?? null,
  }
}

/** Update a task's calc-derived fields after re-costing in the calculator. */
export async function applyTaskCalc(
  taskId: string,
  fields: Partial<OrderTask>,
): Promise<void> {
  await client().from("order_tasks").update({ ...fields, updated_at: now() }).eq("id", taskId)
}

export async function updateTask(id: string, patch: Partial<OrderTask>): Promise<void> {
  await client().from("order_tasks").update({ ...patch, updated_at: now() }).eq("id", id)
}

export async function setTaskStatus(task: OrderTask, status: OrderTask["status"]): Promise<void> {
  const patch: Partial<OrderTask> = { status, updated_at: now() }
  if (status === "running" && !task.started_at) patch.started_at = now()
  if (status === "completed") patch.completed_at = now()
  await updateTask(task.id, patch)
  if (status === "running") await logActivity(task.order_id, "task_started", `${task.name} started`)
  if (status === "completed") await logActivity(task.order_id, "task_completed", `${task.name} completed`)
}

export async function failTask(
  task: OrderTask,
  details: { reason?: FailureReason; notes?: string; wastedMinutes?: number; wastedMaterialG?: number },
): Promise<void> {
  await updateTask(task.id, {
    status: "failed",
    failure_reason: details.reason ?? "other",
    failure_notes: details.notes ?? null,
    wasted_minutes: details.wastedMinutes ?? null,
    wasted_material_g: details.wastedMaterialG ?? null,
  })
  await logActivity(task.order_id, "task_failed", `${task.name} marked failed`, { reason: details.reason })
}

/** Create a retry attempt that preserves the failed one. */
export async function retryTask(task: OrderTask): Promise<OrderTask> {
  return createTaskRetry(task)
}

async function createTaskRetry(task: OrderTask): Promise<OrderTask> {
  const supabase = client()
  const row: OrderTask = {
    id: uid(),
    order_id: task.order_id,
    name: task.name,
    type: task.type,
    status: "pending",
    quantity: task.quantity,
    sequence: task.sequence,
    printer_id: task.printer_id ?? null,
    machine_name: task.machine_name ?? null,
    material_id: task.material_id ?? null,
    material_name: task.material_name ?? null,
    material_color: task.material_color ?? null,
    estimated_minutes: task.estimated_minutes ?? null,
    notes: task.notes ?? null,
    retry_of: task.id,
    attempt: (task.attempt ?? 1) + 1,
    created_at: now(),
  }
  await supabase.from("order_tasks").insert([row])
  await logActivity(task.order_id, "task_added", `Retry of ${task.name} (attempt ${row.attempt})`)
  return row
}

export async function deleteTask(task: OrderTask): Promise<void> {
  await client().from("order_tasks").delete().eq("id", task.id)
}

/** Recompute and store the order's aggregate estimated minutes from its tasks. */
export async function refreshEstimatedTime(orderId: string): Promise<void> {
  const tasks = await listTasks(orderId)
  const minutes = aggregateEstimatedMinutes(tasks)
  await client().from("orders").update({ estimated_minutes: minutes || null }).eq("id", orderId)
}

/**
 * Recompute the order's derived fields from its production tasks: estimated
 * time, internal cost, and — the headline — its Total as the SUM of each task's
 * price (non-cancelled tasks).
 *
 * The total only takes over from a quote/manual snapshot once tasks carry a
 * price (priceSum > 0), or once the order is already task-priced. That way a
 * freshly-converted quote keeps its quoted total until you start pricing tasks,
 * and clearing task prices later still zeroes a task-priced order.
 */
export async function syncOrderFromTasks(orderId: string): Promise<void> {
  const supabase = client()
  const [tasks, order] = await Promise.all([listTasks(orderId), getOrder(orderId)])
  const active = tasks.filter((t) => t.status !== "cancelled")
  const minutes = active.reduce((s, t) => s + (Number(t.estimated_minutes) || 0), 0)
  const cost = round2(active.reduce((s, t) => s + (Number(t.estimated_cost) || 0), 0))
  const priceSum = round2(active.reduce((s, t) => s + (Number(t.price) || 0), 0))

  const patch: Partial<Order> = {
    estimated_minutes: minutes || null,
    estimated_cost: cost || null,
    updated_at: now(),
  }

  const taskDriven = priceSum > 0 || order?.pricing_source === "tasks"
  if (taskDriven) {
    const rate = Number(order?.vat_rate) || 0
    const subtotal = round2(priceSum / (1 + rate))
    patch.total = priceSum
    patch.subtotal = subtotal
    patch.vat_amount = round2(priceSum - subtotal)
    patch.pricing_source = "tasks"
  }
  await supabase.from("orders").update(patch).eq("id", orderId)
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function listNotes(orderId: string): Promise<OrderNote[]> {
  const { data } = await client()
    .from("order_notes")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
  return (data as OrderNote[]) ?? []
}

export async function addNote(orderId: string, content: string, pinned = false): Promise<OrderNote> {
  const row: OrderNote = {
    id: uid(),
    order_id: orderId,
    content: content.trim(),
    pinned,
    created_at: now(),
    updated_at: now(),
  }
  await client().from("order_notes").insert([row])
  await logActivity(orderId, "note_added", "Note added")
  return row
}

export async function updateNote(id: string, patch: Partial<OrderNote>): Promise<void> {
  await client().from("order_notes").update({ ...patch, updated_at: now() }).eq("id", id)
}

export async function deleteNote(id: string): Promise<void> {
  await client().from("order_notes").delete().eq("id", id)
}

// ---------------------------------------------------------------------------
// Attachments (metadata row + IndexedDB blob)
// ---------------------------------------------------------------------------

export async function listAttachments(orderId: string): Promise<OrderAttachment[]> {
  const { data } = await client()
    .from("order_attachments")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
  return (data as OrderAttachment[]) ?? []
}

/** Strip path separators and control chars from an untrusted filename. */
export function sanitizeFileName(name: string): string {
  return (name || "file")
    .replace(/[\\/]/g, "_")
    .replace(/[ -<>:"|?*]/g, "")
    .slice(0, 200)
    .trim() || "file"
}

export async function addAttachment(
  orderId: string,
  file: File,
  meta?: { category?: AttachmentCategory; description?: string },
): Promise<OrderAttachment> {
  const id = uid()
  const fileName = sanitizeFileName(file.name)
  // Persist bytes first; if this throws (quota), no metadata row is written, so
  // we never show an attachment whose blob is missing.
  await saveAttachmentBlob({
    id,
    orderId,
    file,
    name: fileName,
    type: file.type || "application/octet-stream",
  })
  const row: OrderAttachment = {
    id,
    order_id: orderId,
    file_name: fileName,
    display_name: fileName,
    mime_type: file.type || "application/octet-stream",
    size: file.size,
    category: meta?.category ?? "other",
    description: meta?.description ?? null,
    created_at: now(),
    updated_at: now(),
  }
  await client().from("order_attachments").insert([row])
  await logActivity(orderId, "file_uploaded", `"${fileName}" uploaded`)
  return row
}

export async function updateAttachment(id: string, patch: Partial<OrderAttachment>): Promise<void> {
  await client().from("order_attachments").update({ ...patch, updated_at: now() }).eq("id", id)
}

export async function deleteAttachment(attachment: OrderAttachment): Promise<void> {
  await deleteAttachmentBlob(attachment.id)
  await client().from("order_attachments").delete().eq("id", attachment.id)
  await logActivity(attachment.order_id, "file_deleted", `"${attachment.display_name || attachment.file_name}" deleted`)
}

// ---------------------------------------------------------------------------
// Quote links
// ---------------------------------------------------------------------------

export async function listQuoteLinks(orderId: string): Promise<OrderQuoteLink[]> {
  const { data } = await client()
    .from("order_quote_links")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })
  return (data as OrderQuoteLink[]) ?? []
}

export async function linkQuote(orderId: string, quote: Record<string, any>, makePrimary = false): Promise<void> {
  const supabase = client()
  const totals = quoteHeadlineTotals(quote)
  if (makePrimary) {
    const links = await listQuoteLinks(orderId)
    await Promise.all(links.map((l) => supabase.from("order_quote_links").update({ is_primary: false }).eq("id", l.id)))
  }
  await supabase.from("order_quote_links").insert([
    {
      id: uid(),
      order_id: orderId,
      quote_id: quote.id,
      is_primary: makePrimary,
      quoted_total: totals.total,
      quote_number: quote.quote_number ?? null,
      quote_name: quote.quote_name ?? null,
      created_at: now(),
    } as OrderQuoteLink,
  ])
  if (makePrimary) await supabase.from("orders").update({ primary_quote_id: quote.id }).eq("id", orderId)
  await logActivity(orderId, "quote_linked", `Linked quote ${quote.quote_number || quote.quote_name || quote.id}`)
}

export async function setPrimaryQuote(orderId: string, link: OrderQuoteLink): Promise<void> {
  const supabase = client()
  const links = await listQuoteLinks(orderId)
  await Promise.all(
    links.map((l) => supabase.from("order_quote_links").update({ is_primary: l.id === link.id }).eq("id", l.id)),
  )
  await supabase.from("orders").update({ primary_quote_id: link.quote_id }).eq("id", orderId)
}

export async function unlinkQuote(orderId: string, link: OrderQuoteLink): Promise<void> {
  const supabase = client()
  await supabase.from("order_quote_links").delete().eq("id", link.id)
  const order = await getOrder(orderId)
  if (order?.primary_quote_id === link.quote_id) {
    await supabase.from("orders").update({ primary_quote_id: null }).eq("id", orderId)
  }
  await logActivity(orderId, "quote_unlinked", `Unlinked quote ${link.quote_number || link.quote_id}`)
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function listInvoices(orderId: string): Promise<Invoice[]> {
  const { data } = await client()
    .from("invoices")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
  return (data as Invoice[]) ?? []
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const { data } = await client().from("invoices").select("*").eq("id", id).maybeSingle()
  return (data as Invoice) ?? null
}

export type CreateInvoiceInput = {
  orderId: string
  items: Array<{ description: string; quantity: number; unit_price: number }>
  vatRate: number
  dueDate?: string | null
  currencySymbol?: string
  externalReference?: string | null
  notes?: string | null
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  const supabase = client()
  const order = await getOrder(input.orderId)
  const invoice_number = await mintInvoiceNumber()
  const items: InvoiceItem[] = input.items.map((it) => ({
    id: uid(),
    description: it.description,
    quantity: Number(it.quantity) || 0,
    unit_price: Number(it.unit_price) || 0,
    amount: round2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)),
  }))
  const totals = computeInvoiceTotals(items, input.vatRate)
  const row: Invoice = {
    id: uid(),
    invoice_number,
    order_id: input.orderId,
    client_id: order?.client_id ?? null,
    client_snapshot: order?.client_snapshot ?? null,
    issue_date: now(),
    due_date: input.dueDate ?? null,
    items,
    subtotal: totals.subtotal,
    vat_rate: input.vatRate,
    vat_amount: totals.vatAmount,
    total: totals.total,
    currency_symbol: input.currencySymbol ?? order?.currency_symbol ?? "€",
    external_reference: input.externalReference ?? null,
    notes: input.notes ?? null,
    created_at: now(),
    updated_at: now(),
  }
  await supabase.from("invoices").insert([row])
  await logActivity(input.orderId, "invoice_created", `Invoice ${invoice_number} created`)
  return row
}

export async function updateInvoice(id: string, patch: Partial<Invoice>): Promise<void> {
  await client().from("invoices").update({ ...patch, updated_at: now() }).eq("id", id)
}

export async function voidInvoice(invoice: Invoice): Promise<void> {
  await updateInvoice(invoice.id, { voided_at: now() })
}

export async function deleteInvoice(invoice: Invoice): Promise<void> {
  await client().from("invoices").delete().eq("id", invoice.id)
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function listPayments(orderId: string): Promise<Payment[]> {
  const { data } = await client()
    .from("payments")
    .select("*")
    .eq("order_id", orderId)
    .order("paid_at", { ascending: false })
  return (data as Payment[]) ?? []
}

export type AddPaymentInput = {
  orderId: string
  invoiceId?: string | null
  amount: number
  method: Payment["method"]
  paidAt?: string
  reference?: string | null
  note?: string | null
  isRefund?: boolean
}

export async function addPayment(input: AddPaymentInput): Promise<Payment> {
  const row: Payment = {
    id: uid(),
    order_id: input.orderId,
    invoice_id: input.invoiceId ?? null,
    amount: round2(Math.abs(Number(input.amount) || 0)),
    method: input.method,
    paid_at: input.paidAt ?? now(),
    reference: input.reference ?? null,
    note: input.note ?? null,
    is_refund: input.isRefund ?? false,
    created_at: now(),
  }
  await client().from("payments").insert([row])
  await logActivity(
    input.orderId,
    "payment_recorded",
    `${input.isRefund ? "Refund" : "Payment"} recorded: ${row.amount.toFixed(2)}`,
  )
  return row
}

export async function deletePayment(payment: Payment): Promise<void> {
  await client().from("payments").delete().eq("id", payment.id)
}

// Re-export labels commonly needed alongside these services.
export { taskTypeLabel }
