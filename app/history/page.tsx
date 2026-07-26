"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { onLocalDbChange } from "@/lib/local-db"
import { QuoteHistory } from "@/components/quote-history"
import { SiteHeader, PageHeader } from "@/components/site-header"
import { PageLoading, PageLoadError } from "@/components/page-loading"

export default function HistoryPage() {
  const [quotes, setQuotes] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [printers, setPrinters] = useState<any[]>([])
  const [filaments, setFilaments] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data: quotesData, error: quotesError } = await supabase.from("quotes").select("*").order("created_at", { ascending: false })
      const { data: clientsData, error: clientsError } = await supabase.from("clients").select("*")
      const { data: printersData, error: printersError } = await supabase.from("printers").select("*")
      const { data: filamentsData, error: filamentsError } = await supabase.from("filaments").select("*")
      const firstError = quotesError || clientsError || printersError || filamentsError
      setLoadError(firstError ? firstError.message || "Could not read saved data." : null)
      setQuotes(quotesData || [])
      setClients(clientsData || [])
      setPrinters(printersData || [])
      setFilaments(filamentsData || [])
      setLoaded(true)
    }
    loadData()
    return onLocalDbChange(loadData)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/history" />
      <PageHeader
        backHref="/"
        title="Quote History"
        description="Every saved quote — filter, track status, share or edit"
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {!loaded && <PageLoading />}
        {loaded && loadError && <PageLoadError message={loadError} />}
        {loaded && !loadError && (
          <QuoteHistory quotes={quotes} clients={clients} printers={printers} filaments={filaments} />
        )}
      </main>
    </div>
  )
}
