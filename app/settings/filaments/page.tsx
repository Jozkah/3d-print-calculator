"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { onDbChange } from "@/lib/db-realtime"
import { FilamentsList } from "@/components/filaments-list"
import { SiteHeader, PageHeader } from "@/components/site-header"

export default function FilamentsPage() {
  const [filaments, setFilaments] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data: filamentsData } = await supabase
        .from("filaments")
        .select("*")
        .eq("material_type", "filament")
        .order("created_at", { ascending: true })
      setFilaments(filamentsData || [])
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
        title="Filaments & Materials"
        description="Spools, colors and pricing"
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {loaded && <FilamentsList filaments={filaments} />}
      </main>
    </div>
  )
}
