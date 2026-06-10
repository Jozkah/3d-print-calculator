import { createClient } from "@/lib/supabase/server"
import { GlobalSettingsForm } from "@/components/global-settings-form"
import { SiteHeader, PageHeader } from "@/components/site-header"

export default async function GlobalSettingsPage() {
  const supabase = await createClient()
  const { data: settings } = await supabase.from("global_settings").select("*").single()

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/settings" />
      <PageHeader
        backHref="/settings"
        title="Global Settings"
        description="Base rates and adjustment factors used in every calculation"
      />

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <GlobalSettingsForm settings={settings} />
      </main>
    </div>
  )
}
