"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { onLocalDbChange } from "@/lib/local-db"
import { ExcelCalculator } from "@/components/excel-calculator"
import { LaserCalculator } from "@/components/laser-calculator"
import { UvCalculator } from "@/components/uv-calculator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SiteHeader, PageHeader } from "@/components/site-header"
import { PageLoading, PageLoadError } from "@/components/page-loading"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { resolveCalcType } from "@/lib/quote-modes"

function PersonalPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const editingQuoteId = searchParams.get("edit") ?? undefined
  const templateId = searchParams.get("template") ?? undefined
  const typeParam = searchParams.get("type")

  const [printers, setPrinters] = useState<any[]>([])
  const [filaments, setFilaments] = useState<any[]>([])
  const [laserMaterials, setLaserMaterials] = useState<any[]>([])
  const [uvMaterials, setUvMaterials] = useState<any[]>([])
  const [uvInks, setUvInks] = useState<any[]>([])
  const [globalSettings, setGlobalSettings] = useState<any>(null)
  const [clients, setClients] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [editingQuote, setEditingQuote] = useState<any | null | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data: printersData, error: printersError } = await supabase.from("printers").select("*").order("name", { ascending: true })
      const { data: filamentsData, error: filamentsError } = await supabase.from("filaments").select("*").order("created_at", { ascending: true })
      const { data: globalSettingsData, error: settingsError } = await supabase.from("global_settings").select("*").limit(1).single()
      const { data: clientsData, error: clientsError } = await supabase.from("clients").select("*").order("name")
      const { data: templatesData } = await supabase.from("quote_templates").select("*").order("name")
      const { data: laserMaterialsData, error: laserMaterialsError } = await supabase.from("laser_materials").select("*").order("created_at", { ascending: true })
      const { data: uvMaterialsData, error: uvMaterialsError } = await supabase.from("uv_materials").select("*").order("created_at", { ascending: true })
      const { data: uvInksData, error: uvInksError } = await supabase.from("uv_inks").select("*").order("sort_order", { ascending: true })
      setLaserMaterials(laserMaterialsData || [])
      setUvMaterials(uvMaterialsData || [])
      setUvInks(uvInksData || [])
      let quoteError: { message?: string } | null = null
      if (editingQuoteId) {
        const { data: quoteRow, error } = await supabase.from("quotes").select("*").eq("id", editingQuoteId).maybeSingle()
        setEditingQuote(quoteRow ?? null)
        quoteError = error
      } else {
        setEditingQuote(null)
      }
      const firstError = printersError || filamentsError || settingsError || clientsError || laserMaterialsError || uvMaterialsError || uvInksError || quoteError
      setLoadError(firstError ? firstError.message || "Could not read saved data." : null)
      setPrinters(printersData || [])
      setFilaments(filamentsData || [])
      setGlobalSettings(globalSettingsData ?? null)
      setClients(clientsData || [])
      setTemplates(templatesData || [])
      setLoaded(true)
    }
    loadData()
    return onLocalDbChange(loadData)
  }, [editingQuoteId])

  const calcType = resolveCalcType({
    isEditing: Boolean(editingQuoteId) && editingQuote != null,
    editingQuoteMode: editingQuote?.quote_type_mode as string | undefined,
    typeParam,
    // The template picker only puts ?template= in the URL, so the template's
    // own mode is what tells us which calculator to open.
    templateMode: templates.find((t) => t.id === templateId)?.payload?.quote_type_mode,
  })

  const printers3d = printers.filter((p) => !p.machine_type || p.machine_type === "3d-printer")
  const laserMachines = printers.filter((p) => p.machine_type === "laser" || p.machine_type === "sticker-printer")
  const uvMachines = printers.filter((p) => p.machine_type === "uv-printer")

  const isLoading = !loaded || Boolean(editingQuoteId && editingQuote === undefined)
  const quoteNotFound = Boolean(editingQuoteId) && editingQuote === null

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/personal" />
      <PageHeader
        backHref="/"
        title="Personal Calculator"
        description="At-cost estimates for your own projects — no margins, just the real numbers"
      />

      {isLoading && <PageLoading />}
      {!isLoading && loadError && <PageLoadError message={loadError} />}
      {!isLoading && !loadError && quoteNotFound && (
        <PageLoadError message="This quote no longer exists — it may have been deleted." />
      )}
      {!isLoading && !loadError && !quoteNotFound && (
        <>
          {!editingQuoteId && (
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
              <div className="inline-flex rounded-lg border border-border bg-card p-1 gap-1">
                <Button size="sm" variant={calcType === "3d-print" ? "default" : "ghost"}
                  onClick={() => router.push("/personal")}>3D Print</Button>
                <Button size="sm" variant={calcType === "laser" ? "default" : "ghost"}
                  onClick={() => router.push("/personal?type=laser")}>Laser &amp; Stickers</Button>
                <Button size="sm" variant={calcType === "uv" ? "default" : "ghost"}
                  onClick={() => router.push("/personal?type=uv")}>UV Printing</Button>
              </div>
            </div>
          )}
          {templates.length > 0 && !editingQuoteId && (calcType === "3d-print" || calcType === "uv") && (
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <span className="text-sm font-medium text-muted-foreground shrink-0">Start from template:</span>
                <Select
                  value={templateId ?? ""}
                  onValueChange={(value) => router.push(`/personal?template=${value}`)}
                >
                  <SelectTrigger className="w-full sm:w-[300px] bg-card" aria-label="Start from template">
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {calcType === "legacy-laser" && (
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
              <Card className="p-6 space-y-3">
                <h2 className="text-lg font-semibold">This quote uses the old laser format</h2>
                <p className="text-sm text-muted-foreground">
                  Quotes saved before the laser rework can still be viewed in history and as documents, but can't be
                  edited here. Start a fresh laser quote instead — your client is one click away.
                </p>
                <Button onClick={() => router.push("/personal?type=laser")}>Start new laser quote</Button>
              </Card>
            </div>
          )}
          {calcType === "laser" && (
            <LaserCalculator
              mode="personal"
              machines={laserMachines}
              materials={laserMaterials}
              globalSettings={globalSettings}
              clients={clients}
              editingQuoteId={editingQuoteId}
            />
          )}
          {calcType === "uv" && (
            <UvCalculator
              mode="personal"
              machines={uvMachines}
              materials={uvMaterials}
              inks={uvInks}
              globalSettings={globalSettings}
              clients={clients}
              editingQuoteId={editingQuoteId}
              templateId={templateId}
            />
          )}
          {calcType === "3d-print" && (
            <TooltipProvider>
              <ExcelCalculator
                mode="personal"
                printers={printers3d}
                filaments={filaments}
                globalSettings={globalSettings}
                clients={clients}
                editingQuoteId={editingQuoteId}
                templateId={templateId}
              />
            </TooltipProvider>
          )}
        </>
      )}
    </div>
  )
}

export default function PersonalPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <PersonalPageInner />
    </Suspense>
  )
}
