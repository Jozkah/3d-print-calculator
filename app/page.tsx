import Link from "next/link"
import { Calculator, Package, History, Settings } from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <header className="border-b border-blue-200 dark:border-blue-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <h1 className="text-xl sm:text-2xl font-bold text-blue-900 dark:text-blue-100">3D Print Calculator</h1>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-blue-900 dark:text-blue-100 mb-3 sm:mb-4">Cost Estimator</h2>
            <p className="text-blue-700 dark:text-blue-300 text-base sm:text-lg px-4">
              Calculate quotes for personal and business projects
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <Link href="/personal" className="group">
              <div className="bg-white dark:bg-gray-900 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-6 sm:p-8 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg transition-all min-h-[160px] sm:min-h-[200px] flex flex-col">
                <Calculator className="w-10 h-10 sm:w-12 sm:h-12 text-blue-500 mb-3 sm:mb-4" />
                <h3 className="text-xl sm:text-2xl font-semibold text-blue-900 dark:text-blue-100 mb-2">Personal</h3>
                <p className="text-sm sm:text-base text-blue-600 dark:text-blue-400">Calculate costs for personal projects</p>
              </div>
            </Link>

            <Link href="/business" className="group">
              <div className="bg-white dark:bg-gray-900 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-6 sm:p-8 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg transition-all min-h-[160px] sm:min-h-[200px] flex flex-col">
                <Package className="w-10 h-10 sm:w-12 sm:h-12 text-blue-500 mb-3 sm:mb-4" />
                <h3 className="text-xl sm:text-2xl font-semibold text-blue-900 dark:text-blue-100 mb-2">Business</h3>
                <p className="text-sm sm:text-base text-blue-600 dark:text-blue-400">Calculate costs with business rates</p>
              </div>
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
            <Link href="/history" className="group">
              <div className="bg-white dark:bg-gray-900 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-5 sm:p-6 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg transition-all">
                <History className="w-8 h-8 sm:w-10 sm:h-10 text-blue-500 mb-2 sm:mb-3" />
                <h3 className="text-lg sm:text-xl font-semibold text-blue-900 dark:text-blue-100 mb-1 sm:mb-2">Quote History</h3>
                <p className="text-blue-600 dark:text-blue-400 text-xs sm:text-sm">View all saved quotes</p>
              </div>
            </Link>

            <Link href="/settings" className="group">
              <div className="bg-white dark:bg-gray-900 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-5 sm:p-6 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg transition-all">
                <Settings className="w-8 h-8 sm:w-10 sm:h-10 text-blue-500 mb-2 sm:mb-3" />
                <h3 className="text-lg sm:text-xl font-semibold text-blue-900 dark:text-blue-100 mb-1 sm:mb-2">Settings</h3>
                <p className="text-blue-600 dark:text-blue-400 text-xs sm:text-sm">Manage printers & filaments</p>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
