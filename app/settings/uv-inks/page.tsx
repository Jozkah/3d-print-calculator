"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { onLocalDbChange } from "@/lib/local-db"
import { UvInksList } from "@/components/uv-inks-list"
import { SiteHeader, PageHeader } from "@/components/site-header"
import type { GlobalSettings, UvInk } from "@/types/db"

export default function UvInksPage() {
  const [inks, setInks] = useState<UvInk[]>([])
  const [settings, setSettings] = useState<GlobalSettings | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data } = await supabase.from("uv_inks").select("*").order("sort_order", { ascending: true })
      const { data: settingsData } = await supabase.from("global_settings").select("*").limit(1).maybeSingle()
      setInks(data || [])
      setSettings(settingsData ?? null)
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
        title="UV Inks"
        description="Per-colour OEM and refill prices — quotes always bill at the OEM price"
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {loaded && <UvInksList inks={inks} currency={settings?.currency_symbol || "€"} />}
      </main>
    </div>
  )
}
