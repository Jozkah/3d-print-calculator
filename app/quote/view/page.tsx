"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { QuotationDocument } from "@/components/quotation-document"
import type { GlobalSettings, Quote } from "@/types/db"

// Self-contained quotation view: the whole document payload travels in the
// URL fragment (#d=<base64url JSON>), which never reaches any server. The
// recipient needs no local data — decoding happens entirely in their browser.

type SharePayload = {
  quote: Partial<Quote>
  client: Record<string, any> | null
  settings: Partial<GlobalSettings> | null
}

/** Reverse of the share-link encoding: base64url -> unicode JSON. */
function decodePayload(encoded: string): SharePayload {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const json = decodeURIComponent(
    binary
      .split("")
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join(""),
  )
  return JSON.parse(json) as SharePayload
}

export default function SharedQuoteViewPage() {
  const [payload, setPayload] = useState<SharePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Deferred so state updates come from a callback rather than the effect
    // body itself (avoids a synchronous cascading render on mount).
    const timer = setTimeout(() => {
      try {
        const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash
        const params = new URLSearchParams(hash)
        const data = params.get("d")
        if (!data) {
          setError("This link is missing its quotation data.")
        } else {
          const decoded = decodePayload(data)
          if (!decoded || typeof decoded !== "object" || !decoded.quote) {
            setError("This link contains no readable quotation.")
          } else {
            setPayload(decoded)
          }
        }
      } catch {
        setError("This link contains no readable quotation.")
      }
      setLoading(false)
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (payload?.quote?.quote_name) {
      document.title = `${payload.quote.quote_name} - Quotation`
    }
    return () => {
      document.title = "3D Print Calculator"
    }
  }, [payload?.quote?.quote_name])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !payload) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-slate-500">{error || "Quote not found"}</p>
      </div>
    )
  }

  return (
    <QuotationDocument
      quote={payload.quote as Quote}
      client={payload.client}
      settings={(payload.settings as GlobalSettings) ?? null}
    />
  )
}
