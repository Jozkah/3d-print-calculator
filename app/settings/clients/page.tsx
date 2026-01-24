import { createClient } from "@/lib/supabase/server"
import { ClientsList } from "@/components/clients-list"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default async function ClientsPage() {
  const supabase = await createClient()
  
  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("name")
  
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b-2 border-blue-200 bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-blue-900">Client Management</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <ClientsList clients={clients || []} />
      </main>
    </div>
  )
}
