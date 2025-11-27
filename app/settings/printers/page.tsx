import { createClient } from "@/lib/supabase/server"
import { PrintersList } from "@/components/printers-list"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default async function PrintersPage() {
  const supabase = await createClient()
  const { data: printers } = await supabase.from("printers").select("*").order("created_at", { ascending: true })

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b-2 border-blue-200 bg-white">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-blue-900 truncate">Manage Printers & Dryers</h1>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 sm:py-8">
        <PrintersList printers={printers || []} />
      </main>
    </div>
  )
}
