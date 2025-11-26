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
        <div className="max-w-[1600px] mx-auto p-6 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-blue-600 hover:text-blue-800">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-blue-600">Personal Calculator</h1>
          <p className="text-gray-600 mt-2">Calculate costs for personal projects</p>
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
