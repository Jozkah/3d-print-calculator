import { createClient } from "@/lib/supabase/server"
import { ExcelCalculator } from "@/components/excel-calculator"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SiteHeader, PageHeader } from "@/components/site-header"
import { TemplatePicker } from "@/components/template-picker"

export default async function PersonalPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; template?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let printers = []
  let filaments = []
  let globalSettingsData = null
  let clients = []
  let templates: { id: string; name: string }[] = []
  let error = null

  try {
    const [printersResult, filamentsResult, globalSettingsResult, clientsResult, templatesResult] = await Promise.all([
      supabase.from("printers").select("*").order("name", { ascending: true }),
      supabase.from("filaments").select("*").order("created_at", { ascending: true }),
      supabase.from("global_settings").select("*").limit(1).single(),
      supabase.from("clients").select("*").order("name"),
      supabase.from("quote_templates").select("id, name").order("name"),
    ])

    printers = printersResult.data || []
    filaments = filamentsResult.data || []
    globalSettingsData = globalSettingsResult.data
    clients = clientsResult.data || []
    // Templates are optional sugar: ignore templatesResult.error so a missing
    // quote_templates table (pre-migration) doesn't blank the calculator.
    templates = templatesResult.data || []

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
      <SiteHeader active="/personal" />
      <PageHeader
        backHref="/"
        title="Personal Calculator"
        description="At-cost estimates for your own projects — no margins, just the real numbers"
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
        <>
          {!params.edit && <TemplatePicker templates={templates} value={params.template} basePath="/personal" />}
          <TooltipProvider>
            <ExcelCalculator
              mode="personal"
              printers={printers}
              filaments={filaments}
              globalSettings={globalSettingsData}
              clients={clients}
              editingQuoteId={params.edit}
              templateId={params.template}
            />
          </TooltipProvider>
        </>
      )}
    </div>
  )
}
