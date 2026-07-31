"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"

type Props = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number | null | undefined
  onValueChange: (value: number) => void
}

/**
 * Numeric input that survives half-typed decimals.
 *
 * A plain controlled `<Input type="number">` bound to `parseFloat(raw) || 0`
 * cannot accept a value like 0.01: after the keystrokes "0" and "0." the parsed
 * value is 0, the field is re-rendered from that 0, and the partial decimal is
 * thrown away — the operator can never reach the digits after the point.
 *
 * Keeping the raw keystrokes in a draft while the field is focused lets the
 * text stand on its own; the parsed number is still pushed upward on every
 * change so the live totals keep updating.
 */
export function DecimalInput({ value, onValueChange, onBlur, ...rest }: Props) {
  const [draft, setDraft] = useState<string | null>(null)

  // 0 shows as an empty field (the placeholder reads better than a bare zero),
  // which matches how these inputs behaved before.
  const display = draft ?? (value ? String(value) : "")

  return (
    <Input
      {...rest}
      type="number"
      value={display}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        const parsed = Number.parseFloat(raw)
        onValueChange(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0)
      }}
      onBlur={(e) => {
        // Drop the draft so the field re-syncs with whatever the store holds.
        setDraft(null)
        onBlur?.(e)
      }}
    />
  )
}
