import { cn } from "@/lib/utils"

/** Deterministic pastel hue from the client id so avatars are stable. */
function hueFromId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360
  return h
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function ClientAvatar({
  id,
  name,
  size = 32,
  className,
}: {
  id: string
  name: string
  size?: number
  className?: string
}) {
  const hue = hueFromId(id)
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `oklch(0.9 0.06 ${hue})`,
        color: `oklch(0.35 0.09 ${hue})`,
      }}
    >
      {initials(name)}
    </span>
  )
}
