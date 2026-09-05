"use client"

// Wraps the calculator that matches a task's type (3D / laser / UV) in a wide
// dialog for the Orders "Add task" flow. Each calculator runs in embedded mode:
// its "Add to task" button hands back the computed quote-shaped payload, which
// we turn into a task (or apply to an existing one) instead of saving a quote.
// A Personal/Business toggle switches at-cost vs margin+VAT pricing.

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, X } from "lucide-react"
import { ExcelCalculator } from "@/components/excel-calculator"
import { LaserCalculator } from "@/components/laser-calculator"
import { UvCalculator } from "@/components/uv-calculator"
import { PageLoading } from "@/components/page-loading"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { isLaserQuote, isUvQuote } from "@/lib/quote-modes"
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
  const [quotes, setQuotes] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)

  // Prefill-from-existing-quote state. Picking a quote hydrates the calculator
  // via initialPayload; the calculator is remounted (key) so re-picking resets it.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [quoteSearch, setQuoteSearch] = useState("")
  const [pickedQuote, setPickedQuote] = useState<any | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    const load = async () => {
      const supabase = createClient()
      const [p, f, lm, um, ui, g, c, q] = await Promise.all([
        supabase.from("printers").select("*").order("name"),
        supabase.from("filaments").select("*").order("created_at", { ascending: true }),
        supabase.from("laser_materials").select("*").order("created_at", { ascending: true }),
        supabase.from("uv_materials").select("*").order("created_at", { ascending: true }),
        supabase.from("uv_inks").select("*").order("sort_order", { ascending: true }),
        supabase.from("global_settings").select("*").limit(1).maybeSingle(),
        supabase.from("clients").select("*").order("name"),
        supabase.from("quotes").select("*").order("created_at", { ascending: false }),
      ])
      if (!active) return
      setPrinters(p.data ?? [])
      setFilaments(f.data ?? [])
      setLaserMaterials(lm.data ?? [])
      setUvMaterials(um.data ?? [])
      setUvInks(ui.data ?? [])
      setSettings(g.data ?? null)
      setClients(c.data ?? [])
      setQuotes(q.data ?? [])
      setLoaded(true)
    }
    load()
    return () => {
      active = false
    }
  }, [open])

  // Reset the prefill picker whenever the dialog is closed.
  useEffect(() => {
    if (!open) {
      setPickerOpen(false)
      setQuoteSearch("")
      setPickedQuote(null)
    }
  }, [open])

  // Quotes that belong to this calculator kind, filtered by the search box.
  const matchingQuotes = useMemo(() => {
    const ofKind = quotes.filter((qt) => {
      if (kind === "laser") return isLaserQuote(qt)
      if (kind === "uv") return isUvQuote(qt)
      return !isLaserQuote(qt) && !isUvQuote(qt)
    })
    const needle = quoteSearch.trim().toLowerCase()
    if (!needle) return ofKind
    return ofKind.filter((qt) =>
      [qt.quote_number, qt.quote_name, qt.client_name]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(needle)),
    )
  }, [quotes, kind, quoteSearch])

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
  // A picked existing quote prefills the calculator; otherwise fall back to the
  // task's own payload (edit mode) or a blank sheet.
  const payload = pickedQuote ?? (mode === "edit" ? task?.calc_payload ?? null : null)
  // Remount the calculator when the prefill source changes so its one-shot
  // hydration guard re-runs against the new payload.
  const calcKey = pickedQuote?.id ?? (mode === "edit" ? task?.id ?? "blank" : "blank")

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
              {mode === "create" && (
                <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
                  {pickedQuote ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-foreground">
                        Prefilled from{" "}
                        <span className="font-medium">
                          {pickedQuote.quote_number ? `${pickedQuote.quote_number} · ` : ""}
                          {pickedQuote.quote_name || "quote"}
                        </span>
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setPickedQuote(null)}>
                        <X className="mr-1 size-3.5" />
                        Clear
                      </Button>
                    </div>
                  ) : !pickerOpen ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">Start from a saved quote instead of a blank sheet.</span>
                      <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                        Prefill from a saved quote
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input
                          autoFocus
                          value={quoteSearch}
                          onChange={(e) => setQuoteSearch(e.target.value)}
                          placeholder={`Search ${CALC_KIND_LABEL[kind]} quotes…`}
                          className="bg-card pl-8"
                        />
                      </div>
                      <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                        {matchingQuotes.length === 0 ? (
                          <p className="py-4 text-center text-sm text-muted-foreground">No matching quotes.</p>
                        ) : (
                          matchingQuotes.map((qt) => (
                            <button
                              key={qt.id}
                              type="button"
                              className="w-full rounded-md border border-border/70 bg-card px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:bg-muted/40"
                              onClick={() => {
                                setPickedQuote(qt)
                                setPickerOpen(false)
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-medium text-foreground">{qt.quote_name || "Unnamed quote"}</span>
                                {qt.is_draft && (
                                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    draft
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                                {qt.quote_number && <span className="font-mono">{qt.quote_number}</span>}
                                <span>{new Date(qt.created_at).toLocaleDateString()}</span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                      <div className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setPickerOpen(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {kind === "laser" ? (
                <LaserCalculator
                  key={calcKey}
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
                  key={calcKey}
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
                  key={calcKey}
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
