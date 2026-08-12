"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ClientSelector } from "@/components/client-selector"
import { useToast } from "@/hooks/use-toast"
import { ORDER_PRIORITIES, ORDER_PRIORITY_META, ORDER_STATUS_META } from "@/lib/orders/status"
import type { OrderPriority, OrderStatus } from "@/types/orders"
import { createOrder, addNote } from "@/lib/orders/data"

// Statuses offered when creating an order (excludes terminal/hold states).
const INITIAL_STATUSES: OrderStatus[] = ["draft", "awaiting_approval", "queued", "in_production"]

export function NewOrderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [clients, setClients] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState("")
  const [clientName, setClientName] = useState("")
  const [clientId, setClientId] = useState<string | null>(null)
  const [description, setDescription] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [priority, setPriority] = useState<OrderPriority>("normal")
  const [status, setStatus] = useState<OrderStatus>("queued")
  const [note, setNote] = useState("")

  const loadClients = useCallback(async () => {
    const { data } = await createClient().from("clients").select("*").order("name")
    if (data) setClients(data)
  }, [])

  // Refresh the client list whenever the dialog opens. The fetch is inlined so
  // the state update clearly lives in an async callback, not the effect body.
  useEffect(() => {
    if (!open) return
    let active = true
    createClient()
      .from("clients")
      .select("*")
      .order("name")
      .then(({ data }) => {
        if (active && data) setClients(data)
      })
    return () => {
      active = false
    }
  }, [open])

  function reset() {
    setTitle("")
    setClientName("")
    setClientId(null)
    setDescription("")
    setDueDate("")
    setPriority("normal")
    setStatus("queued")
    setNote("")
  }

  async function handleCreate() {
    if (!title.trim()) {
      toast({ title: "Order name is required", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const { data: settings } = await createClient().from("global_settings").select("*").limit(1).maybeSingle()
      const order = await createOrder({
        title: title.trim(),
        description: description.trim() || null,
        client_id: clientId,
        status,
        priority,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        currency_symbol: (settings as any)?.currency_symbol || "€",
      })
      if (note.trim()) await addNote(order.id, note.trim(), true)
      reset()
      onOpenChange(false)
      onCreated?.()
      router.push(`/orders/${order.id}`)
    } catch (e: unknown) {
      toast({
        title: "Could not create order",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New order</DialogTitle>
          <DialogDescription>Create the order, then add files, tasks and pricing on the next screen.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="order-title">Order name *</Label>
            <Input
              id="order-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. BMW E90 Vent Gauge Pod"
              className="bg-card"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim()) handleCreate()
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Customer</Label>
            <ClientSelector
              value={clientName}
              onChange={(name, id) => {
                setClientName(name)
                setClientId(id || null)
              }}
              clients={clients}
              onClientsUpdate={loadClients}
              placeholder="Select or add client..."
              className="bg-card"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="order-due">Due date</Label>
              <Input
                id="order-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="bg-card"
              />
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
            <Label>Initial status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
              <SelectTrigger className="bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INITIAL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ORDER_STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="order-desc">Description</Label>
            <Textarea
              id="order-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short summary of the job"
              className="bg-card"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="order-note">Pinned note (optional)</Label>
            <Textarea
              id="order-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Customer wants matte black. Call before starting."
              className="bg-card"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving || !title.trim()}>
            {saving ? "Creating…" : "Create order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
