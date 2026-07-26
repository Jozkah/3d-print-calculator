import Image from "next/image"
import { resolveFilamentBrand } from "@/lib/filament-brands"
import { cn } from "@/lib/utils"

/**
 * Small brand mark for a filament's free-text brand string: bundled logo
 * when the brand is recognized, otherwise a monogram chip with the brand's
 * first letter. Renders nothing when brand is empty. Decorative (alt="") —
 * always placed next to the brand name text.
 */
export function BrandBadge({
  brand,
  size = 16,
  className,
}: {
  brand?: string | null
  size?: number
  className?: string
}) {
  if (!brand?.trim()) return null
  const entry = resolveFilamentBrand(brand)
  if (entry?.src) {
    return (
      <Image
        src={entry.src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className={cn("inline-block shrink-0 rounded-[4px] object-contain", className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-[4px] bg-muted font-semibold text-muted-foreground",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.62 }}
    >
      {brand.trim()[0].toUpperCase()}
    </span>
  )
}
