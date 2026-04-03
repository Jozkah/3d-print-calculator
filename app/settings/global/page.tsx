import { createClient } from "@/lib/supabase/server"
import { GlobalSettingsForm } from "@/components/global-settings-form"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default async function GlobalSettingsPage() {
  const supabase = await createClient()
  const { data: settings } = await supabase.from("global_settings").select("*").single()

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-blue-200 dark:border-blue-800 bg-background">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="text-blue-600 hover:text-blue-800 shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-blue-900 dark:text-blue-100">Global Settings</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8 max-w-2xl">
        <GlobalSettingsForm settings={settings} />
      </main>
    </div>
  )
}
