"use client"

// Controlled labor/packaging line tables shared by calculators. The row field
// names match what saved quotes already store in labor_items/packaging_items.

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Plus, Trash2 } from "lucide-react"

export type LaborItemRow = { id: string; action: string; hours: number; hourly_cost: number }
export type PackagingItemRow = { id: string; name: string; quantity: number; unit_cost: number }

const th = "p-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"

export function LaborTable({
  items,
  onChange,
  defaultHourlyRate,
}: {
  items: LaborItemRow[]
  onChange: (items: LaborItemRow[]) => void
  defaultHourlyRate: number
}) {
  const patch = (i: number, p: Partial<LaborItemRow>) =>
    onChange(items.map((row, j) => (j === i ? { ...row, ...p } : row)))
  return (
    <Card className="p-5 sm:p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Labor</h2>
        <Button size="sm" className="shadow-sm"
          onClick={() => onChange([...items, { id: crypto.randomUUID(), action: "", hours: 0, hourly_cost: defaultHourlyRate }])}>
          <Plus className="w-4 h-4 mr-2" />Add Labor
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Design and artwork prep time goes here, at your hourly rate.</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[480px]">
          <thead>
            <tr className="bg-muted/60 border-b border-border">
              <th className={th}>Action</th>
              <th className={th}>Hours</th>
              <th className={th}>€/hr</th>
              <th className={th}>Cost (€)</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={row.id} className="border-b border-border/60 transition-colors hover:bg-muted/30">
                <td className="p-2"><Input value={row.action} placeholder="Design work" className="bg-card" onChange={(e) => patch(i, { action: e.target.value })} /></td>
                <td className="p-2"><Input type="number" min="0" step="0.25" className="w-24 bg-card" value={row.hours || ""} onChange={(e) => patch(i, { hours: Number.parseFloat(e.target.value) || 0 })} /></td>
                <td className="p-2"><Input type="number" min="0" step="0.5" className="w-24 bg-card" value={row.hourly_cost || ""} onChange={(e) => patch(i, { hourly_cost: Number.parseFloat(e.target.value) || 0 })} /></td>
                <td className="p-2 tabular-nums text-sm">{(row.hours * row.hourly_cost).toFixed(2)}</td>
                <td className="p-2 text-center">
                  <Button size="icon" variant="ghost" aria-label="Remove labor row" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export function PackagingTable({
  items,
  onChange,
}: {
  items: PackagingItemRow[]
  onChange: (items: PackagingItemRow[]) => void
}) {
  const patch = (i: number, p: Partial<PackagingItemRow>) =>
    onChange(items.map((row, j) => (j === i ? { ...row, ...p } : row)))
  return (
    <Card className="p-5 sm:p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Packaging</h2>
        <Button size="sm" className="shadow-sm"
          onClick={() => onChange([...items, { id: crypto.randomUUID(), name: "", quantity: 1, unit_cost: 0 }])}>
          <Plus className="w-4 h-4 mr-2" />Add Packaging
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[480px]">
          <thead>
            <tr className="bg-muted/60 border-b border-border">
              <th className={th}>Item</th>
              <th className={th}>Qty</th>
              <th className={th}>Unit Cost (€)</th>
              <th className={th}>Cost (€)</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={row.id} className="border-b border-border/60 transition-colors hover:bg-muted/30">
                <td className="p-2"><Input value={row.name} placeholder="Box" className="bg-card" onChange={(e) => patch(i, { name: e.target.value })} /></td>
                <td className="p-2"><Input type="number" min="0" step="1" className="w-20 bg-card" value={row.quantity || ""} onChange={(e) => patch(i, { quantity: Number.parseFloat(e.target.value) || 0 })} /></td>
                <td className="p-2"><Input type="number" min="0" step="0.05" className="w-24 bg-card" value={row.unit_cost || ""} onChange={(e) => patch(i, { unit_cost: Number.parseFloat(e.target.value) || 0 })} /></td>
                <td className="p-2 tabular-nums text-sm">{(row.quantity * row.unit_cost).toFixed(2)}</td>
                <td className="p-2 text-center">
                  <Button size="icon" variant="ghost" aria-label="Remove packaging row" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
