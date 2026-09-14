import { describe, it, expect } from "vitest"
import {
  computeProgress,
  aggregateEstimatedMinutes,
  formatDuration,
  parseDurationToMinutes,
  computeAmountPaid,
  derivePaymentStatus,
  computeFinancials,
  computeInvoiceTotals,
  quoteHeadlineTotals,
  dueState,
  sortForQueue,
  nextQueuePosition,
  round2,
  taskVatState,
  invoiceLinesFromTasks,
  taskExVatAmount,
  activeTasks,
  taskVatRate,
} from "@/lib/orders/compute"
import type { OrderTask, Payment } from "@/types/orders"
import { __test as numbering } from "@/lib/orders/numbering"

const task = (over: Partial<OrderTask>): OrderTask =>
  ({
    id: Math.random().toString(),
    order_id: "o1",
    name: "t",
    type: "3d_print",
    status: "pending",
    quantity: 1,
    sequence: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  }) as OrderTask

const payment = (amount: number, isRefund = false): Payment =>
  ({
    id: Math.random().toString(),
    order_id: "o1",
    amount,
    method: "cash",
    paid_at: "2026-01-01T00:00:00Z",
    is_refund: isRefund,
    created_at: "2026-01-01T00:00:00Z",
  }) as Payment

describe("order number formatting", () => {
  it("pads to four digits with year and prefix", () => {
    expect(numbering.formatNumber("ORD", 2026, 1)).toBe("ORD-2026-0001")
    expect(numbering.formatNumber("INV", 2026, 42)).toBe("INV-2026-0042")
    expect(numbering.formatNumber("ORD", 2026, 12345)).toBe("ORD-2026-12345")
  })

  it("falls back to current year for missing/invalid timestamps", () => {
    const y = new Date().getFullYear()
    expect(numbering.yearOf(null)).toBe(y)
    expect(numbering.yearOf("not-a-date")).toBe(y)
    expect(numbering.yearOf("2024-05-01T00:00:00Z")).toBe(2024)
  })
})

describe("computeProgress", () => {
  it("returns no-tasks state when empty", () => {
    expect(computeProgress([])).toEqual({ total: 0, completed: 0, fraction: 0, hasTasks: false })
  })

  it("counts completed over non-cancelled tasks", () => {
    const tasks = [
      task({ status: "completed" }),
      task({ status: "completed" }),
      task({ status: "running" }),
      task({ status: "cancelled" }), // excluded from the denominator
    ]
    const p = computeProgress(tasks)
    expect(p.total).toBe(3)
    expect(p.completed).toBe(2)
    expect(p.fraction).toBeCloseTo(2 / 3)
    expect(p.hasTasks).toBe(true)
  })
})

describe("estimated time", () => {
  it("sums non-cancelled task minutes", () => {
    const tasks = [
      task({ estimated_minutes: 260 }),
      task({ estimated_minutes: 75 }),
      task({ estimated_minutes: 999, status: "cancelled" }),
    ]
    expect(aggregateEstimatedMinutes(tasks)).toBe(335)
  })

  it("formats durations without fake precision", () => {
    expect(formatDuration(0)).toBe("—")
    expect(formatDuration(48)).toBe("48m")
    expect(formatDuration(60)).toBe("1h")
    expect(formatDuration(460)).toBe("7h 40m")
    expect(formatDuration(65)).toBe("1h 05m")
  })

  it("parses duration inputs", () => {
    expect(parseDurationToMinutes("")).toBeNull()
    expect(parseDurationToMinutes("90")).toBe(90)
    expect(parseDurationToMinutes("1.5h")).toBe(90)
    expect(parseDurationToMinutes("2h 15m")).toBe(135)
    expect(parseDurationToMinutes("45m")).toBe(45)
  })
})

describe("payments and financial status", () => {
  it("nets refunds against payments", () => {
    expect(computeAmountPaid([payment(50), payment(20), payment(10, true)])).toBe(60)
  })

  it("derives payment status across the lifecycle", () => {
    expect(derivePaymentStatus({ total: 0, paid: 0, hasInvoice: false })).toBe("not_invoiced")
    expect(derivePaymentStatus({ total: 100, paid: 0, hasInvoice: true })).toBe("unpaid")
    expect(derivePaymentStatus({ total: 100, paid: 40, hasInvoice: true })).toBe("partially_paid")
    expect(derivePaymentStatus({ total: 100, paid: 100, hasInvoice: true })).toBe("paid")
    expect(derivePaymentStatus({ total: 100, paid: 120, hasInvoice: true })).toBe("paid")
    expect(derivePaymentStatus({ total: 100, paid: 0, hasInvoice: false, invoiceVoided: true })).toBe("void")
  })

  it("computes outstanding balance", () => {
    const f = computeFinancials({ total: 120 }, [payment(50)], { hasInvoice: true })
    expect(f.total).toBe(120)
    expect(f.paid).toBe(50)
    expect(f.outstanding).toBe(70)
    expect(f.status).toBe("partially_paid")
  })
})

describe("invoice totals", () => {
  it("sums line items and applies VAT", () => {
    const t = computeInvoiceTotals(
      [
        { quantity: 2, unit_price: 10 },
        { quantity: 1, unit_price: 5.5 },
      ],
      0.23,
    )
    expect(t.subtotal).toBe(25.5)
    expect(t.vatAmount).toBe(5.87) // 25.5 * 0.23 = 5.865 -> 5.87
    expect(t.total).toBe(31.37)
  })
})

describe("quoteHeadlineTotals", () => {
  it("uses stored final_price (VAT-inclusive business) and backs out VAT", () => {
    const q = { quote_type: "business", vat_enabled: true, vat_rate: 0.23, final_price: 123 }
    const r = quoteHeadlineTotals(q)
    expect(r.total).toBe(123)
    expect(r.subtotal).toBe(100)
    expect(r.vat).toBe(23)
  })

  it("recomputes from landed cost and margin when final_price is absent", () => {
    // landed 70, margin 30% -> 70 / 0.7 = 100 ex-VAT, personal quote => no VAT
    const q = { quote_type: "personal", landed_cost: 70, selected_margin: "30" }
    const r = quoteHeadlineTotals(q)
    expect(r.total).toBeCloseTo(100)
    expect(r.vat).toBe(0)
  })

  it("adds emergency fee before margin-free total", () => {
    const q = { quote_type: "personal", landed_cost: 0, selected_margin: "0", is_emergency: true, emergency_fee: 10 }
    expect(quoteHeadlineTotals(q).total).toBe(10)
  })
})

describe("quoteHeadlineTotals VAT independence", () => {
  it("applies VAT for a single-mode quote with vat_enabled", () => {
    const q = { quote_type: "single", vat_enabled: true, vat_rate: 0.23, final_price: 123 }
    const r = quoteHeadlineTotals(q)
    expect(r.total).toBe(123)
    expect(r.subtotal).toBe(100)
    expect(r.vat).toBe(23)
  })
  it("charges no VAT for a dual-mode quote with vat disabled", () => {
    const q = { quote_type: "dual", vat_enabled: false, final_price: 100 }
    const r = quoteHeadlineTotals(q)
    expect(r.vat).toBe(0)
    expect(r.subtotal).toBe(100)
  })
})

describe("due-date intelligence", () => {
  // Local-frame times (no trailing Z) kept away from midnight so the day
  // classification is stable regardless of the runner's timezone.
  const now = new Date("2026-08-12T12:00:00")
  it("classifies relative to today", () => {
    expect(dueState(null, now)).toBe("none")
    expect(dueState("2026-08-10T12:00:00", now)).toBe("overdue")
    expect(dueState("2026-08-12T18:00:00", now)).toBe("today")
    expect(dueState("2026-08-13T09:00:00", now)).toBe("tomorrow")
    expect(dueState("2026-08-15T09:00:00", now)).toBe("soon")
    expect(dueState("2026-09-01T09:00:00", now)).toBe("normal")
  })
})

describe("queue ordering", () => {
  it("orders by queue_position, then priority, then age", () => {
    const orders = [
      { queue_position: 1, priority: "normal" as const, created_at: "2026-01-02" },
      { queue_position: 0, priority: "low" as const, created_at: "2026-01-03" },
      { queue_position: 1, priority: "urgent" as const, created_at: "2026-01-01" },
    ]
    const sorted = sortForQueue(orders)
    expect(sorted[0].queue_position).toBe(0)
    // Tie on position 1 -> urgent beats normal
    expect(sorted[1].priority).toBe("urgent")
    expect(sorted[2].priority).toBe("normal")
  })

  it("computes the next queue position", () => {
    expect(nextQueuePosition([])).toBe(0)
    expect(nextQueuePosition([{ queue_position: 0 }, { queue_position: 3 }])).toBe(4)
  })
})

describe("round2", () => {
  it("rounds to cents", () => {
    expect(round2(5.865)).toBe(5.87)
    expect(round2(0.1 + 0.2)).toBe(0.3)
  })
})

// Task-derived invoice lines (Task 4)

const taskForVat = (over: any): OrderTask =>
  ({
    id: over.id ?? "t",
    order_id: "o",
    name: over.name ?? "Task",
    type: "3d_print",
    status: over.status ?? "queued",
    quantity: over.quantity ?? 1,
    sequence: 0,
    price: over.price ?? null,
    calc_payload: over.calc_payload ?? null,
    created_at: "",
  }) as OrderTask

describe("taskVatState", () => {
  it("classifies all/none/mixed/empty, ignoring cancelled tasks", () => {
    expect(taskVatState([])).toBe("empty")
    expect(taskVatState([taskForVat({ calc_payload: { vat_enabled: true } })])).toBe("all")
    expect(taskVatState([taskForVat({ calc_payload: { vat_enabled: false } })])).toBe("none")
    expect(taskVatState([taskForVat({ calc_payload: {} })])).toBe("none")
    expect(
      taskVatState([
        taskForVat({ id: "a", calc_payload: { vat_enabled: true } }),
        taskForVat({ id: "b", calc_payload: { vat_enabled: false } }),
      ]),
    ).toBe("mixed")
    expect(
      taskVatState([
        taskForVat({ id: "a", calc_payload: { vat_enabled: true } }),
        taskForVat({ id: "b", status: "cancelled", calc_payload: { vat_enabled: false } }),
      ]),
    ).toBe("all")
  })
})

describe("invoiceLinesFromTasks + computeInvoiceTotals", () => {
  it("does not double-charge VAT: a €100 VAT-inclusive task yields an €81.30 line", () => {
    const tasks = [taskForVat({ price: 100, quantity: 1, calc_payload: { vat_enabled: true, vat_rate: 0.23 } })]
    const lines = invoiceLinesFromTasks(tasks)
    expect(lines[0].amount).toBe(81.3) // 100 / 1.23 = 81.300... -> 81.30
    const totals = computeInvoiceTotals(lines, 0.23)
    expect(totals.subtotal).toBe(81.3)
    expect(totals.total).toBe(100.0) // 81.30 * 1.23 = 99.999 -> 100.00
  })

  it("passes ex-VAT task prices straight through", () => {
    const tasks = [taskForVat({ price: 50, quantity: 2, calc_payload: { vat_enabled: false } })]
    const lines = invoiceLinesFromTasks(tasks)
    expect(lines[0].amount).toBe(50)
    expect(lines[0].unit_price).toBe(25)
  })

  it("keeps item subtotal equal to the stored invoice subtotal (rounding + zero qty)", () => {
    const tasks = [
      taskForVat({ id: "a", price: 33.337, quantity: 3, calc_payload: { vat_enabled: false } }),
      taskForVat({ id: "b", price: 0, quantity: 0, calc_payload: { vat_enabled: false } }),
    ]
    const lines = invoiceLinesFromTasks(tasks)
    const totals = computeInvoiceTotals(lines, 0.23)
    const sumLines = lines.reduce((s, l) => s + l.amount, 0)
    expect(totals.subtotal).toBe(Math.round((sumLines + Number.EPSILON) * 100) / 100)
  })

  it("normalises a mixed set to ex-VAT per task's own rate", () => {
    const tasks = [
      taskForVat({ id: "a", price: 123, quantity: 1, calc_payload: { vat_enabled: true, vat_rate: 0.23 } }),
      taskForVat({ id: "b", price: 40, quantity: 1, calc_payload: { vat_enabled: false } }),
    ]
    const lines = invoiceLinesFromTasks(tasks)
    expect(lines[0].amount).toBe(100) // 123 / 1.23
    expect(lines[1].amount).toBe(40)
  })
})

describe("activeTasks", () => {
  it("drops cancelled tasks", () => {
    expect(activeTasks([taskForVat({ id: "a" }), taskForVat({ id: "b", status: "cancelled" })]).map((t) => t.id)).toEqual(["a"])
  })
})

describe("taskVatRate", () => {
  it("returns uniform VAT rate across all VAT-charging active tasks", () => {
    const tasks = [
      taskForVat({ id: "a", calc_payload: { vat_enabled: true, vat_rate: 0.23 } }),
      taskForVat({ id: "b", calc_payload: { vat_enabled: true, vat_rate: 0.23 } }),
    ]
    expect(taskVatRate(tasks)).toBe(0.23)
  })

  it("returns null when VAT rates differ across tasks", () => {
    const tasks = [
      taskForVat({ id: "a", calc_payload: { vat_enabled: true, vat_rate: 0.23 } }),
      taskForVat({ id: "b", calc_payload: { vat_enabled: true, vat_rate: 0.19 } }),
    ]
    expect(taskVatRate(tasks)).toBeNull()
  })

  it("returns null when no active tasks charge VAT", () => {
    const tasks = [
      taskForVat({ id: "a", calc_payload: { vat_enabled: false } }),
      taskForVat({ id: "b", calc_payload: { vat_enabled: false } }),
    ]
    expect(taskVatRate(tasks)).toBeNull()
  })

  it("ignores cancelled VAT tasks when determining uniform rate", () => {
    const tasks = [
      taskForVat({ id: "a", calc_payload: { vat_enabled: true, vat_rate: 0.23 } }),
      taskForVat({ id: "b", status: "cancelled", calc_payload: { vat_enabled: true, vat_rate: 0.19 } }),
    ]
    expect(taskVatRate(tasks)).toBe(0.23)
  })
})

import { buildInvoiceLines } from "./compute"

const t = (over: any) => ({
  id: over.id ?? "t", order_id: "o", name: over.name ?? "Task", type: "3d_print" as const,
  status: over.status ?? "queued", quantity: over.quantity ?? 1, sequence: 0,
  price: over.price ?? null, calc_payload: over.calc_payload ?? null, created_at: "",
  material_name: over.material_name ?? null,
})

describe("buildInvoiceLines", () => {
  const tasks = [
    t({ id: "a", name: "Print body", price: 100, quantity: 2, calc_payload: { vat_enabled: false } }),
    t({ id: "b", name: "Engrave lid", price: 50, quantity: 1, calc_payload: { vat_enabled: false } }),
  ]

  it("detailed = one line per task", () => {
    const lines = buildInvoiceLines({ tasks, format: "detailed", orderTitle: "Order X" })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ description: "Print body", quantity: 2, amount: 100 })
    expect(lines[1]).toMatchObject({ description: "Engrave lid", quantity: 1, amount: 50 })
  })

  it("simple = one combined line summing ex-VAT task amounts", () => {
    const lines = buildInvoiceLines({ tasks, format: "simple", orderTitle: "Order X" })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ description: "Order X", quantity: 1, unit_price: 150, amount: 150 })
  })

  it("adds a separate shipping line when included", () => {
    const detailed = buildInvoiceLines({ tasks, format: "detailed", orderTitle: "Order X", shipping: { include: true, cost: 12.5 } })
    expect(detailed).toHaveLength(3)
    expect(detailed[2]).toMatchObject({ description: "Shipping", quantity: 1, unit_price: 12.5, amount: 12.5 })
    const simple = buildInvoiceLines({ tasks, format: "simple", orderTitle: "Order X", shipping: { include: true, cost: 12.5 } })
    expect(simple).toHaveLength(2) // one combined task line + shipping
    expect(simple[1].description).toBe("Shipping")
  })

  it("omits shipping when not included or zero", () => {
    expect(buildInvoiceLines({ tasks, format: "simple", orderTitle: "X", shipping: { include: false, cost: 12.5 } })).toHaveLength(1)
    expect(buildInvoiceLines({ tasks, format: "simple", orderTitle: "X", shipping: { include: true, cost: 0 } })).toHaveLength(1)
  })

  it("excludes cancelled tasks even if passed in", () => {
    const withCancelled = [...tasks, t({ id: "c", name: "Void", price: 999, status: "cancelled", calc_payload: { vat_enabled: false } })]
    expect(buildInvoiceLines({ tasks: withCancelled, format: "detailed", orderTitle: "X" })).toHaveLength(2)
    expect(buildInvoiceLines({ tasks: withCancelled, format: "simple", orderTitle: "X" })[0].amount).toBe(150)
  })

  it("no tasks + shipping only = shipping line only", () => {
    expect(buildInvoiceLines({ tasks: [], format: "simple", orderTitle: "X", shipping: { include: true, cost: 5 } }))
      .toEqual([{ description: "Shipping", quantity: 1, unit_price: 5, amount: 5 }])
  })

  it("no active tasks + orderFallback = a single order-total line", () => {
    const lines = buildInvoiceLines({
      tasks: [],
      format: "simple",
      orderTitle: "Order X",
      orderFallback: { include: true, amount: 80 },
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ description: "Order X", quantity: 1, amount: 80 })
  })

  it("orderFallback is ignored when tasks are present", () => {
    const lines = buildInvoiceLines({
      tasks,
      format: "simple",
      orderTitle: "Order X",
      orderFallback: { include: true, amount: 80 },
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ description: "Order X", quantity: 1, amount: 150 })
  })
})
