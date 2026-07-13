"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"
import { QuotationDocument, type GlobalSettings, type Quote } from "@/components/quotation-document"

function QuoteDocument() {
  const params = useParams()
  const searchParams = useSearchParams()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [client, setClient] = useState<any>(null)
  const [settings, setSettings] = useState<GlobalSettings | null>(null)
  const [loading, setLoading] = useState(true)
  // Guard so ?print=1 triggers the print dialog once, not on every re-render.
  const printedRef = useRef(false)

  useEffect(() => {
    async function loadQuote() {
      const supabase = createClient()
      const { data, error } = await supabase.from("quotes").select("*").eq("id", params.id).single()

      if (error) {
        console.error("Error loading quote:", error)
      } else {
        setQuote(data)
        if (data.client_id) {
          const { data: clientData } = await supabase.from("clients").select("*").eq("id", data.client_id).single()
          if (clientData) {
            setClient(clientData)
          }
        }
      }
      // Settings only drive display (currency symbol, letterhead); a missing
      // row just falls back to the defaults.
      const { data: settingsData } = await supabase.from("global_settings").select("*").limit(1).maybeSingle()
      setSettings(settingsData ?? null)
      setLoading(false)
    }
    loadQuote()
  }, [params.id])

  useEffect(() => {
    if (quote?.quote_name) {
      document.title = `${quote.quote_name} - Quotation`
    }
    return () => {
      document.title = "3D Print Calculator"
    }
  }, [quote?.quote_name])

  // The history page's Download button links here with ?print=1: once the
  // quote has rendered, open the browser's print dialog (after a short delay
  // so the layout settles).
  useEffect(() => {
    if (searchParams.get("print") !== "1") return
    if (loading || !quote || printedRef.current) return
    printedRef.current = true
    const timer = setTimeout(() => window.print(), 300)
    return () => clearTimeout(timer)
  }, [searchParams, loading, quote])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-slate-500">Quote not found</p>
      </div>
    )
  }

  return <QuotationDocument quote={quote} client={client} settings={settings} />
}

// useSearchParams requires a Suspense boundary above it so the page can still
// be statically processed by the Next build.
export default function QuotePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-white">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      }
    >
      <QuoteDocument />
    </Suspense>
  )
}
