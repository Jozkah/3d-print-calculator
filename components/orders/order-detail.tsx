"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  MoreHorizontal,
  Copy,
  Archive,
  ArchiveRestore,
  Ban,
  Trash2,
  RotateCcw,
  CheckCircle2,
  User,
  Clock,
  CalendarClock,
  Wallet,
  Layers,
  Pencil,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DialogCustom } from "@/components/ui/dialog-custom"
import { useToast } from "@/hooks/use-toast"
import { SiteHeader } from "@/components/site-header"
import { formatMoney } from "@/lib/format"
import { formatDuration, computeProgress, computeFinancials, dueState } from "@/lib/orders/compute"
import {
  ORDER_STATUSES,
  ORDER_STATUS_META,
  ORDER_PRIORITIES,
  ORDER_PRIORITY_META,
  paymentStatusLabel,
  orderStatusLabel,
} from "@/lib/orders/status"
import type { OrderStatus, OrderPriority } from "@/types/orders"
import { StatusBadge, PriorityBadge, PaymentBadge, DueIndicator } from "@/components/orders/order-badges"
import { useOrderDetail } from "@/lib/orders/use-order-detail"
import { PageLoading, PageLoadError } from "@/components/page-loading"
import { OrderTasksPanel } from "@/components/orders/order-tasks-panel"
import { OrderNotesPanel } from "@/components/orders/order-notes-panel"
import { OrderFilesPanel } from "@/components/orders/order-files-panel"
import { OrderFinancialsPanel } from "@/components/orders/order-financials-panel"
import { OrderActivityPanel } from "@/components/orders/order-activity-panel"
import {
  setOrderStatus,
  setOrderPriority,
  setOrderDueDate,
  updateOrder,
  archiveOrder,
  unarchiveOrder,
  cancelOrder,
  reopenOrder,
  completeOrder,
  duplicateOrder,
  deleteOrderDeep,
} from "@/lib/orders/data"

export function OrderDetail({ orderId }: { orderId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const detail = useOrderDetail(orderId)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")

  if (!detail.loaded) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader active="/orders" />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <PageLoading />
        </main>
      </div>
    )
  }

  if (detail.notFound || !detail.order) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader active="/orders" />
        <main className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h1 className="text-lg font-semibold text-foreground">Order not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">It may have been deleted.</p>
          <Button asChild className="mt-5">
            <Link href="/orders">Back to Orders</Link>
          </Button>
        </main>
      </div>
    )
  }

  if (detail.error) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader active="/orders" />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <PageLoadError message={detail.error} />
        </main>
      </div>
    )
  }

  const order = detail.order
  const currency = order.currency_symbol || "€"
  const progress = computeProgress(detail.tasks)
  const hasInvoice = detail.invoices.length > 0
  const invoiceVoided = hasInvoice && detail.invoices.every((i) => i.voided_at)
  const fin = computeFinancials(order, detail.payments, { hasInvoice, invoiceVoided })
  const estMinutes = order.estimated_minutes ?? 0
  const defaultVat = detail.settings?.vat_rate ?? 0.23

  async function handleComplete() {
    if (progress.hasTasks && progress.completed < progress.total) {
      const remaining = progress.total - progress.completed
      if (!window.confirm(`${remaining} production task${remaining === 1 ? " is" : "s are"} still incomplete. Complete the order anyway?`)) {
        return
      }
    }
    await completeOrder(order)
    detail.reload()
    toast({ title: "Order completed" })
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/orders" />

      {/* Header */}
      <div className="border-b border-border/70 bg-card">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link href="/orders" className="font-mono text-xs text-muted-foreground hover:text-foreground">
                  ← {order.order_number}
                </Link>
                {order.archived_at && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">archived</span>
                )}
              </div>
              <div className="group mt-1 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  title="Rename order"
                  className="min-w-0 text-left"
                >
                  <h1 className="truncate text-xl font-bold tracking-tight text-foreground hover:text-primary sm:text-2xl">
                    {order.title}
                  </h1>
                </button>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  title="Edit order"
                  className="shrink-0 rounded p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-4" />
                </button>
              </div>
              {order.client_snapshot?.name && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <User className="size-3.5" />
                  {order.client_id ? (
                    <Link href="/settings/clients" className="hover:text-foreground">
                      {order.client_snapshot.name}
                    </Link>
                  ) : (
                    order.client_snapshot.name
                  )}
                  {order.client_snapshot.email && <span className="text-muted-foreground/70">· {order.client_snapshot.email}</span>}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Status changer */}
              <Select value={order.status} onValueChange={(v) => setOrderStatus(order, v as OrderStatus).then(detail.reload)}>
                <SelectTrigger className="h-9 w-[170px] bg-card" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ORDER_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={handleComplete} disabled={order.status === "completed"}>
                <CheckCircle2 className="size-4" />
                <span className="hidden sm:inline">Complete</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    <Layers className="size-4" /> Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      const copy = await duplicateOrder(order.id)
                      if (copy) router.push(`/orders/${copy.id}`)
                    }}
                  >
                    <Copy className="size-4" /> Duplicate
                  </DropdownMenuItem>
                  {order.status === "completed" && (
                    <DropdownMenuItem onClick={() => reopenOrder(order).then(detail.reload)}>
                      <RotateCcw className="size-4" /> Reopen
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {order.archived_at ? (
                    <DropdownMenuItem onClick={() => unarchiveOrder(order).then(detail.reload)}>
                      <ArchiveRestore className="size-4" /> Unarchive
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => archiveOrder(order).then(detail.reload)}>
                      <Archive className="size-4" /> Archive
                    </DropdownMenuItem>
                  )}
                  {order.status !== "cancelled" && (
                    <DropdownMenuItem onClick={() => setCancelOpen(true)}>
                      <Ban className="size-4" /> Cancel order
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="size-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {order.cancel_reason && (
            <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">Cancelled — {order.cancel_reason}</p>
          )}

          {/* Summary strip */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <SummaryCell icon={<StatusBadge status={order.status} />} label="Status" />
            <SummaryCell icon={<PriorityBadge priority={order.priority} />} label="Priority" />
            <SummaryCell
              icon={<DueIndicator dueDate={order.due_date} showOnTrack />}
              fallback="No due date"
              label="Due"
              iconEl={<CalendarClock className="size-3.5" />}
            />
            <SummaryCell
              value={estMinutes > 0 ? formatDuration(estMinutes) : "—"}
              label="Est. time"
              iconEl={<Clock className="size-3.5" />}
            />
            <SummaryCell
              value={order.total != null ? formatMoney(order.total, currency) : "—"}
              sub={paymentStatusLabel(fin.status)}
              label="Value"
              iconEl={<Wallet className="size-3.5" />}
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {order.description && (
              <section className="rounded-2xl border border-border bg-card px-4 py-3">
                <p className="whitespace-pre-wrap text-sm text-foreground">{order.description}</p>
              </section>
            )}
            <OrderTasksPanel orderId={order.id} tasks={detail.tasks} onChanged={detail.reload} />
            <OrderFilesPanel orderId={order.id} attachments={detail.attachments} onChanged={detail.reload} />
            <OrderNotesPanel orderId={order.id} notes={detail.notes} onChanged={detail.reload} />
          </div>

          <div className="space-y-4">
            <OrderFinancialsPanel
              order={order}
              invoices={detail.invoices}
              payments={detail.payments}
              quoteLinks={detail.quoteLinks}
              defaultVatRate={defaultVat}
              taskCount={detail.tasks.length}
              onChanged={detail.reload}
            />
            <OrderActivityPanel activity={detail.activity} />
          </div>
        </div>
      </main>

      <EditOrderDialog open={editOpen} onOpenChange={setEditOpen} order={order} onDone={detail.reload} />

      <DialogCustom
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          await deleteOrderDeep(order.id)
          router.push("/orders")
        }}
        title="Delete order"
        description={deleteWarning(detail)}
        confirmText="Delete permanently"
        cancelText="Cancel"
        variant="danger"
      />

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel order</DialogTitle>
            <DialogDescription>The order stays in history with its financials intact.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} className="bg-card" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await cancelOrder(order, cancelReason.trim() || undefined)
                setCancelOpen(false)
                detail.reload()
              }}
            >
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function deleteWarning(detail: ReturnType<typeof useOrderDetail>): string {
  const bits: string[] = []
  if (detail.attachments.length) bits.push(`${detail.attachments.length} file(s)`)
  if (detail.invoices.length) bits.push(`${detail.invoices.length} invoice(s)`)
  if (detail.payments.length) bits.push(`${detail.payments.length} payment(s)`)
  if (detail.quoteLinks.length) bits.push("linked quote(s)")
  if (detail.tasks.length) bits.push(`${detail.tasks.length} task(s)`)
  const base = "This permanently deletes the order and its file attachments."
  return bits.length ? `${base} It contains ${bits.join(", ")}. Consider archiving instead.` : `${base} Consider archiving instead.`
}

function SummaryCell({
  icon,
  iconEl,
  value,
  sub,
  label,
  fallback,
}: {
  icon?: React.ReactNode
  iconEl?: React.ReactNode
  value?: string
  sub?: string
  label: string
  fallback?: string
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background px-3 py-2">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {iconEl}
        {label}
      </div>
      <div className="mt-1 min-h-[20px]">
        {icon ?? (value ? <span className="text-sm font-semibold text-foreground">{value}</span> : <span className="text-sm text-muted-foreground">{fallback ?? "—"}</span>)}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

function EditOrderDialog({
  open,
  onOpenChange,
  order,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  order: ReturnType<typeof useOrderDetail>["order"]
  onDone: () => void
}) {
  const o = order!
  const [title, setTitle] = useState(o.title)
  const [description, setDescription] = useState(o.description ?? "")
  const [due, setDue] = useState(o.due_date ? o.due_date.slice(0, 10) : "")
  const [priority, setPriority] = useState<OrderPriority>(o.priority)
  const [tags, setTags] = useState((o.tags ?? []).join(", "))

  async function save() {
    await updateOrder(o.id, {
      title: title.trim() || o.title,
      description: description.trim() || null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    })
    if ((o.due_date ? o.due_date.slice(0, 10) : "") !== due) {
      await setOrderDueDate(o, due ? new Date(due).toISOString() : null)
    }
    if (o.priority !== priority) await setOrderPriority(o, priority)
    onOpenChange(false)
    onDone()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit order</DialogTitle>
          <DialogDescription>Update the order details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Order name</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-card" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="bg-card" />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as OrderPriority)}>
                <SelectTrigger className="bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {ORDER_PRIORITY_META[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="bg-card" />
          </div>
          <div className="space-y-1.5">
            <Label>Tags (comma-separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Prototype, Repeat, Website" className="bg-card" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
