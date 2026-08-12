"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Play,
  Pause,
  Check,
  X,
  RotateCcw,
  Plus,
  Trash2,
  AlertTriangle,
  CircleDot,
  Circle,
  CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import type { OrderTask, OrderTaskType, FailureReason } from "@/types/orders"
import {
  TASK_TYPES,
  TASK_TYPE_LABELS,
  FAILURE_REASONS,
  FAILURE_REASON_LABELS,
  taskTypeLabel,
  calcKindForTaskType,
  CALC_KIND_LABEL,
} from "@/lib/orders/status"
import { TaskStatusBadge } from "@/components/orders/order-badges"
import { formatDuration, parseDurationToMinutes, computeProgress } from "@/lib/orders/compute"
import { formatMoney } from "@/lib/format"
import { Calculator, Pencil } from "lucide-react"
import { TaskCalculatorDialog } from "@/components/orders/task-calculator-dialog"
import type { OrderTaskType as TaskTypeAlias } from "@/types/orders"
import {
  createTask,
  updateTask,
  setTaskStatus,
  failTask,
  retryTask,
  deleteTask,
  syncOrderFromTasks,
} from "@/lib/orders/data"
import { DecimalInput } from "@/components/ui/decimal-input"

type TaskCalcSeed = { name: string; type: TaskTypeAlias; quantity: number }

export function OrderTasksPanel({ orderId, tasks, onChanged }: { orderId: string; tasks: OrderTask[]; onChanged: () => void }) {
  const { toast } = useToast()
  const [printers, setPrinters] = useState<any[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [failFor, setFailFor] = useState<OrderTask | null>(null)
  const [calcSeed, setCalcSeed] = useState<TaskCalcSeed | null>(null)
  const [calcEdit, setCalcEdit] = useState<OrderTask | null>(null)
  const [editTask, setEditTask] = useState<OrderTask | null>(null)

  useEffect(() => {
    createClient()
      .from("printers")
      .select("*")
      .order("name")
      .then(({ data }) => setPrinters(data ?? []))
  }, [])

  const progress = computeProgress(tasks)

  async function afterChange() {
    // Recompute the order's time + total (sum of task prices) from its tasks.
    await syncOrderFromTasks(orderId)
    onChanged()
  }

  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Production</h3>
          {progress.hasTasks && (
            <span className="text-xs text-muted-foreground">
              {progress.completed} / {progress.total} done
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add task
        </Button>
      </header>

      {progress.hasTasks && (
        <div className="px-4 pt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round(progress.fraction * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="divide-y divide-border/60">
        {tasks.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No production tasks yet. Break the job into steps — print, laser, assemble, package…
          </p>
        )}
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onChanged={afterChange}
            onFail={() => setFailFor(task)}
            onEditCalc={() => setCalcEdit(task)}
            onEdit={() => setEditTask(task)}
            toast={toast}
          />
        ))}
      </div>

      <AddTaskDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        orderId={orderId}
        printers={printers}
        seq={tasks.length}
        onCreated={afterChange}
        onOpenCalc={(seed) => {
          setAddOpen(false)
          setCalcSeed(seed)
        }}
      />
      <FailTaskDialog key={failFor?.id ?? "none"} task={failFor} onClose={() => setFailFor(null)} onDone={afterChange} />

      {editTask && (
        <EditTaskDialog
          key={editTask.id}
          task={editTask}
          printers={printers}
          onClose={() => setEditTask(null)}
          onReCost={() => {
            const t = editTask
            setEditTask(null)
            setCalcEdit(t)
          }}
          onDone={afterChange}
        />
      )}

      {calcSeed && (
        <TaskCalculatorDialog
          open={!!calcSeed}
          onOpenChange={(o) => !o && setCalcSeed(null)}
          orderId={orderId}
          mode="create"
          seed={calcSeed}
          onDone={afterChange}
        />
      )}
      {calcEdit && (
        <TaskCalculatorDialog
          key={calcEdit.id}
          open={!!calcEdit}
          onOpenChange={(o) => !o && setCalcEdit(null)}
          orderId={orderId}
          mode="edit"
          task={calcEdit}
          onDone={afterChange}
        />
      )}
    </section>
  )
}

function TaskIcon({ status }: { status: OrderTask["status"] }) {
  if (status === "completed") return <CheckCircle2 className="size-4 text-emerald-500" />
  if (status === "running") return <CircleDot className="size-4 text-blue-500" />
  if (status === "failed") return <AlertTriangle className="size-4 text-red-500" />
  return <Circle className="size-4 text-muted-foreground/50" />
}

function TaskRow({
  task,
  onChanged,
  onFail,
  onEditCalc,
  onEdit,
  toast,
}: {
  task: OrderTask
  onChanged: () => void
  onFail: () => void
  onEditCalc: () => void
  onEdit: () => void
  toast: ReturnType<typeof useToast>["toast"]
}) {
  const meta: string[] = []
  if (task.machine_name || task.printer_id) meta.push(task.machine_name || "Machine")
  if (task.material_name) meta.push(task.material_name)
  if (task.quantity > 1) meta.push(`×${task.quantity}`)
  if (task.estimated_minutes) meta.push(formatDuration(task.estimated_minutes))
  if (task.price != null) meta.push(formatMoney(task.price))
  if ((task.attempt ?? 1) > 1) meta.push(`attempt ${task.attempt}`)

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn()
      onChanged()
    } catch (e: unknown) {
      toast({ title: "Task update failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" })
    }
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5">
        <TaskIcon status={task.status} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-sm font-medium text-foreground", task.status === "cancelled" && "line-through")}>
            {task.name}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {taskTypeLabel(task.type)}
          </span>
          <TaskStatusBadge status={task.status} />
        </div>
        {meta.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{meta.join(" · ")}</p>}
        {task.status === "failed" && task.failure_reason && (
          <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">
            {FAILURE_REASON_LABELS[task.failure_reason as FailureReason] ?? task.failure_reason}
            {task.failure_notes ? ` — ${task.failure_notes}` : ""}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {task.status !== "completed" && task.status !== "cancelled" && task.status !== "failed" && (
          <>
            {task.status === "running" ? (
              <Button size="icon-sm" variant="ghost" title="Pause" onClick={() => act(() => setTaskStatus(task, "paused"))}>
                <Pause className="size-4" />
              </Button>
            ) : (
              <Button size="icon-sm" variant="ghost" title="Start" onClick={() => act(() => setTaskStatus(task, "running"))}>
                <Play className="size-4 text-blue-500" />
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              title="Complete"
              onClick={() => act(() => setTaskStatus(task, "completed"))}
            >
              <Check className="size-4 text-emerald-500" />
            </Button>
          </>
        )}
        {task.status === "failed" && (
          <Button size="icon-sm" variant="ghost" title="Retry" onClick={() => act(() => retryTask(task))}>
            <RotateCcw className="size-4 text-blue-500" />
          </Button>
        )}
        {(task.calc_payload || calcKindForTaskType(task.type)) && (
          <Button
            size="icon-sm"
            variant="ghost"
            title={task.calc_payload ? "Re-cost in calculator" : "Cost in calculator"}
            onClick={onEditCalc}
          >
            <Calculator className={cn("size-4", task.calc_payload ? "text-primary" : "text-muted-foreground")} />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" title="More">
              <span className="text-lg leading-none">⋯</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="size-4" /> Edit details
            </DropdownMenuItem>
            {task.status !== "failed" && task.status !== "completed" && (
              <DropdownMenuItem onClick={onFail}>
                <AlertTriangle className="size-4" /> Mark failed
              </DropdownMenuItem>
            )}
            {task.status === "completed" && (
              <DropdownMenuItem onClick={() => act(() => setTaskStatus(task, "pending"))}>
                <RotateCcw className="size-4" /> Reopen
              </DropdownMenuItem>
            )}
            {task.status !== "cancelled" && (
              <DropdownMenuItem onClick={() => act(() => updateTask(task.id, { status: "cancelled" }))}>
                <X className="size-4" /> Cancel task
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={() => act(() => deleteTask(task))}>
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function AddTaskDialog({
  open,
  onOpenChange,
  orderId,
  printers,
  seq,
  onCreated,
  onOpenCalc,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  orderId: string
  printers: any[]
  seq: number
  onCreated: () => void
  onOpenCalc: (seed: TaskCalcSeed) => void
}) {
  const [name, setName] = useState("")
  const [type, setType] = useState<OrderTaskType>("3d_print")
  const [quantity, setQuantity] = useState("1")
  const [printerId, setPrinterId] = useState<string>("none")
  const [material, setMaterial] = useState("")
  const [estimate, setEstimate] = useState("")
  const [price, setPrice] = useState<number>(0)
  const [notes, setNotes] = useState("")

  function reset() {
    setName("")
    setType("3d_print")
    setQuantity("1")
    setPrinterId("none")
    setMaterial("")
    setEstimate("")
    setPrice(0)
    setNotes("")
  }

  async function submit() {
    if (!name.trim()) return
    const printer = printers.find((p) => p.id === printerId)
    await createTask({
      order_id: orderId,
      name: name.trim(),
      type,
      quantity: Math.max(1, parseInt(quantity) || 1),
      sequence: seq,
      printer_id: printerId === "none" ? null : printerId,
      machine_name: printer?.name ?? null,
      material_name: material.trim() || null,
      estimated_minutes: parseDurationToMinutes(estimate),
      price: price || null,
      notes: notes.trim() || null,
    })
    reset()
    onOpenChange(false)
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add production task</DialogTitle>
          <DialogDescription>One manufacturing step of this order.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="task-name">Name *</Label>
            <Input id="task-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Print body" className="bg-card" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as OrderTaskType)}>
                <SelectTrigger className="bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TASK_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-qty">Quantity</Label>
              <Input id="task-qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="bg-card" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Machine</Label>
              <Select value={printerId} onValueChange={setPrinterId}>
                <SelectTrigger className="bg-card">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {printers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-est">Est. time</Label>
              <Input id="task-est" value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="e.g. 4h 30m" className="bg-card" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-mat">Material / colour</Label>
              <Input id="task-mat" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="e.g. ABS Black" className="bg-card" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-price">Price (charge)</Label>
              <DecimalInput id="task-price" value={price} onValueChange={setPrice} step="0.01" placeholder="0.00" className="bg-card" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea id="task-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="bg-card" />
          </div>
          <p className="text-xs text-muted-foreground">
            The order Total is the sum of task prices. Costing a task with the calculator fills its price automatically.
          </p>

          {calcKindForTaskType(type) && (
            <button
              type="button"
              onClick={() =>
                onOpenCalc({
                  name: name.trim() || CALC_KIND_LABEL[calcKindForTaskType(type)!],
                  type,
                  quantity: Math.max(1, parseInt(quantity) || 1),
                })
              }
              className="flex w-full items-center justify-between rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <span className="flex items-center gap-2 text-foreground">
                <Calculator className="size-4 text-primary" />
                Cost with full {CALC_KIND_LABEL[calcKindForTaskType(type)!]} calculator
              </span>
              <span className="text-xs text-muted-foreground">parts · time · pricing →</span>
            </button>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            Add quick task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditTaskDialog({
  task,
  printers,
  onClose,
  onReCost,
  onDone,
}: {
  task: OrderTask
  printers: any[]
  onClose: () => void
  onReCost: () => void
  onDone: () => void
}) {
  const calcKind = calcKindForTaskType(task.type)
  const [name, setName] = useState(task.name)
  const [type, setType] = useState<OrderTaskType>(task.type)
  const [quantity, setQuantity] = useState(String(task.quantity ?? 1))
  const [printerId, setPrinterId] = useState<string>(task.printer_id || "none")
  const [material, setMaterial] = useState(task.material_name ?? "")
  const [estimate, setEstimate] = useState(task.estimated_minutes ? formatDuration(task.estimated_minutes) : "")
  const [price, setPrice] = useState<number>(task.price ?? 0)
  const [notes, setNotes] = useState(task.notes ?? "")

  async function submit() {
    if (!name.trim()) return
    const printer = printers.find((p) => p.id === printerId)
    await updateTask(task.id, {
      name: name.trim(),
      type,
      quantity: Math.max(1, parseInt(quantity) || 1),
      printer_id: printerId === "none" ? null : printerId,
      machine_name: printer?.name ?? (printerId === "none" ? null : task.machine_name ?? null),
      material_name: material.trim() || null,
      estimated_minutes: parseDurationToMinutes(estimate),
      price: price || null,
      notes: notes.trim() || null,
    })
    onClose()
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>Update this production step.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-task-name">Name *</Label>
            <Input id="edit-task-name" value={name} onChange={(e) => setName(e.target.value)} className="bg-card" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as OrderTaskType)}>
                <SelectTrigger className="bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TASK_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-task-qty">Quantity</Label>
              <Input id="edit-task-qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="bg-card" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Machine</Label>
              <Select value={printerId} onValueChange={setPrinterId}>
                <SelectTrigger className="bg-card">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {printers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-task-est">Est. time</Label>
              <Input id="edit-task-est" value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="e.g. 4h 30m" className="bg-card" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-task-mat">Material / colour</Label>
              <Input id="edit-task-mat" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="e.g. ABS Black" className="bg-card" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-task-price">Price (charge)</Label>
              <DecimalInput id="edit-task-price" value={price} onValueChange={setPrice} step="0.01" placeholder="0.00" className="bg-card" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-task-notes">Notes</Label>
            <Textarea id="edit-task-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="bg-card" />
          </div>
          {calcKind && (
            <button
              type="button"
              onClick={onReCost}
              className="flex w-full items-center justify-between rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <span className="flex items-center gap-2 text-foreground">
                <Calculator className="size-4 text-primary" />
                {task.calc_payload ? "Re-cost with" : "Cost with"} full {CALC_KIND_LABEL[calcKind]} calculator
              </span>
              <span className="text-xs text-muted-foreground">parts · time · pricing →</span>
            </button>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FailTaskDialog({ task, onClose, onDone }: { task: OrderTask | null; onClose: () => void; onDone: () => void }) {
  // Fresh state per task via the `key` prop on this dialog (parent remounts it),
  // so no reset-in-effect is needed.
  const [reason, setReason] = useState<FailureReason>("adhesion")
  const [notes, setNotes] = useState("")
  const [wastedTime, setWastedTime] = useState("")
  const [wastedMaterial, setWastedMaterial] = useState("")

  async function submit() {
    if (!task) return
    await failTask(task, {
      reason,
      notes: notes.trim() || undefined,
      wastedMinutes: parseDurationToMinutes(wastedTime) ?? undefined,
      wastedMaterialG: wastedMaterial ? parseFloat(wastedMaterial) : undefined,
    })
    onClose()
    onDone()
  }

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark task failed</DialogTitle>
          <DialogDescription>The failed attempt is kept. Use Retry to make a fresh attempt.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as FailureReason)}>
              <SelectTrigger className="bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FAILURE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {FAILURE_REASON_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fail-time">Wasted time</Label>
              <Input id="fail-time" value={wastedTime} onChange={(e) => setWastedTime(e.target.value)} placeholder="e.g. 2h" className="bg-card" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fail-mat">Wasted material (g)</Label>
              <Input id="fail-mat" type="number" value={wastedMaterial} onChange={(e) => setWastedMaterial(e.target.value)} className="bg-card" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fail-notes">Notes</Label>
            <Textarea id="fail-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="bg-card" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit}>
            Mark failed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
