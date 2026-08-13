"use client"

// Wraps the calculator that matches a task's type (3D / laser / UV) in a wide
// dialog for the Orders "Add task" flow. Each calculator runs in embedded mode:
// its "Add to task" button hands back the computed quote-shaped payload, which
// we turn into a task (or apply to an existing one) instead of saving a quote.
// A Personal/Business toggle switches at-cost vs margin+VAT pricing.

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ExcelCalculator } from "@/components/excel-calculator"
import { LaserCalculator } from "@/components/laser-calculator"
import { UvCalculator } from "@/components/uv-calculator"
import { PageLoading } from "@/components/page-loading"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import type { OrderTask, OrderTaskType } from "@/types/orders"
import { calcKindForTaskType, CALC_KIND_LABEL, type CalcKind } from "@/lib/orders/status"
import { createTask, applyTaskCalc, taskFieldsFromCalc } from "@/lib/orders/data"

type Seed = { name: string; type: OrderTaskType; quantity: number }
type CalcMode = "personal" | "business"

export function TaskCalculatorDialog({
  open,
  onOpenChange,
  orderId,
  mode,
  seed,
  task,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  orderId: string
  mode: "create" | "edit"
  seed?: Seed
  task?: OrderTask
  onDone: () => void
}) {
  const { toast } = useToast()
  const taskType = mode === "edit" ? task?.type : seed?.type
  const kind: CalcKind = calcKindForTaskType(taskType) ?? "3d"

  const [calcMode, setCalcMode] = useState<CalcMode>(() =>
    task?.calc_payload?.quote_type === "personal" ? "personal" : "business",
  )
  const [printers, setPrinters] = useState<any[]>([])
  const [filaments, setFilaments] = useState<any[]>([])
  const [laserMaterials, setLaserMaterials] = useState<any[]>([])
  const [uvMaterials, setUvMaterials] = useState<any[]>([])
  const [uvInks, setUvInks] = useState<any[]>([])
  const [settings, setSettings] = useState<any>(null)
  const [clients, setClients] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!open) return
    let active = true
    const load = async () => {
      const supabase = createClient()
      const [p, f, lm, um, ui, g, c] = await Promise.all([
        supabase.from("printers").select("*").order("name"),
        supabase.from("filaments").select("*").order("created_at", { ascending: true }),
        supabase.from("laser_materials").select("*").order("created_at", { ascending: true }),
        supabase.from("uv_materials").select("*").order("created_at", { ascending: true }),
        supabase.from("uv_inks").select("*").order("sort_order", { ascending: true }),
        supabase.from("global_settings").select("*").limit(1).maybeSingle(),
        supabase.from("clients").select("*").order("name"),
      ])
      if (!active) return
      setPrinters(p.data ?? [])
      setFilaments(f.data ?? [])
      setLaserMaterials(lm.data ?? [])
      setUvMaterials(um.data ?? [])
      setUvInks(ui.data ?? [])
      setSettings(g.data ?? null)
      setClients(c.data ?? [])
      setLoaded(true)
    }
    load()
    return () => {
      active = false
    }
  }, [open])

  async function handleComplete(quoteData: Record<string, any>) {
    try {
      const fields = taskFieldsFromCalc(quoteData, printers, filaments)
      if (mode === "edit" && task) {
        await applyTaskCalc(task.id, fields)
      } else {
        await createTask({
          order_id: orderId,
          name: seed?.name?.trim() || CALC_KIND_LABEL[kind],
          type: seed?.type ?? "3d_print",
          quantity: seed?.quantity ?? 1,
          ...fields,
        })
      }
      onOpenChange(false)
      onDone()
    } catch (e: unknown) {
      toast({
        title: "Could not save task cost",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    }
  }

  const printers3d = printers.filter((x: any) => !x.machine_type || x.machine_type === "3d-printer")
  const laserMachines = printers.filter((x: any) => x.machine_type === "laser" || x.machine_type === "sticker-printer")
  const uvMachines = printers.filter((x: any) => x.machine_type === "uv-printer")
  const submitLabel = mode === "edit" ? "Update task" : "Add to task"
  const payload = mode === "edit" ? task?.calc_payload ?? null : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-[1120px] flex-col overflow-hidden p-0 sm:max-w-[1120px]">
        <DialogHeader className="shrink-0 gap-2 border-b border-border/70 p-5 pb-3 pr-12">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle>
              {mode === "edit" ? "Re-cost task" : "Cost this task"} — {CALC_KIND_LABEL[kind]}
            </DialogTitle>
            {/* Personal (at-cost) vs Business (margin + VAT). */}
            <div className="flex overflow-hidden rounded-lg border border-border text-xs">
              {(["business", "personal"] as CalcMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCalcMode(m)}
                  className={cn(
                    "px-2.5 py-1 font-medium capitalize transition-colors",
                    calcMode === m ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <DialogDescription>
            Full {CALC_KIND_LABEL[kind]} calculator. {calcMode === "business" ? "Business — margins + VAT." : "Personal — at-cost, no margin."}{" "}
            &ldquo;{submitLabel}&rdquo; attaches the result{mode === "edit" ? "" : " to a new production task"}.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {!loaded ? (
            <PageLoading />
          ) : (
            <TooltipProvider>
              {kind === "laser" ? (
                <LaserCalculator
                  mode={calcMode}
                  embedded
                  submitLabel={submitLabel}
                  machines={laserMachines}
                  materials={laserMaterials}
                  globalSettings={settings}
                  clients={clients}
                  initialPayload={payload}
                  onComplete={handleComplete}
                />
              ) : kind === "uv" ? (
                <UvCalculator
                  mode={calcMode}
                  embedded
                  submitLabel={submitLabel}
                  machines={uvMachines}
                  materials={uvMaterials}
                  inks={uvInks}
                  globalSettings={settings}
                  clients={clients}
                  initialPayload={payload}
                  onComplete={handleComplete}
                />
              ) : (
                <ExcelCalculator
                  mode={calcMode}
                  embedded
                  submitLabel={submitLabel}
                  printers={printers3d}
                  filaments={filaments}
                  globalSettings={settings}
                  clients={clients}
                  initialPayload={payload}
                  onComplete={handleComplete}
                />
              )}
            </TooltipProvider>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
