"use client"

// Work steps for a UV quote. Each row carries its own scope, which is what
// makes "file prep once, jig load per run, wipe per piece" expressible in one
// list instead of three hardcoded fields.

import { uuid } from "@/lib/uuid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2 } from "lucide-react"
import { formatMoney } from "@/lib/format"
import type { UvOperation, UvOperationBreakdown, UvOperationScope } from "@/lib/uv-pricing"

const th = "p-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
const ALL_ITEMS = "all"

const SCOPES: { value: UvOperationScope; label: string }[] = [
  { value: "quote", label: "Once per quote" },
  { value: "run", label: "Per run" },
  { value: "piece", label: "Per piece" },
]

const PRESETS: { label: string; op: Omit<UvOperation, "id"> }[] = [
  { label: "File prep", op: { name: "File prep", kind: "labour", minutes: 30, amount: 0, scope: "quote", item_id: null } },
  { label: "Jig load", op: { name: "Jig load", kind: "labour", minutes: 5, amount: 0, scope: "run", item_id: null } },
  { label: "Wipe / prime", op: { name: "Wipe / prime", kind: "labour", minutes: 1, amount: 0, scope: "piece", item_id: null } },
]

export function UvOperationsTable({
  operations,
  items,
  breakdown,
  currency,
  onChange,
}: {
  operations: UvOperation[]
  items: { id: string; name: string }[]
  breakdown: UvOperationBreakdown[]
  currency: string
  onChange: (operations: UvOperation[]) => void
}) {
  const money = (n: number) => formatMoney(n, currency)
  const patch = (i: number, p: Partial<UvOperation>) =>
    onChange(operations.map((row, j) => (j === i ? { ...row, ...p } : row)))
  const append = (op: Omit<UvOperation, "id">) => onChange([...operations, { id: uuid(), ...op }])

  return (
    <Card className="p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Work steps</h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button key={preset.label} size="sm" variant="outline" onClick={() => append(preset.op)}>
              {preset.label}
            </Button>
          ))}
          <Button
            size="sm"
            className="shadow-sm"
            onClick={() => append({ name: "", kind: "labour", minutes: 0, amount: 0, scope: "quote", item_id: null })}
          >
            <Plus className="w-4 h-4 mr-2" />Add step
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Once-per-quote steps are shared across the whole job; per-run and per-piece steps scale with the item they&apos;re
        attached to.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[760px]">
          <thead>
            <tr className="bg-muted/60 border-b border-border">
              <th className={th}>Step</th>
              <th className={th}>Type</th>
              <th className={th}>Minutes / {currency}</th>
              <th className={th}>How often</th>
              <th className={th}>Applies to</th>
              <th className={th}>Cost</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {operations.map((op, i) => {
              const line = breakdown.find((b) => b.id === op.id)
              return (
                <tr key={op.id} className="border-b border-border/60 transition-colors hover:bg-muted/30">
                  <td className="p-2 min-w-[150px]">
                    <Input value={op.name} placeholder="File prep" className="bg-card"
                      onChange={(e) => patch(i, { name: e.target.value })} />
                  </td>
                  <td className="p-2 min-w-[140px]">
                    <Select value={op.kind} onValueChange={(v) => patch(i, { kind: v as UvOperation["kind"] })}>
                      <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="labour">Labour (minutes)</SelectItem>
                        <SelectItem value="cost">Fixed cost ({currency})</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2">
                    {op.kind === "labour" ? (
                      <Input type="number" min="0" step="0.5" className="w-24 bg-card" aria-label="Minutes"
                        value={op.minutes || ""}
                        onChange={(e) => patch(i, { minutes: Number.parseFloat(e.target.value) || 0 })} />
                    ) : (
                      <Input type="number" min="0" step="0.05" className="w-24 bg-card" aria-label="Amount"
                        value={op.amount || ""}
                        onChange={(e) => patch(i, { amount: Number.parseFloat(e.target.value) || 0 })} />
                    )}
                  </td>
                  <td className="p-2 min-w-[150px]">
                    <Select value={op.scope} onValueChange={(v) => patch(i, { scope: v as UvOperationScope })}>
                      <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SCOPES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2 min-w-[150px]">
                    <Select
                      value={op.item_id ?? ALL_ITEMS}
                      disabled={op.scope === "quote"}
                      onValueChange={(v) => patch(i, { item_id: v === ALL_ITEMS ? null : v })}
                    >
                      <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_ITEMS}>All items</SelectItem>
                        {items.map((it) => (
                          <SelectItem key={it.id} value={it.id}>{it.name || "Unnamed item"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2 tabular-nums text-sm whitespace-nowrap">
                    {line ? `${line.occurrences} × ${money(line.unitCost)} = ${money(line.total)}` : money(0)}
                  </td>
                  <td className="p-2 text-center">
                    <Button size="icon" variant="ghost" aria-label="Remove work step"
                      onClick={() => onChange(operations.filter((_, j) => j !== i))}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
