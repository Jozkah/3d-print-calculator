import { createClient } from "@/lib/supabase/server"
import { FilamentsList } from "@/components/filaments-list"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

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
      <header className="border-b-2 border-blue-200 dark:border-blue-800 bg-background">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-blue-900 dark:text-blue-100">Manage Filaments & Materials</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <FilamentsList filaments={filaments || []} materials={materials || []} />
      </main>
    </div>
  )
}
