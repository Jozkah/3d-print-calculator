"use client"

import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { PrinterVisual } from "@/components/visual/printer-visual"
import { cn } from "@/lib/utils"
import type { Printer } from "@/types/db"

type Props = {
  printers: Printer[]
  value?: string
  onSelect: (id: string) => void
  placeholder?: string
}

/** Visual replacement for the printer <Select>: rows show the machine itself. */
export function PrinterPicker({ printers, value, onSelect, placeholder = "Select printer" }: Props) {
  const [open, setOpen] = useState(false)
  const selected = printers.find((p) => p.id === value)
  const sorted = [...printers].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-auto min-h-9 w-full justify-between bg-card px-2 py-1"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <PrinterVisual name={selected.name} imageKey={selected.image_key} size="thumb" />
              <span className="truncate text-sm">{selected.name}</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-1" align="start">
        <div className="max-h-[320px] space-y-0.5 overflow-y-auto">
          {sorted.map((printer) => {
            const isSelected = printer.id === value
            return (
              <button
                key={printer.id}
                type="button"
                onClick={() => {
                  onSelect(printer.id)
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent",
                  isSelected && "bg-accent ring-1 ring-primary/50",
                )}
              >
                <PrinterVisual name={printer.name} imageKey={printer.image_key} size="thumb" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{printer.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {printer.owner} · {printer.average_power_consumption_watts}W
                    {printer.has_enclosure ? " · Enclosed" : ""}
                  </span>
                </span>
                {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            )
          })}
          {sorted.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No printers yet — add one in Settings.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
