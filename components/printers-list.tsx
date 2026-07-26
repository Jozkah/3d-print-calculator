"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronUp } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DialogCustom } from "@/components/ui/dialog-custom"
import { OWNER_A_KEY, OWNER_B_KEY, OWNER_OPTIONS } from "@/lib/business-config"
import { PrinterVisual } from "@/components/visual/printer-visual"
import { PRINTER_IMAGES, GENERIC_PRINTER_KEY } from "@/lib/printer-images"

type Printer = {
  id: string
  name: string
  owner: string
  printer_cost: number
  additional_upfront_cost: number
  estimated_annual_maintenance: number
  estimated_life_years: number
  estimated_printer_uptime_percent: number
  average_power_consumption_watts: number
  has_enclosure: boolean
  image_key?: string | null
  machine_type?: string
}

export function PrintersList({ printers: initialPrinters }: { printers: Printer[] }) {
  const [printers, setPrinters] = useState(initialPrinters)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newPrinter, setNewPrinter] = useState({
    name: "",
    owner: OWNER_B_KEY,
    printer_cost: "500.00",
    additional_upfront_cost: "100.00",
    estimated_annual_maintenance: "75.00",
    estimated_life_years: "3.0",
    estimated_printer_uptime_percent: "0.50",
    average_power_consumption_watts: "150.00",
    has_enclosure: "false",
    image_key: "auto",
    machine_type: "3d-printer",
  })
  const [editData, setEditData] = useState(newPrinter)
  const router = useRouter()
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; printerId: string | null }>({
    isOpen: false,
    printerId: null,
  })

  // Parse and validate the numeric printer fields shared by add/edit.
  // The form fields are controlled inputs that can be cleared to "" — Number.parseFloat("") is NaN,
  // and the target columns (printer_cost, ..., average_power_consumption_watts) are DECIMAL NOT NULL.
  // Sending NaN makes Postgres reject the insert/update; we previously swallowed that error silently.
  // Returning null here lets the caller surface a clear validation message instead of no-oping.
  const parsePrinterNums = (data: typeof newPrinter) => {
    const nums = {
      printer_cost: Number.parseFloat(data.printer_cost),
      additional_upfront_cost: Number.parseFloat(data.additional_upfront_cost),
      estimated_annual_maintenance: Number.parseFloat(data.estimated_annual_maintenance),
      estimated_life_years: Number.parseFloat(data.estimated_life_years),
      estimated_printer_uptime_percent: Number.parseFloat(data.estimated_printer_uptime_percent),
      average_power_consumption_watts: Number.parseFloat(data.average_power_consumption_watts),
    }

    // Reject NaN/Infinity and negatives for every numeric field.
    if (Object.values(nums).some((n) => !Number.isFinite(n) || n < 0)) {
      alert("Please enter valid non-negative numbers for all printer fields.")
      return null
    }
    // estimated_life_years and estimated_printer_uptime_percent feed a division in the calculator
    // (excel-calculator: lifetimeCost / (uptimeHoursPerYear * estimated_life_years)); a 0 here
    // produces Infinity/NaN machine cost, so require life > 0 and uptime in (0, 1].
    if (
      nums.estimated_life_years <= 0 ||
      nums.estimated_printer_uptime_percent <= 0 ||
      nums.estimated_printer_uptime_percent > 1
    ) {
      alert("Estimated life (years) must be greater than 0, and uptime must be between 0 (exclusive) and 1.")
      return null
    }

    return nums
  }

  const handleAdd = async () => {
    if (!newPrinter.name) return

    const nums = parsePrinterNums(newPrinter)
    if (!nums) return

    const supabase = createClient()
    const { error } = await supabase.from("printers").insert({
      name: newPrinter.name,
      owner: newPrinter.owner,
      ...nums,
      has_enclosure: newPrinter.has_enclosure === "true",
      image_key: newPrinter.image_key === "auto" ? null : newPrinter.image_key,
      machine_type: newPrinter.machine_type || "3d-printer",
    })

    if (error) {
      // Surface DB failures instead of silently doing nothing.
      alert(`Could not save printer: ${error.message}`)
      return
    }

    const { data } = await supabase.from("printers").select("*").order("name", { ascending: true })
    if (data) setPrinters(data)
    setNewPrinter({
      name: "",
      owner: OWNER_B_KEY,
      printer_cost: "500.00",
      additional_upfront_cost: "100.00",
      estimated_annual_maintenance: "75.00",
      estimated_life_years: "3.0",
      estimated_printer_uptime_percent: "0.50",
      average_power_consumption_watts: "150.00",
      has_enclosure: "false",
      image_key: "auto",
      machine_type: "3d-printer",
    })
    setIsAdding(false)
  }

  const handleDelete = async (id: string) => {
    setDeleteDialog({ isOpen: true, printerId: id })
  }

  const confirmDelete = async () => {
    if (!deleteDialog.printerId) return

    const supabase = createClient()
    const { error } = await supabase.from("printers").delete().eq("id", deleteDialog.printerId)

    if (!error) {
      setPrinters(printers.filter((p) => p.id !== deleteDialog.printerId))
    }
    setDeleteDialog({ isOpen: false, printerId: null })
  }

  const handleEdit = async (id: string) => {
    if (!editData.name) return

    const nums = parsePrinterNums(editData)
    if (!nums) return

    const supabase = createClient()
    const { error } = await supabase
      .from("printers")
      .update({
        name: editData.name,
        owner: editData.owner,
        ...nums,
        has_enclosure: editData.has_enclosure === "true",
        image_key: editData.image_key === "auto" ? null : editData.image_key,
        machine_type: editData.machine_type || "3d-printer",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (error) {
      // Surface DB failures instead of silently doing nothing.
      alert(`Could not update printer: ${error.message}`)
      return
    }

    const { data } = await supabase.from("printers").select("*").order("name", { ascending: true })
    if (data) setPrinters(data)
    setEditingId(null)
  }

  const startEdit = (printer: Printer) => {
    setEditingId(printer.id)
    setEditData({
      name: printer.name,
      owner: printer.owner,
      printer_cost: printer.printer_cost.toString(),
      additional_upfront_cost: printer.additional_upfront_cost.toString(),
      estimated_annual_maintenance: printer.estimated_annual_maintenance.toString(),
      estimated_life_years: printer.estimated_life_years.toString(),
      estimated_printer_uptime_percent: printer.estimated_printer_uptime_percent.toString(),
      average_power_consumption_watts: printer.average_power_consumption_watts.toString(),
      has_enclosure: (printer.has_enclosure ?? false).toString(),
      image_key: printer.image_key || "auto",
      machine_type: printer.machine_type || "3d-printer",
    })
  }

  const renderPrinterForm = (data: typeof newPrinter, onChange: (data: typeof newPrinter) => void) => (
    <div className="grid md:grid-cols-2 gap-4">
      <div>
        <Label>Name</Label>
        <Input
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          placeholder="e.g. your printer model"
          className="bg-card"
        />
      </div>

      <div>
        <Label>Owner</Label>
        <Select value={data.owner} onValueChange={(value) => onChange({ ...data, owner: value })}>
          <SelectTrigger className="bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OWNER_OPTIONS.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="md:col-span-2">
        <Label>Product image</Label>
        <div className="mt-1.5 flex items-center gap-3">
          <PrinterVisual name={data.name} imageKey={data.image_key === "auto" ? null : data.image_key} size="thumb" />
          <Select value={data.image_key} onValueChange={(value) => onChange({ ...data, image_key: value })}>
            <SelectTrigger className="bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-detect from name</SelectItem>
              <SelectItem value={GENERIC_PRINTER_KEY}>Generic (no image)</SelectItem>
              {PRINTER_IMAGES.map((e) => (
                <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Printer Cost (€)</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={data.printer_cost}
          onChange={(e) => onChange({ ...data, printer_cost: e.target.value })}
          className="bg-card"
        />
      </div>

      <div>
        <Label>Additional Upfront Cost (€)</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={data.additional_upfront_cost}
          onChange={(e) => onChange({ ...data, additional_upfront_cost: e.target.value })}
          className="bg-card"
        />
      </div>

      <div>
        <Label>Annual Maintenance (€)</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={data.estimated_annual_maintenance}
          onChange={(e) => onChange({ ...data, estimated_annual_maintenance: e.target.value })}
          className="bg-card"
        />
      </div>

      <div>
        <Label>Estimated Life (years)</Label>
        <Input
          type="number"
          min="0"
          step="0.1"
          value={data.estimated_life_years}
          onChange={(e) => onChange({ ...data, estimated_life_years: e.target.value })}
          className="bg-card"
        />
      </div>

      <div>
        <Label>Printer Uptime (%)</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={data.estimated_printer_uptime_percent}
          onChange={(e) => onChange({ ...data, estimated_printer_uptime_percent: e.target.value })}
          placeholder="0.50 = 50%"
          className="bg-card"
        />
      </div>

      <div>
        <Label>Power Consumption (Watts)</Label>
        <Input
          type="number"
          min="0"
          step="1"
          value={data.average_power_consumption_watts}
          onChange={(e) => onChange({ ...data, average_power_consumption_watts: e.target.value })}
          className="bg-card"
        />
      </div>

      <div>
        <Label>Machine Type</Label>
        <Select value={data.machine_type || "3d-printer"} onValueChange={(v) => onChange({ ...data, machine_type: v })}>
          <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3d-printer">3D Printer</SelectItem>
            <SelectItem value="laser">Laser (engraver / cutter)</SelectItem>
            <SelectItem value="sticker-printer">Sticker Printer / Cutter</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 md:col-span-2 pt-2">
        <Checkbox
          id="has-enclosure"
          checked={data.has_enclosure === "true"}
          onCheckedChange={(checked) => onChange({ ...data, has_enclosure: checked ? "true" : "false" })}
        />
        <Label htmlFor="has-enclosure" className="cursor-pointer">
          Has Enclosure
        </Label>
      </div>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 sm:gap-0 mb-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">3D Printers</h2>
        <Button onClick={() => setIsAdding(true)} className="w-full sm:w-auto shadow-sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Printer
        </Button>
      </div>

      {isAdding && (
        <Card className="mb-6 border-primary/30 shadow-md">
          <CardHeader>
            <CardTitle>New Printer</CardTitle>
            <CardDescription>Add a new printer with advanced settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderPrinterForm(newPrinter, setNewPrinter)}
            <div className="flex flex-col sm:flex-row gap-2 pt-4">
              <Button onClick={handleAdd} className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto">
                <Check className="w-4 h-4 mr-2" />
                Save
              </Button>
              <Button onClick={() => setIsAdding(false)} variant="outline" className="w-full sm:w-auto">
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {printers.map((printer) => (
          <Card key={printer.id} className={`shadow-sm transition-shadow hover:shadow-md ${editingId === printer.id ? "sm:col-span-2 lg:col-span-3" : ""}`}>
            <CardContent className="p-6">
              {editingId === printer.id ? (
                <div className="space-y-4">
                  {renderPrinterForm(editData, setEditData)}
                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={() => handleEdit(printer.id)}
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Save
                    </Button>
                    <Button onClick={() => setEditingId(null)} size="sm" variant="outline">
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center">
                  <PrinterVisual name={printer.name} imageKey={printer.image_key} size="card" className="mb-4 w-full" />
                  <div className="mb-1 flex items-center justify-center gap-2">
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">{printer.name}</h3>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${printer.owner === OWNER_A_KEY ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" : "bg-primary/10 text-primary"}`}
                    >
                      {printer.owner}
                    </span>
                    {printer.has_enclosure && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        Enclosed
                      </span>
                    )}
                    {printer.machine_type === "laser" && <span className="text-xs text-muted-foreground">Laser</span>}
                    {printer.machine_type === "sticker-printer" && <span className="text-xs text-muted-foreground">Sticker printer</span>}
                  </div>
                  <dl className="grid w-full grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted/60 px-1 py-2">
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Cost</dt>
                      <dd className="text-sm font-semibold tabular-nums">€{printer.printer_cost.toFixed(0)}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/60 px-1 py-2">
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Life</dt>
                      <dd className="text-sm font-semibold tabular-nums">{printer.estimated_life_years}y</dd>
                    </div>
                    <div className="rounded-lg bg-muted/60 px-1 py-2">
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Power</dt>
                      <dd className="text-sm font-semibold tabular-nums">{printer.average_power_consumption_watts}W</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex w-full justify-center gap-2">
                    <Button onClick={() => setExpandedId(expandedId === printer.id ? null : printer.id)} size="sm" variant="outline">
                      {expandedId === printer.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    <Button onClick={() => startEdit(printer)} size="sm" variant="outline">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button onClick={() => handleDelete(printer.id)} size="sm" variant="outline" className="text-red-600 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  {expandedId === printer.id && (
                    <div className="mt-4 w-full border-t border-border pt-4 text-left grid gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Additional Cost:</span>
                        <span className="text-foreground ml-2 font-medium tabular-nums">€{printer.additional_upfront_cost.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Annual Maintenance:</span>
                        <span className="text-foreground ml-2 font-medium tabular-nums">€{printer.estimated_annual_maintenance.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Printer Uptime:</span>
                        <span className="text-foreground ml-2 font-medium tabular-nums">{(printer.estimated_printer_uptime_percent * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <DialogCustom
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, printerId: null })}
        onConfirm={confirmDelete}
        title="Delete Printer"
        description="Are you sure you want to delete this printer? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  )
}
