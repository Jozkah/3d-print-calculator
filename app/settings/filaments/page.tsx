import { createClient } from "@/lib/supabase/server"
import { FilamentsList } from "@/components/filaments-list"
import { SiteHeader, PageHeader } from "@/components/site-header"

export default async function FilamentsPage() {
  const supabase = await createClient()
  const { data: filaments } = await supabase
    .from("filaments")
    .select("*")
    .eq("material_type", "filament")
    .order("created_at", { ascending: true })

  const { data: materials } = await supabase
    .from("filaments")
    .select("*")
    .eq("material_type", "material")
    .order("created_at", { ascending: true })

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/settings" />
      <PageHeader
        backHref="/settings"
        title="Filaments & Materials"
        description="Spools, laser materials, colors and pricing"
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <FilamentsList filaments={filaments || []} materials={materials || []} />
      </main>
    </div>
  )
}
