import { createClient } from "@/lib/supabase/server"
import { DashboardView } from "@/components/dashboard-view"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { SiteHeader, PageHeader } from "@/components/site-header"

// Server component (same pattern as app/history/page.tsx): fetch everything
// through the cookie-scoped server client and hand the rows to the client
// chart component, which owns all the recharts/interactive rendering.
export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: quotes, error: quotesError } = await supabase.from("quotes").select("*")
  const { data: clients, error: clientsError } = await supabase.from("clients").select("*")
  const { data: printers, error: printersError } = await supabase.from("printers").select("*")
  const { data: settings, error: settingsError } = await supabase
    .from("global_settings")
    .select("*")
    .limit(1)
    .maybeSingle()

  const error = quotesError || clientsError || printersError || settingsError

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/dashboard" />
      <PageHeader
        backHref="/"
        title="Dashboard"
        description="Revenue, margins and workload across your finished and in-flight quotes"
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Database Connection Error</AlertTitle>
            <AlertDescription>
              Unable to load dashboard data. Please check your Supabase dashboard and try again in a few minutes.
            </AlertDescription>
          </Alert>
        ) : (
          <DashboardView
            quotes={quotes || []}
            clients={clients || []}
            printers={printers || []}
            settings={settings ?? null}
          />
        )}
      </main>
    </div>
  )
}
