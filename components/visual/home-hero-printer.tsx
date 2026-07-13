"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { PrinterVisual } from "@/components/visual/printer-visual"
import type { Printer } from "@/types/db"

/**
 * Hero image for the landing page: the user's first printer (fleet-aware
 * flavor without loading quotes), falling back to the X1C render for fresh
 * installs. Client island because the data layer is localStorage.
 */
export function HomeHeroPrinter() {
  const [printer, setPrinter] = useState<Printer | null>(null)
  useEffect(() => {
    const loadPrinter = async () => {
      const supabase = createClient()
      const { data } = await supabase.from("printers").select("*")
      if (data && data.length > 0) setPrinter(data[0])
    }
    loadPrinter()
  }, [])
  return (
    <PrinterVisual
      name={printer?.name || "X1C"}
      imageKey={printer?.image_key}
      size="hero"
      className="mx-auto"
    />
  )
}
