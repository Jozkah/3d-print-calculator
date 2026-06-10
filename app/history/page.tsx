import { createClient } from "@/lib/supabase/server"
import { QuoteHistory } from "@/components/quote-history"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { SiteHeader, PageHeader } from "@/components/site-header"

export default async function HistoryPage() {
  const supabase = await createClient()

  // Drop the unused clients(name) join: QuoteHistory never reads the nested clients object
  // (it resolves names from the separately-fetched `clients` prop), so the join was dead weight.
  const { data: quotes, error: quotesError } = await supabase.from("quotes").select("*").order("created_at", { ascending: false })
  const { data: clients, error: clientsError } = await supabase.from("clients").select("*")
  const { data: printers, error: printersError } = await supabase.from("printers").select("*")
  const { data: filaments, error: filamentsError } = await supabase.from("filaments").select("*")

  // Surface backend failures instead of silently rendering an empty "No quotes saved yet" state,
  // which would mask real errors (RLS denial, schema mismatch, paused/down Supabase, network).
  const error = quotesError || clientsError || printersError || filamentsError

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/history" />
      <PageHeader
        backHref="/"
        title="Quote History"
        description="Every saved quote — filter, track status, share or edit"
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Database Connection Error</AlertTitle>
            <AlertDescription>
              Unable to load quote history. Please check your Supabase dashboard and try again in a few minutes.
            </AlertDescription>
          </Alert>
        ) : (
          <QuoteHistory quotes={quotes || []} clients={clients || []} printers={printers || []} filaments={filaments || []} />
        )}
      </main>
    </div>
  )
}
