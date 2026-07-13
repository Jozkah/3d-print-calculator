"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { useSyncExternalStore } from "react"

// Client-only mount detection without a setState-in-effect cascade: the
// server snapshot is false, the client snapshot is true, so the toggle
// renders nothing during SSR/hydration and appears right after.
const emptySubscribe = () => () => {}
const useMounted = () => useSyncExternalStore(emptySubscribe, () => true, () => false)

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()

  if (!mounted) return null

  return (
    <Button
      variant="outline"
      size="icon"
      className="fixed bottom-4 right-4 z-[9999] rounded-full w-11 h-11 bg-card border border-border shadow-lg print:hidden hover:scale-110 hover:border-primary/40 transition-transform"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-yellow-500" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-blue-400" />
    </Button>
  )
}
