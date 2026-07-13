"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { onLocalDbChange } from "@/lib/local-db"
import { ExcelCalculator } from "@/components/excel-calculator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SiteHeader, PageHeader } from "@/components/site-header"
import { PageLoading, PageLoadError } from "@/components/page-loading"

function BusinessPageInner() {
  const searchParams = useSearchParams()
  const editingQuoteId = searchParams.get("edit") ?? undefined

  const [printers, setPrinters] = useState<any[]>([])
  const [filaments, setFilaments] = useState<any[]>([])
  const [globalSettings, setGlobalSettings] = useState<any>(null)
  const [clients, setClients] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data: printersData, error: printersError } = await supabase.from("printers").select("*").order("name", { ascending: true })
      const { data: filamentsData, error: filamentsError } = await supabase.from("filaments").select("*").order("created_at", { ascending: true })
      const { data: globalSettingsData, error: settingsError } = await supabase.from("global_settings").select("*").limit(1).maybeSingle()
      const { data: clientsData, error: clientsError } = await supabase.from("clients").select("*").order("name")
      const firstError = printersError || filamentsError || settingsError || clientsError
      setLoadError(firstError ? firstError.message || "Could not read saved data." : null)
      setPrinters(printersData || [])
      setFilaments(filamentsData || [])
      setGlobalSettings(globalSettingsData ?? null)
      setClients(clientsData || [])
      setLoaded(true)
    }
    loadData()
    return onLocalDbChange(loadData)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/business" />
      <PageHeader
        backHref="/"
        title="Business Calculator"
        description="Client quotes with margins, VAT and automatic owner profit split"
      />

      {!loaded && <PageLoading />}
      {loaded && loadError && <PageLoadError message={loadError} />}
      {loaded && !loadError && (
        <TooltipProvider>
          <ExcelCalculator
            mode="business"
            printers={printers}
            filaments={filaments}
            globalSettings={globalSettings}
            clients={clients}
            editingQuoteId={editingQuoteId}
          />
        </TooltipProvider>
      )}
    </div>
  )
}

export default function BusinessPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <BusinessPageInner />
    </Suspense>
  )
}
