// Centralized, type-safe metadata for order/task statuses and priorities.
//
// Every part of the Orders UI reads labels, colours, ordering and board layout
// from here so the vocabulary is defined exactly once (spec: "Make status
// handling centralized and type-safe so statuses are not hard-coded differently
// throughout the application").
//
// Colours are expressed as Tailwind utility class fragments using the app's
// theme tokens / a restrained fixed palette — never a rainbow. Badges compose
// `text-*`, `bg-*`, `border-*` from these entries.

import type {
  OrderStatus,
  OrderPriority,
  OrderTaskStatus,
  OrderTaskType,
  PaymentStatus,
  PaymentMethod,
  FulfilmentType,
  AttachmentCategory,
  FailureReason,
} from "@/types/orders"

export type StatusMeta<T extends string> = {
  value: T
  label: string
  /** Tailwind classes for a subtle badge (bg + text + border). */
  badge: string
  /** Solid dot / accent colour class for compact indicators. */
  dot: string
}

// ---------------------------------------------------------------------------
// Order statuses
// ---------------------------------------------------------------------------

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta<OrderStatus>> = {
  draft: {
    value: "draft",
    label: "Draft",
    badge: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground/50",
  },
  awaiting_approval: {
    value: "awaiting_approval",
    label: "Awaiting Approval",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25",
    dot: "bg-amber-500",
  },
  queued: {
    value: "queued",
    label: "Queued",
    badge: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/25",
    dot: "bg-sky-500",
  },
  in_production: {
    value: "in_production",
    label: "In Production",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/25",
    dot: "bg-blue-500",
  },
  post_processing: {
    value: "post_processing",
    label: "Post Processing",
    badge: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/25",
    dot: "bg-violet-500",
  },
  ready: {
    value: "ready",
    label: "Ready",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
    dot: "bg-emerald-500",
  },
  completed: {
    value: "completed",
    label: "Completed",
    badge: "bg-teal-600/10 text-teal-700 dark:text-teal-400 border-teal-600/25",
    dot: "bg-teal-600",
  },
  on_hold: {
    value: "on_hold",
    label: "On Hold",
    badge: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/25",
    dot: "bg-orange-500",
  },
  cancelled: {
    value: "cancelled",
    label: "Cancelled",
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/25",
    dot: "bg-rose-500",
  },
}

/** All statuses in lifecycle order. */
export const ORDER_STATUSES: OrderStatus[] = [
  "draft",
  "awaiting_approval",
  "queued",
  "in_production",
  "post_processing",
  "ready",
  "completed",
  "on_hold",
  "cancelled",
]

/**
 * The columns shown on the main Kanban board. Draft / On Hold / Cancelled are
 * deliberately excluded — they're reached via filters so the board stays a
 * clean production pipeline.
 */
export const BOARD_COLUMNS: OrderStatus[] = [
  "awaiting_approval",
  "queued",
  "in_production",
  "post_processing",
  "ready",
  "completed",
]

/** Statuses that count as "off the active pipeline". */
const INACTIVE_STATUSES = new Set<OrderStatus>(["completed", "cancelled", "on_hold", "draft"])

export function isActiveStatus(status: OrderStatus): boolean {
  return !INACTIVE_STATUSES.has(status)
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return status === "completed" || status === "cancelled"
}

export function orderStatusLabel(status: OrderStatus | string | null | undefined): string {
  if (!status) return "Unknown"
  return ORDER_STATUS_META[status as OrderStatus]?.label ?? String(status)
}

// ---------------------------------------------------------------------------
// Priorities
// ---------------------------------------------------------------------------

export const ORDER_PRIORITY_META: Record<
  OrderPriority,
  StatusMeta<OrderPriority> & { rank: number }
> = {
  low: {
    value: "low",
    label: "Low",
    rank: 0,
    badge: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground/40",
  },
  normal: {
    value: "normal",
    label: "Normal",
    rank: 1,
    badge: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20",
    dot: "bg-slate-400",
  },
  high: {
    value: "high",
    label: "High",
    rank: 2,
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25",
    dot: "bg-amber-500",
  },
  urgent: {
    value: "urgent",
    label: "Urgent",
    rank: 3,
    badge: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    dot: "bg-red-500",
  },
}

export const ORDER_PRIORITIES: OrderPriority[] = ["low", "normal", "high", "urgent"]

export function priorityRank(priority: OrderPriority | string | null | undefined): number {
  return ORDER_PRIORITY_META[priority as OrderPriority]?.rank ?? 1
}

export function orderPriorityLabel(priority: OrderPriority | string | null | undefined): string {
  if (!priority) return "Normal"
  return ORDER_PRIORITY_META[priority as OrderPriority]?.label ?? String(priority)
}

// ---------------------------------------------------------------------------
// Task statuses & types
// ---------------------------------------------------------------------------

export const TASK_STATUS_META: Record<OrderTaskStatus, StatusMeta<OrderTaskStatus>> = {
  pending: {
    value: "pending",
    label: "Pending",
    badge: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground/40",
  },
  ready: {
    value: "ready",
    label: "Ready",
    badge: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/25",
    dot: "bg-sky-500",
  },
  running: {
    value: "running",
    label: "Running",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/25",
    dot: "bg-blue-500",
  },
  paused: {
    value: "paused",
    label: "Paused",
    badge: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/25",
    dot: "bg-orange-500",
  },
  failed: {
    value: "failed",
    label: "Failed",
    badge: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25",
    dot: "bg-red-500",
  },
  completed: {
    value: "completed",
    label: "Completed",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
    dot: "bg-emerald-500",
  },
  cancelled: {
    value: "cancelled",
    label: "Cancelled",
    badge: "bg-muted text-muted-foreground border-border line-through",
    dot: "bg-muted-foreground/40",
  },
}

export const TASK_STATUSES: OrderTaskStatus[] = [
  "pending",
  "ready",
  "running",
  "paused",
  "failed",
  "completed",
  "cancelled",
]

export function taskStatusLabel(status: OrderTaskStatus | string | null | undefined): string {
  if (!status) return "Pending"
  return TASK_STATUS_META[status as OrderTaskStatus]?.label ?? String(status)
}

/** A task counts toward completion progress unless it was cancelled. */
export function taskCountsForProgress(status: OrderTaskStatus): boolean {
  return status !== "cancelled"
}

export function isTaskDone(status: OrderTaskStatus): boolean {
  return status === "completed"
}

export const TASK_TYPE_LABELS: Record<OrderTaskType, string> = {
  "3d_print": "3D Print",
  laser_cut: "Laser Cut",
  laser_engrave: "Laser Engrave",
  uv_print: "UV Print",
  design: "Design",
  post_processing: "Post Processing",
  assembly: "Assembly",
  packaging: "Packaging",
  delivery: "Delivery",
  other: "Other",
}

export const TASK_TYPES: OrderTaskType[] = [
  "3d_print",
  "laser_cut",
  "laser_engrave",
  "uv_print",
  "design",
  "post_processing",
  "assembly",
  "packaging",
  "delivery",
  "other",
]

export function taskTypeLabel(type: OrderTaskType | string | null | undefined): string {
  if (!type) return "Other"
  return TASK_TYPE_LABELS[type as OrderTaskType] ?? String(type)
}

/** Which calculator (if any) can cost a task of this type. */
export type CalcKind = "3d" | "laser" | "uv"

export function calcKindForTaskType(type: OrderTaskType | string | null | undefined): CalcKind | null {
  switch (type) {
    case "3d_print":
      return "3d"
    case "laser_cut":
    case "laser_engrave":
      return "laser"
    case "uv_print":
      return "uv"
    default:
      // Design / assembly / packaging / delivery / post-processing / other are
      // labor/manual — nothing for a machine calculator to compute.
      return null
  }
}

export const CALC_KIND_LABEL: Record<CalcKind, string> = {
  "3d": "3D print",
  laser: "laser",
  uv: "UV print",
}

// ---------------------------------------------------------------------------
// Payment status & methods
// ---------------------------------------------------------------------------

export const PAYMENT_STATUS_META: Record<PaymentStatus, StatusMeta<PaymentStatus>> = {
  not_invoiced: {
    value: "not_invoiced",
    label: "Not Invoiced",
    badge: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground/40",
  },
  unpaid: {
    value: "unpaid",
    label: "Unpaid",
    badge: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25",
    dot: "bg-red-500",
  },
  partially_paid: {
    value: "partially_paid",
    label: "Partially Paid",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25",
    dot: "bg-amber-500",
  },
  paid: {
    value: "paid",
    label: "Paid",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
    dot: "bg-emerald-500",
  },
  refunded: {
    value: "refunded",
    label: "Refunded",
    badge: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/25",
    dot: "bg-violet-500",
  },
  void: {
    value: "void",
    label: "Void",
    badge: "bg-muted text-muted-foreground border-border line-through",
    dot: "bg-muted-foreground/40",
  },
}

export function paymentStatusLabel(status: PaymentStatus | string | null | undefined): string {
  if (!status) return "Not Invoiced"
  return PAYMENT_STATUS_META[status as PaymentStatus]?.label ?? String(status)
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank Transfer",
  mbway: "MB Way",
  paypal: "PayPal",
  other: "Other",
}

export const PAYMENT_METHODS: PaymentMethod[] = ["cash", "card", "bank_transfer", "mbway", "paypal", "other"]

export function paymentMethodLabel(method: PaymentMethod | string | null | undefined): string {
  if (!method) return "Other"
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? String(method)
}

// ---------------------------------------------------------------------------
// Fulfilment, attachment categories, failure reasons
// ---------------------------------------------------------------------------

export const FULFILMENT_LABELS: Record<FulfilmentType, string> = {
  pickup: "Customer Pickup",
  local_delivery: "Local Delivery",
  shipping: "Shipping",
  digital: "Digital / Other",
}

export const FULFILMENT_TYPES: FulfilmentType[] = ["pickup", "local_delivery", "shipping", "digital"]

export function fulfilmentLabel(type: FulfilmentType | string | null | undefined): string {
  if (!type) return "—"
  return FULFILMENT_LABELS[type as FulfilmentType] ?? String(type)
}

export const ATTACHMENT_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  customer: "Customer File",
  production: "Production File",
  reference: "Reference",
  artwork: "Artwork",
  model: "Model",
  invoice: "Invoice",
  other: "Other",
}

export const ATTACHMENT_CATEGORIES: AttachmentCategory[] = [
  "customer",
  "production",
  "reference",
  "artwork",
  "model",
  "invoice",
  "other",
]

export function attachmentCategoryLabel(category: AttachmentCategory | string | null | undefined): string {
  if (!category) return "Other"
  return ATTACHMENT_CATEGORY_LABELS[category as AttachmentCategory] ?? String(category)
}

export const FAILURE_REASON_LABELS: Record<FailureReason, string> = {
  adhesion: "Adhesion",
  filament: "Filament issue",
  machine: "Machine issue",
  power: "Power failure",
  quality: "Quality issue",
  design: "Customer / design issue",
  other: "Other",
}

export const FAILURE_REASONS: FailureReason[] = [
  "adhesion",
  "filament",
  "machine",
  "power",
  "quality",
  "design",
  "other",
]

export function failureReasonLabel(reason: FailureReason | string | null | undefined): string {
  if (!reason) return "Other"
  return FAILURE_REASON_LABELS[reason as FailureReason] ?? String(reason)
}
