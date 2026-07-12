"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { onLocalDbChange } from "@/lib/local-db"
import { PrintersList } from "@/components/printers-list"
import { SiteHeader, PageHeader } from "@/components/site-header"

export default function PrintersPage() {
  const [printers, setPrinters] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data } = await supabase.from("printers").select("*").order("name", { ascending: true })
      setPrinters(data || [])
      setLoaded(true)
    }
    loadData()
    return onLocalDbChange(loadData)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/settings" />
      <PageHeader
        backHref="/settings"
        title="Printers & Machines"
        description="Machine costs, lifetime, power draw and uptime"
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {loaded && <PrintersList printers={printers} />}
      </main>
    </div>
  )
}
