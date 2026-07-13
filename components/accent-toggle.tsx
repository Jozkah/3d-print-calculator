"use client"

import { useState, useSyncExternalStore } from "react"
import { Palette } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const ACCENTS: { key: string; label: string; swatch: string }[] = [
  { key: "green", label: "Green", swatch: "oklch(0.62 0.17 150)" },
  { key: "sky", label: "Sky", swatch: "oklch(0.6 0.14 235)" },
  { key: "lavender", label: "Lavender", swatch: "oklch(0.62 0.14 295)" },
  { key: "rose", label: "Rose", swatch: "oklch(0.64 0.15 355)" },
  { key: "orange", label: "Orange", swatch: "oklch(0.7 0.15 55)" },
  { key: "yellow", label: "Yellow", swatch: "oklch(0.8 0.13 95)" },
  { key: "teal", label: "Teal", swatch: "oklch(0.6 0.11 190)" },
]

const ACCENT_STORAGE_KEY = "accent"

// Same client-only mount detection as components/theme-toggle.tsx.
const emptySubscribe = () => () => {}
const useMounted = () => useSyncExternalStore(emptySubscribe, () => true, () => false)

/**
 * Floating accent-color picker, stacked above the theme toggle. "green" is
 * the built-in default (no data-accent attribute); other presets set
 * data-accent on <html> — the boot script in app/layout.tsx re-applies the
 * stored choice before first paint.
 */
export function AccentToggle() {
  const mounted = useMounted()
  const [current, setCurrent] = useState<string>(() => {
    if (typeof window === "undefined") return "green"
    try {
      return localStorage.getItem(ACCENT_STORAGE_KEY) || "green"
    } catch {
      return "green"
    }
  })

  if (!mounted) return null

  const apply = (key: string) => {
    setCurrent(key)
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, key)
    } catch {
      // Storage unavailable (private mode) — accent still applies this session.
    }
    if (key === "green") document.documentElement.removeAttribute("data-accent")
    else document.documentElement.setAttribute("data-accent", key)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-[4.75rem] right-4 z-[9999] rounded-full w-11 h-11 bg-card border border-border shadow-lg print:hidden hover:scale-110 hover:border-primary/40 transition-transform"
          title="Accent color"
        >
          <Palette className="h-5 w-5 text-primary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="left" align="end" className="w-auto p-2">
        <div className="flex gap-1.5">
          {ACCENTS.map((a) => (
            <button
              key={a.key}
              type="button"
              title={a.label}
              aria-label={`${a.label} accent`}
              onClick={() => apply(a.key)}
              className={cn(
                "size-7 rounded-full border border-black/15 transition-transform hover:scale-110 dark:border-white/20",
                current === a.key && "ring-2 ring-ring ring-offset-2 ring-offset-background",
              )}
              style={{ backgroundColor: a.swatch }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
