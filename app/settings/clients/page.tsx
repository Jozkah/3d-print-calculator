"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { onDbChange } from "@/lib/db-realtime"
import { ClientsList } from "@/components/clients-list"
import { SiteHeader, PageHeader } from "@/components/site-header"

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data } = await supabase.from("clients").select("*").order("name")
      setClients(data || [])
      setLoaded(true)
    }
    loadData()
    return onDbChange(loadData)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/settings" />
      <PageHeader
        backHref="/settings"
        title="Clients"
        description="Customer details and notes for your quotes"
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {loaded && <ClientsList clients={clients} />}
      </main>
    </div>
  )
}
