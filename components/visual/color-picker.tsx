"use client"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** Named swatch presets: common filament colors plus a pastel row. */
export const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: "Black", hex: "#1a1a1a" },
  { name: "White", hex: "#f5f5f5" },
  { name: "Gray", hex: "#8d8d8d" },
  { name: "Silver", hex: "#c0c4c9" },
  { name: "Red", hex: "#d32f2f" },
  { name: "Orange", hex: "#f57c00" },
  { name: "Yellow", hex: "#fbc02d" },
  { name: "Green", hex: "#388e3c" },
  { name: "Blue", hex: "#1976d2" },
  { name: "Navy", hex: "#1a337e" },
  { name: "Purple", hex: "#7b1fa2" },
  { name: "Pink", hex: "#e91e8c" },
  { name: "Brown", hex: "#6d4c41" },
  { name: "Gold", hex: "#c9a227" },
  // Pastels
  { name: "Pastel Blue", hex: "#a8c8ec" },
  { name: "Sky Blue", hex: "#8ec9e8" },
  { name: "Mint", hex: "#a5d8bd" },
  { name: "Pastel Green", hex: "#c3e2b7" },
  { name: "Lavender", hex: "#c5b3e6" },
  { name: "Lilac", hex: "#d9b8e8" },
  { name: "Peach", hex: "#f7c5a8" },
  { name: "Pastel Orange", hex: "#f9d1a2" },
  { name: "Pastel Yellow", hex: "#f7e8a4" },
  { name: "Rose", hex: "#f2b8c6" },
  { name: "Baby Pink", hex: "#f6d2dd" },
  { name: "Cream", hex: "#f3ecd8" },
]

type Props = {
  /** Current hex value ("" when unset). */
  value: string
  /** Fired with the new hex; presetName is set when a swatch was clicked. */
  onChange: (hex: string, presetName?: string) => void
  className?: string
}

/**
 * Filament color field: native color input + hex text + named swatch grid.
 * Clicking a swatch reports the preset's name so callers can auto-fill an
 * empty color-name field.
 */
export function ColorPicker({ value, onChange, className }: Props) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value)
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : "#8d8d8d"}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Pick color"
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-card p-1"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#rrggbb"
          className="bg-card font-mono"
          maxLength={7}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {COLOR_PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            title={p.name}
            aria-label={p.name}
            onClick={() => onChange(p.hex, p.name)}
            className={cn(
              "size-6 rounded-full border border-black/15 transition-transform hover:scale-110 dark:border-white/20",
              value.toLowerCase() === p.hex && "ring-2 ring-ring ring-offset-1 ring-offset-background",
            )}
            style={{ backgroundColor: p.hex }}
          />
        ))}
      </div>
    </div>
  )
}
