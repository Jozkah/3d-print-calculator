import { createClient } from "@/lib/supabase/server"
import { ClientsList } from "@/components/clients-list"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default async function ClientsPage() {
  const supabase = await createClient()
  
  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("name")
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="mb-6">
          <Link href="/settings">
            <Button variant="ghost" className="mb-4 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Settings
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-blue-900 mb-2">Client Management</h1>
          <p className="text-gray-600">Manage your customer information and contact details.</p>
        </div>
        
        <ClientsList clients={clients || []} />
      </div>
    </div>
  )
}
