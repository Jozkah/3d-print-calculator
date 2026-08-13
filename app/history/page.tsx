"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { onDbChange } from "@/lib/db-realtime"
import { backfillQuoteNumbers } from "@/lib/quote-number"
import { QuoteHistory } from "@/components/quote-history"
import { SiteHeader, PageHeader } from "@/components/site-header"
import { PageLoading, PageLoadError } from "@/components/page-loading"

export default function HistoryPage() {
  const [quotes, setQuotes] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [printers, setPrinters] = useState<any[]>([])
  const [filaments, setFilaments] = useState<any[]>([])
  const [taskEntries, setTaskEntries] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      // Give pre-reference quotes their Q-YYYY-NNN before rendering the list.
      await backfillQuoteNumbers()
      const { data: quotesData, error: quotesError } = await supabase.from("quotes").select("*").order("created_at", { ascending: false })
      const { data: clientsData, error: clientsError } = await supabase.from("clients").select("*")
      const { data: printersData, error: printersError } = await supabase.from("printers").select("*")
      const { data: filamentsData, error: filamentsError } = await supabase.from("filaments").select("*")
      // Production tasks are shown interleaved with quotes in the combined feed.
      const { data: ordersData } = await supabase.from("orders").select("*")
      const { data: tasksData } = await supabase.from("order_tasks").select("*")
      const firstError = quotesError || clientsError || printersError || filamentsError
      setLoadError(firstError ? firstError.message || "Could not read saved data." : null)
      setQuotes(quotesData || [])
      setClients(clientsData || [])
      setPrinters(printersData || [])
      setFilaments(filamentsData || [])

      // Enrich each task with its order's number/client for display + filtering.
      const orderById = new Map<string, any>((ordersData || []).map((o: any) => [o.id, o]))
      const entries = (tasksData || []).map((t: any) => {
        const ord = orderById.get(t.order_id)
        return {
          id: t.id,
          name: t.name,
          type: t.type,
          status: t.status,
          price: t.price ?? null,
          machine_name: t.machine_name ?? null,
          material_name: t.material_name ?? null,
          created_at: t.created_at,
          order_id: t.order_id,
          order_number: ord?.order_number ?? null,
          client_id: t.client_id ?? ord?.client_id ?? null,
          client_name: t.client_name ?? ord?.client_snapshot?.name ?? null,
        }
      })
      setTaskEntries(entries)
      setLoaded(true)
    }
    loadData()
    return onDbChange(loadData)
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
          <QuoteHistory quotes={quotes} clients={clients} printers={printers} filaments={filaments} taskEntries={taskEntries} />
        )}
      </main>
    </div>
  )
}
