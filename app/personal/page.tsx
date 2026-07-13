"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { onLocalDbChange } from "@/lib/local-db"
import { ExcelCalculator } from "@/components/excel-calculator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SiteHeader, PageHeader } from "@/components/site-header"
import { PageLoading, PageLoadError } from "@/components/page-loading"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function PersonalPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const editingQuoteId = searchParams.get("edit") ?? undefined
  const templateId = searchParams.get("template") ?? undefined

  const [printers, setPrinters] = useState<any[]>([])
  const [filaments, setFilaments] = useState<any[]>([])
  const [globalSettings, setGlobalSettings] = useState<any>(null)
  const [clients, setClients] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
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
      const firstError = printersError || filamentsError || settingsError || clientsError
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
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/personal" />
      <PageHeader
        backHref="/"
        title="Personal Calculator"
        description="At-cost estimates for your own projects — no margins, just the real numbers"
      />

      {!loaded && <PageLoading />}
      {loaded && loadError && <PageLoadError message={loadError} />}
      {loaded && !loadError && (
        <>
          {templates.length > 0 && !editingQuoteId && (
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
          <TooltipProvider>
            <ExcelCalculator
              mode="personal"
              printers={printers}
              filaments={filaments}
              globalSettings={globalSettings}
              clients={clients}
              editingQuoteId={editingQuoteId}
              templateId={templateId}
            />
          </TooltipProvider>
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
