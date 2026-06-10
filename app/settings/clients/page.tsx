import { createClient } from "@/lib/supabase/server"
import { ClientsList } from "@/components/clients-list"
import { SiteHeader, PageHeader } from "@/components/site-header"

export default async function ClientsPage() {
  const supabase = await createClient()
  
  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("name")
  
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/settings" />
      <PageHeader
        backHref="/settings"
        title="Clients"
        description="Customer details and notes for your quotes"
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <ClientsList clients={clients || []} />
      </main>
    </div>
  )
}
