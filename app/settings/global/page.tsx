"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { onLocalDbChange } from "@/lib/local-db"
import { GlobalSettingsForm } from "@/components/global-settings-form"
import { SiteHeader, PageHeader } from "@/components/site-header"

export default function GlobalSettingsPage() {
  const [settings, setSettings] = useState<any>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data } = await supabase.from("global_settings").select("*").single()
      setSettings(data ?? null)
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
        title="Global Settings"
        description="Base rates and adjustment factors used in every calculation"
      />

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        {loaded && <GlobalSettingsForm settings={settings} />}
      </main>
    </div>
  )
}
