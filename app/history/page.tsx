import { createClient } from "@/lib/supabase/server"
import { QuoteHistory } from "@/components/quote-history"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

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
      <header className="border-b-2 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-gray-900">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-blue-600 hover:text-blue-700 shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-blue-900 dark:text-blue-100">Quote History</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8">
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
