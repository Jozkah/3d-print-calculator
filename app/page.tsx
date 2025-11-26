import Link from "next/link"
import { Calculator, Package, History, Settings } from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <header className="border-b border-blue-200 bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-blue-900">3D Print Calculator</h1>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-blue-900 mb-4">Cost Estimator</h2>
            <p className="text-blue-700 text-lg">Calculate quotes for personal and business projects</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <Link href="/personal" className="group">
              <div className="bg-white border-2 border-blue-200 rounded-lg p-8 hover:border-blue-500 hover:shadow-lg transition-all">
                <Calculator className="w-12 h-12 text-blue-500 mb-4" />
                <h3 className="text-2xl font-semibold text-blue-900 mb-2">Personal</h3>
                <p className="text-blue-600">Calculate costs for personal projects</p>
              </div>
            </Link>

            <Link href="/business" className="group">
              <div className="bg-white border-2 border-blue-200 rounded-lg p-8 hover:border-blue-500 hover:shadow-lg transition-all">
                <Package className="w-12 h-12 text-blue-500 mb-4" />
                <h3 className="text-2xl font-semibold text-blue-900 mb-2">Business</h3>
                <p className="text-blue-600">Calculate costs with business rates</p>
              </div>
            </Link>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Link href="/history" className="group">
              <div className="bg-white border-2 border-blue-200 rounded-lg p-6 hover:border-blue-500 hover:shadow-lg transition-all">
                <History className="w-10 h-10 text-blue-500 mb-3" />
                <h3 className="text-xl font-semibold text-blue-900 mb-2">Quote History</h3>
                <p className="text-blue-600 text-sm">View all saved quotes</p>
              </div>
            </Link>

            <Link href="/settings" className="group">
              <div className="bg-white border-2 border-blue-200 rounded-lg p-6 hover:border-blue-500 hover:shadow-lg transition-all">
                <Settings className="w-10 h-10 text-blue-500 mb-3" />
                <h3 className="text-xl font-semibold text-blue-900 mb-2">Settings</h3>
                <p className="text-blue-600 text-sm">Manage printers & filaments</p>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
