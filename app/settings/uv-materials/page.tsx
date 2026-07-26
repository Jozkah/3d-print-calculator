"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { onLocalDbChange } from "@/lib/local-db"
import { UvMaterialsList } from "@/components/uv-materials-list"
import { SiteHeader, PageHeader } from "@/components/site-header"
import type { UvMaterial } from "@/types/db"

export default function UvMaterialsPage() {
  const [materials, setMaterials] = useState<UvMaterial[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data } = await supabase.from("uv_materials").select("*").order("created_at", { ascending: true })
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
        title="UV Materials"
        description="Blanks and sheet stock you UV print on — priced per piece, sheet, area or length"
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {loaded && <UvMaterialsList materials={materials} />}
      </main>
    </div>
  )
}
