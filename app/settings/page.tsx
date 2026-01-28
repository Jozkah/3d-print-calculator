import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Printer, Palette, Settings2, Users } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b-2 border-blue-200 bg-white">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-blue-900">Settings</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 sm:py-12">
        <div className="max-w-3xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
            <Link href="/settings/global">
              <div className="bg-white border-2 border-blue-200 rounded-lg p-6 sm:p-8 hover:border-blue-400 transition-colors">
                <Settings2 className="w-10 h-10 sm:w-12 sm:h-12 text-blue-600 mb-3 sm:mb-4" />
                <h3 className="text-xl sm:text-2xl font-semibold text-blue-900 mb-2">Global Settings</h3>
                <p className="text-sm sm:text-base text-blue-600">
                  Electricity, fuel, labor rates & efficiency factors
                </p>
              </div>
            </Link>

            <Link href="/settings/printers">
              <div className="bg-white border-2 border-blue-200 rounded-lg p-6 sm:p-8 hover:border-blue-400 transition-colors">
                <Printer className="w-10 h-10 sm:w-12 sm:h-12 text-blue-600 mb-3 sm:mb-4" />
                <h3 className="text-xl sm:text-2xl font-semibold text-blue-900 mb-2">Printers & Machines</h3>
                <p className="text-sm sm:text-base text-blue-600">
                  Manage your 3D printers, CNC machines and advanced settings
                </p>
              </div>
            </Link>

            <Link href="/settings/filaments">
              <div className="bg-white border-2 border-blue-200 rounded-lg p-6 sm:p-8 hover:border-blue-400 transition-colors">
                <Palette className="w-10 h-10 sm:w-12 sm:h-12 text-blue-600 mb-3 sm:mb-4" />
                <h3 className="text-xl sm:text-2xl font-semibold text-blue-900 mb-2">Filaments & Materials</h3>
                <p className="text-sm sm:text-base text-blue-600">Manage filament types, laser materials and prices</p>
              </div>
            </Link>

            <Link href="/settings/clients">
              <div className="bg-white border-2 border-blue-200 rounded-lg p-6 sm:p-8 hover:border-blue-400 transition-colors">
                <Users className="w-10 h-10 sm:w-12 sm:h-12 text-blue-600 mb-3 sm:mb-4" />
                <h3 className="text-xl sm:text-2xl font-semibold text-blue-900 mb-2">Clients</h3>
                <p className="text-sm sm:text-base text-blue-600">Manage customer information and contact details</p>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
