import { createClient } from "@/lib/supabase/server"
import { ExcelCalculator } from "@/components/excel-calculator"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default async function PersonalPage() {
  const supabase = await createClient()

  const [{ data: printers }, { data: filaments }, { data: globalSettingsData }] = await Promise.all([
    supabase.from("printers").select("*").order("created_at", { ascending: true }),
    supabase.from("filaments").select("*").order("created_at", { ascending: true }),
    supabase.from("global_settings").select("*").limit(1).single(),
  ])

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b-2 border-blue-200 bg-white">
        <div className="max-w-[1600px] mx-auto p-4 sm:p-6 flex items-center gap-2 sm:gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-blue-600 hover:text-blue-800 shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-blue-600 truncate">Personal Calculator</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1 hidden sm:block">
              Calculate costs for personal projects
            </p>
          </div>
        </div>
      </div>
      <ExcelCalculator
        mode="personal"
        printers={printers || []}
        filaments={filaments || []}
        globalSettings={globalSettingsData}
      />
    </div>
  )
}
