import { createClient } from "@/lib/supabase/server"
import { PrintersList } from "@/components/printers-list"
import { SiteHeader, PageHeader } from "@/components/site-header"

export default async function PrintersPage() {
  const supabase = await createClient()
  const { data: printers } = await supabase.from("printers").select("*").order("name", { ascending: true })

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/settings" />
      <PageHeader
        backHref="/settings"
        title="Printers & Machines"
        description="Machine costs, lifetime, power draw and uptime"
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <PrintersList printers={printers || []} />
      </main>
    </div>
  )
}
