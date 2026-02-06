import { createClient } from "@/lib/supabase/server"
import { QuoteHistory } from "@/components/quote-history"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default async function HistoryPage() {
  const supabase = await createClient()

  const { data: quotes } = await supabase.from("quotes").select("*, clients(name)").order("created_at", { ascending: false })
  const { data: clients } = await supabase.from("clients").select("*")
  const { data: printers } = await supabase.from("printers").select("*")
  const { data: filaments } = await supabase.from("filaments").select("*")

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b-2 border-blue-300 bg-blue-50">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-blue-600 hover:text-blue-700 shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-blue-900">Quote History</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8">
        <QuoteHistory quotes={quotes || []} clients={clients || []} printers={printers || []} filaments={filaments || []} />
      </main>
    </div>
  )
}
