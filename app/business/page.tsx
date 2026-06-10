import { createClient } from "@/lib/supabase/server"
import { ExcelCalculator } from "@/components/excel-calculator"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SiteHeader, PageHeader } from "@/components/site-header"

export default async function BusinessPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let printers = []
  let filaments = []
  let globalSettingsData = null
  let clients = []
  let error = null

  try {
    const [printersResult, filamentsResult, globalSettingsResult, clientsResult] = await Promise.all([
      supabase.from("printers").select("*").order("name", { ascending: true }),
      supabase.from("filaments").select("*").order("created_at", { ascending: true }),
      // Use maybeSingle() so a 0-row global_settings table returns { data: null, error: null }
      // instead of a PGRST116 error. The downstream ExcelCalculator already handles a null
      // globalSettings prop, so a missing settings row must not blank the whole calculator.
      supabase.from("global_settings").select("*").limit(1).maybeSingle(),
      supabase.from("clients").select("*").order("name"),
    ])

    printers = printersResult.data || []
    filaments = filamentsResult.data || []
    globalSettingsData = globalSettingsResult.data
    clients = clientsResult.data || []

    // Check for Supabase errors
    if (printersResult.error || filamentsResult.error || globalSettingsResult.error || clientsResult.error) {
      error = printersResult.error || filamentsResult.error || globalSettingsResult.error || clientsResult.error
    }
  } catch (e) {
    error = e
    console.error("Database connection error:", e)
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/business" />
      <PageHeader
        backHref="/"
        title="Business Calculator"
        description="Client quotes with margins, VAT and automatic owner profit split"
      />

      {error ? (
        <div className="max-w-7xl mx-auto p-4 sm:p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Database Connection Error</AlertTitle>
            <AlertDescription>
              Unable to connect to the database. This could be due to:
              <ul className="list-disc ml-5 mt-2">
                <li>Your Supabase instance may be paused or experiencing downtime</li>
                <li>Network connectivity issues</li>
                <li>Configuration problems</li>
              </ul>
              <p className="mt-2">Please check your Supabase dashboard and try again in a few minutes.</p>
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <TooltipProvider>
          <ExcelCalculator
            mode="business"
          printers={printers}
          filaments={filaments}
          globalSettings={globalSettingsData}
          clients={clients}
          editingQuoteId={params.edit}
          />
        </TooltipProvider>
      )}
    </div>
  )
}
