"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Pencil, X, Check } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { pricingUnitLabel, usageUnitLabel, type LaserPricingUnit } from "@/lib/laser-pricing"
import type { LaserMaterial } from "@/types/db"

const UNITS: { value: LaserPricingUnit; label: string }[] = [
  { value: "sheet", label: "Per sheet" },
  { value: "area", label: "Per area (cm²)" },
  { value: "length", label: "Per length (cm)" },
  { value: "piece", label: "Per piece" },
]

type FormState = {
  name: string
  pricing_unit: LaserPricingUnit
  price: string
  sheet_width_cm: string
  sheet_height_cm: string
  stock_qty: string
  color: string
}

const EMPTY_FORM: FormState = {
  name: "",
  pricing_unit: "sheet",
  price: "",
  sheet_width_cm: "",
  sheet_height_cm: "",
  stock_qty: "",
  color: "",
}

function formToRow(form: FormState) {
  return {
    name: form.name.trim(),
    pricing_unit: form.pricing_unit,
    price: Number.parseFloat(form.price) || 0,
    sheet_width_cm: form.pricing_unit === "sheet" ? Number.parseFloat(form.sheet_width_cm) || null : null,
    sheet_height_cm: form.pricing_unit === "sheet" ? Number.parseFloat(form.sheet_height_cm) || null : null,
    stock_qty: form.stock_qty === "" ? null : Number.parseFloat(form.stock_qty) || 0,
    color: form.color.trim() || null,
    updated_at: new Date().toISOString(),
  }
}

function MaterialForm({
  form,
  onChange,
}: {
  form: FormState
  onChange: (next: FormState) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <Label>Name</Label>
        <Input value={form.name} placeholder="Plywood 3mm" onChange={(e) => onChange({ ...form, name: e.target.value })} className="bg-card" />
      </div>
      <div>
        <Label>Priced</Label>
        <Select value={form.pricing_unit} onValueChange={(v) => onChange({ ...form, pricing_unit: v as LaserPricingUnit })}>
          <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            {UNITS.map((u) => (
              <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Price ({pricingUnitLabel(form.pricing_unit)})</Label>
        <Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => onChange({ ...form, price: e.target.value })} className="bg-card" />
      </div>
      {form.pricing_unit === "sheet" && (
        <>
          <div>
            <Label>Sheet width (cm, optional)</Label>
            <Input type="number" min="0" step="0.1" value={form.sheet_width_cm} onChange={(e) => onChange({ ...form, sheet_width_cm: e.target.value })} className="bg-card" />
          </div>
          <div>
            <Label>Sheet height (cm, optional)</Label>
            <Input type="number" min="0" step="0.1" value={form.sheet_height_cm} onChange={(e) => onChange({ ...form, sheet_height_cm: e.target.value })} className="bg-card" />
          </div>
        </>
      )}
      <div>
        <Label>Stock ({usageUnitLabel(form.pricing_unit)}, optional)</Label>
        <Input type="number" min="0" step="0.1" value={form.stock_qty} onChange={(e) => onChange({ ...form, stock_qty: e.target.value })} className="bg-card" />
      </div>
      <div>
        <Label>Color (optional, hex)</Label>
        <Input value={form.color} placeholder="#a07040" onChange={(e) => onChange({ ...form, color: e.target.value })} className="bg-card" />
      </div>
    </div>
  )
}

export function LaserMaterialsList({ materials }: { materials: LaserMaterial[] }) {
  const { toast } = useToast()
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM)

  const handleAdd = async () => {
    if (!addForm.name.trim()) {
      toast({ title: "Name required", description: "Give the material a name.", variant: "destructive" })
      return
    }
    const supabase = createClient()
    const { error } = await supabase.from("laser_materials").insert([{ ...formToRow(addForm), created_at: new Date().toISOString() }])
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
      return
    }
    setAddForm(EMPTY_FORM)
    setShowAdd(false)
    toast({ title: "Material added" })
  }

  const startEdit = (m: LaserMaterial) => {
    setEditingId(m.id)
    setEditForm({
      name: m.name,
      pricing_unit: m.pricing_unit,
      price: String(m.price ?? ""),
      sheet_width_cm: m.sheet_width_cm != null ? String(m.sheet_width_cm) : "",
      sheet_height_cm: m.sheet_height_cm != null ? String(m.sheet_height_cm) : "",
      stock_qty: m.stock_qty != null ? String(m.stock_qty) : "",
      color: m.color ?? "",
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    const supabase = createClient()
    const { error } = await supabase.from("laser_materials").update(formToRow(editForm)).eq("id", editingId)
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
      return
    }
    setEditingId(null)
    toast({ title: "Material updated" })
  }

  const handleDelete = async (m: LaserMaterial) => {
    const supabase = createClient()
    const { error } = await supabase.from("laser_materials").delete().eq("id", m.id)
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
      return
    }
    toast({ title: "Material deleted", description: m.name })
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6 shadow-sm">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Laser & Sticker Materials</h2>
          <Button size="sm" className="shadow-sm" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {showAdd ? "Cancel" : "Add Material"}
          </Button>
        </div>
        {showAdd && (
          <div className="mt-4 space-y-4">
            <MaterialForm form={addForm} onChange={setAddForm} />
            <Button onClick={handleAdd} className="shadow-sm">
              <Check className="w-4 h-4 mr-2" />
              Save Material
            </Button>
          </div>
        )}
      </Card>

      {materials.length === 0 && !showAdd && (
        <Card className="p-8 text-center text-sm text-muted-foreground shadow-sm">
          No materials yet. Add the sheets, rolls and blanks you buy — each priced the way you buy it.
        </Card>
      )}

      {materials.map((m) => (
        <Card key={m.id} className="p-4 sm:p-5 shadow-sm">
          {editingId === m.id ? (
            <div className="space-y-4">
              <MaterialForm form={editForm} onChange={setEditForm} />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveEdit}>
                  <Check className="w-4 h-4 mr-2" />Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                  <X className="w-4 h-4 mr-2" />Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="size-8 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: m.color || "var(--muted)" }}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{m.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {m.price?.toFixed(2)} {pricingUnitLabel(m.pricing_unit)}
                    {m.pricing_unit === "sheet" && m.sheet_width_cm && m.sheet_height_cm
                      ? ` · ${m.sheet_width_cm}×${m.sheet_height_cm} cm`
                      : ""}
                    {m.stock_qty != null ? ` · ${m.stock_qty} ${usageUnitLabel(m.pricing_unit)} in stock` : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" aria-label={`Edit ${m.name}`} onClick={() => startEdit(m)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Delete ${m.name}`} onClick={() => handleDelete(m)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
