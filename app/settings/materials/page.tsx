"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { onLocalDbChange } from "@/lib/local-db"
import { LaserMaterialsList } from "@/components/laser-materials-list"
import { SiteHeader, PageHeader } from "@/components/site-header"
import type { LaserMaterial } from "@/types/db"

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<LaserMaterial[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data } = await supabase.from("laser_materials").select("*").order("created_at", { ascending: true })
      setMaterials(data || [])
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
        title="Laser & Sticker Materials"
        description="Sheets, rolls and blanks — each priced per sheet, area, length or piece"
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {loaded && <LaserMaterialsList materials={materials} />}
      </main>
    </div>
  )
}
