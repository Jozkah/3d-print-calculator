import { Loader2, AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Shared loading / load-error states for the data-driven pages, so they don't
// render a blank void while localStorage is read (or silently swallow a
// failed read and show an empty calculator).

export function PageLoading() {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-label="Loading">
      <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
    </div>
  )
}

export function PageLoadError({ message }: { message?: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load data</AlertTitle>
        <AlertDescription>
          {message || "Your saved data could not be read. Try reloading the page."}
        </AlertDescription>
      </Alert>
    </div>
  )
}
