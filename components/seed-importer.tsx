"use client"

import { useRef, useState } from "react"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { importSeedObject } from "@/lib/seed-import"

// Manual data importer, rendered as a card in Settings.
//
// Reads a JSON dump shaped like `{ "printers": [...], "quotes": [...], ... }`
// from a user-picked file and loads it into localStorage. This intentionally
// replaced the old auto-import of `public/seed-data.json`: anything under
// public/ is served to every visitor at the web root, so private business
// data (clients, quotes) must never live there.
export function DataImportCard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const handleFile = async (file: File) => {
    setBusy(true)
    try {
      const parsed = JSON.parse(await file.text())
      const summary = importSeedObject(parsed)

      if (summary.errors.length > 0) {
        toast({
          title: "Import finished with problems",
          description: summary.errors.join(" "),
          variant: "destructive",
        })
      }
      if (summary.imported.length > 0) {
        const detail = summary.imported.map((t) => `${t.table} (${t.rows})`).join(", ")
        toast({ title: "Data imported", description: `Loaded ${detail}. Reloading…` })
        // Reload so every open view re-reads the freshly imported tables.
        setTimeout(() => window.location.reload(), 800)
      } else if (summary.errors.length === 0) {
        toast({
          title: "Nothing imported",
          description:
            summary.skipped.length > 0
              ? `No known tables in file (skipped: ${summary.skipped.join(", ")}).`
              : "The file contained no data.",
          variant: "destructive",
        })
      }
    } catch (e: any) {
      toast({
        title: "Import failed",
        description: e?.message ?? "Could not read the file as JSON.",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Upload className="size-5.5" />
        </span>
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">Import data</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        Load a JSON backup (printers, filaments, clients, quotes…) into this browser. Replaces the
        existing contents of each table found in the file.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
        }}
      />
      <Button
        variant="outline"
        className="mt-4 w-fit"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? "Importing…" : "Choose backup file"}
      </Button>
    </div>
  )
}
