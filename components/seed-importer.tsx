"use client"

import { useRef, useState } from "react"
import { Download, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { exportAll, importSeedObject } from "@/lib/seed-import"

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

// Backup exporter, rendered next to the import card in Settings.
//
// Serializes every `3dpc:` table in localStorage to a pretty-printed JSON
// file (the same shape DataImportCard reads back), downloaded via a
// temporary object-URL link — the same pattern as the filaments CSV export.
// Rough localStorage footprint of the app's data: UTF-16 = 2 bytes/char,
// against the typical ~5MB per-origin quota. Estimate only — good enough to
// warn before the quota error actually hits.
function storageUsage(): { usedKb: number; percent: number } {
  let chars = 0
  if (typeof window !== "undefined" && window.localStorage) {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key || !key.startsWith("3dpc:")) continue
      chars += key.length + (window.localStorage.getItem(key)?.length ?? 0)
    }
  }
  const usedKb = Math.round((chars * 2) / 1024)
  return { usedKb, percent: Math.min(100, Math.round((usedKb / 5120) * 100)) }
}

export function DataExportCard() {
  const { toast } = useToast()
  const [usage] = useState(storageUsage)

  const handleExport = () => {
    try {
      const data = exportAll()
      const tables = Object.keys(data)
      if (tables.length === 0) {
        toast({
          title: "Nothing to export",
          description: "No saved data was found in this browser.",
          variant: "destructive",
        })
        return
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.setAttribute("href", url)
      link.setAttribute("download", `3dpc-backup-${new Date().toISOString().split("T")[0]}.json`)
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: "Backup exported",
        description: `Saved ${tables.length} table${tables.length !== 1 ? "s" : ""} (${tables.join(", ")}).`,
      })
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message ?? "Could not create the backup file.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Download className="size-5.5" />
        </span>
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">Export backup</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        Download everything stored in this browser (printers, filaments, clients, quotes, settings)
        as a JSON file you can re-import later or on another machine.
      </p>
      <Button variant="outline" className="mt-4 w-fit" onClick={handleExport}>
        Export backup
      </Button>
      <p className={`mt-3 text-xs ${usage.percent >= 80 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
        Browser storage used: ~{usage.usedKb} KB ({usage.percent}% of the typical 5 MB quota)
        {usage.percent >= 80 ? " — export a backup and delete old quotes soon." : ""}
      </p>
    </div>
  )
}
