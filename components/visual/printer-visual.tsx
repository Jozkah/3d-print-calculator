import Image from "next/image"
import { Printer as PrinterIcon } from "lucide-react"
import { resolvePrinterImage } from "@/lib/printer-images"
import { cn } from "@/lib/utils"

const SIZES = { thumb: 40, card: 160, hero: 280 } as const

type Props = {
  name: string
  imageKey?: string | null
  size: keyof typeof SIZES
  className?: string
}

/**
 * A printer's product identity: bundled cutout render on the studio-floor
 * gradient, or a neutral icon silhouette for machines we have no image for.
 * Decorative (alt="") — the printer name is always rendered as text nearby.
 */
export function PrinterVisual({ name, imageKey, size, className }: Props) {
  const entry = resolvePrinterImage(name, imageKey)
  const px = SIZES[size]
  return (
    <span
      className={cn(
        "surface-studio flex shrink-0 items-center justify-center overflow-hidden",
        size === "thumb" ? "rounded-lg" : "rounded-2xl",
        className,
      )}
      style={{ width: px, height: px }}
    >
      {entry ? (
        <Image
          src={entry.src}
          alt=""
          width={px}
          height={px}
          loading={size === "hero" ? "eager" : "lazy"}
          className="h-[88%] w-[88%] object-contain drop-shadow-sm"
        />
      ) : (
        <PrinterIcon
          aria-hidden
          className="text-muted-foreground/40"
          style={{ width: px * 0.45, height: px * 0.45 }}
        />
      )}
    </span>
  )
}
