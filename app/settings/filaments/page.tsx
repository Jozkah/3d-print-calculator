"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { onLocalDbChange } from "@/lib/local-db"
import { FilamentsList } from "@/components/filaments-list"
import { SiteHeader, PageHeader } from "@/components/site-header"

export default function FilamentsPage() {
  const [filaments, setFilaments] = useState<any[]>([])
  const [materials, setMaterials] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data: filamentsData } = await supabase
        .from("filaments")
        .select("*")
        .eq("material_type", "filament")
        .order("created_at", { ascending: true })
      const { data: materialsData } = await supabase
        .from("filaments")
        .select("*")
        .eq("material_type", "material")
        .order("created_at", { ascending: true })
      setFilaments(filamentsData || [])
      setMaterials(materialsData || [])
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
        title="Filaments & Materials"
        description="Spools, laser materials, colors and pricing"
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {loaded && <FilamentsList filaments={filaments} materials={materials} />}
      </main>
    </div>
  )
}
