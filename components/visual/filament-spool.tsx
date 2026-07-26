import { cn } from "@/lib/utils"

const RIM = "var(--color-foreground)"
const FULL_STOCK_GRAMS = 3000

/** SVG spool tinted by the filament's stored color_hex (gray when unset). */
export function FilamentSpool({
  colorHex,
  size = 40,
  className,
}: {
  colorHex?: string | null
  size?: number
  className?: string
}) {
  const fill = colorHex || "oklch(0.75 0.01 260)"
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <circle cx="24" cy="24" r="22" fill={RIM} opacity="0.85" />
      <circle cx="24" cy="24" r="17.5" fill={fill} />
      {/* winding grooves */}
      <circle cx="24" cy="24" r="14.5" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
      <circle cx="24" cy="24" r="11.5" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
      <circle cx="24" cy="24" r="7" fill={RIM} opacity="0.85" />
      <circle cx="24" cy="24" r="3.5" fill="var(--color-background)" />
    </svg>
  )
}

/**
 * Spool wrapped in a stock arc. Arc is hidden when stock is untracked
 * (null/undefined); amber when below the low-stock threshold, green otherwise.
 */
export function SpoolWithStock({
  colorHex,
  stockGrams,
  lowThresholdGrams = 1000,
  size = 56,
}: {
  colorHex?: string | null
  stockGrams?: number | null
  lowThresholdGrams?: number
  size?: number
}) {
  const tracked = typeof stockGrams === "number"
  const frac = tracked ? Math.min(1, Math.max(0, stockGrams / FULL_STOCK_GRAMS)) : 0
  const low = tracked && stockGrams < lowThresholdGrams
  const r = 23
  const dash = 2 * Math.PI * r
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {tracked && (
        <svg
          viewBox="0 0 52 52"
          width={size}
          height={size}
          style={{ width: size, height: size }}
          aria-hidden
          className="absolute inset-0 -rotate-90"
        >
          <circle cx="26" cy="26" r={r} fill="none" stroke="var(--color-border)" strokeWidth="2.5" />
          <circle
            cx="26"
            cy="26"
            r={r}
            fill="none"
            stroke={low ? "oklch(0.72 0.15 70)" : "var(--color-primary)"}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={dash}
            strokeDashoffset={dash * (1 - frac)}
          />
        </svg>
      )}
      <FilamentSpool colorHex={colorHex} size={size * 0.78} />
    </span>
  )
}
