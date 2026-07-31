import Image from "next/image"
import { Printer as PrinterIcon } from "lucide-react"
import { resolvePrinterImage, isUploadedImage } from "@/lib/printer-images"
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
      {isUploadedImage(imageKey) ? (
        // Uploaded pictures are inline data URLs: next/image cannot optimise
        // those, so render them with a plain <img>.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageKey}
          alt=""
          width={px}
          height={px}
          className="h-[88%] w-[88%] object-contain drop-shadow-sm"
        />
      ) : entry ? (
        <Image
          src={entry.src}
          alt=""
          width={px}
          height={px}
          priority={size === "hero"}
          loading={size === "hero" ? undefined : "lazy"}
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
