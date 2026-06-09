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
  })
  const [editData, setEditData] = useState(newPrinter)
  const router = useRouter()
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; printerId: string | null }>({
    isOpen: false,
    printerId: null,
  })

  const handleAdd = async () => {
    if (!newPrinter.name) return

    const supabase = createClient()
    const { error } = await supabase.from("printers").insert({
      name: newPrinter.name,
      owner: newPrinter.owner,
      printer_cost: Number.parseFloat(newPrinter.printer_cost),
      additional_upfront_cost: Number.parseFloat(newPrinter.additional_upfront_cost),
      estimated_annual_maintenance: Number.parseFloat(newPrinter.estimated_annual_maintenance),
      estimated_life_years: Number.parseFloat(newPrinter.estimated_life_years),
      estimated_printer_uptime_percent: Number.parseFloat(newPrinter.estimated_printer_uptime_percent),
      average_power_consumption_watts: Number.parseFloat(newPrinter.average_power_consumption_watts),
      has_enclosure: newPrinter.has_enclosure === "true",
    })

    if (!error) {
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
      })
      setIsAdding(false)
    }
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

    const supabase = createClient()
    const { error } = await supabase
      .from("printers")
      .update({
        name: editData.name,
        owner: editData.owner,
        printer_cost: Number.parseFloat(editData.printer_cost),
        additional_upfront_cost: Number.parseFloat(editData.additional_upfront_cost),
        estimated_annual_maintenance: Number.parseFloat(editData.estimated_annual_maintenance),
        estimated_life_years: Number.parseFloat(editData.estimated_life_years),
        estimated_printer_uptime_percent: Number.parseFloat(editData.estimated_printer_uptime_percent),
        average_power_consumption_watts: Number.parseFloat(editData.average_power_consumption_watts),
        has_enclosure: editData.has_enclosure === "true",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (!error) {
      const { data } = await supabase.from("printers").select("*").order("name", { ascending: true })
      if (data) setPrinters(data)
      setEditingId(null)
    }
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
          className="bg-white border-blue-200"
        />
      </div>

      <div>
        <Label>Owner</Label>
        <Select value={data.owner} onValueChange={(value) => onChange({ ...data, owner: value })}>
          <SelectTrigger className="bg-white border-blue-200">
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

      <div>
        <Label>Printer Cost (€)</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={data.printer_cost}
          onChange={(e) => onChange({ ...data, printer_cost: e.target.value })}
          className="bg-white border-blue-200"
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
          className="bg-white border-blue-200"
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
          className="bg-white border-blue-200"
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
          className="bg-white border-blue-200"
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
          className="bg-white border-blue-200"
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
          className="bg-white border-blue-200"
        />
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
        <h2 className="text-xl font-semibold text-blue-900 dark:text-blue-100">3D Printers</h2>
        <Button onClick={() => setIsAdding(true)} className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Add Printer
        </Button>
      </div>

      {isAdding && (
        <Card className="mb-6 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900">New Printer</CardTitle>
            <CardDescription>Add a new printer with advanced settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderPrinterForm(newPrinter, setNewPrinter)}
            <div className="flex flex-col sm:flex-row gap-2 pt-4">
              <Button onClick={handleAdd} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto">
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

      <div className="grid gap-4">
        {printers.map((printer) => (
          <Card key={printer.id} className="border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              {editingId === printer.id ? (
                <div className="space-y-4">
                  {renderPrinterForm(editData, setEditData)}
                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={() => handleEdit(printer.id)}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
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
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">{printer.name}</h3>
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${printer.owner === OWNER_A_KEY ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}
                        >
                          {printer.owner}
                        </span>
                        {printer.has_enclosure && (
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-700">
                            Enclosed
                          </span>
                        )}
                      </div>
                      <p className="text-blue-600 text-sm">
                        Cost: €{printer.printer_cost.toFixed(2)} | Life: {printer.estimated_life_years}yrs | Power:{" "}
                        {printer.average_power_consumption_watts}W
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setExpandedId(expandedId === printer.id ? null : printer.id)}
                        size="sm"
                        variant="outline"
                      >
                        {expandedId === printer.id ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                      <Button onClick={() => startEdit(printer)} size="sm" variant="outline">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => handleDelete(printer.id)}
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {expandedId === printer.id && (
                    <div className="mt-4 pt-4 border-t border-blue-200 grid md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-blue-600">Additional Cost:</span>
                        <span className="text-blue-900 ml-2 font-semibold">
                          €{printer.additional_upfront_cost.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-600">Annual Maintenance:</span>
                        <span className="text-blue-900 ml-2 font-semibold">
                          €{printer.estimated_annual_maintenance.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-600">Printer Uptime:</span>
                        <span className="text-blue-900 ml-2 font-semibold">
                          {(printer.estimated_printer_uptime_percent * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-600">Has Enclosure:</span>
                        <span className="text-blue-900 ml-2 font-semibold">
                          {printer.has_enclosure ? "Yes" : "No"}
                        </span>
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
