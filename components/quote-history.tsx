"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Trash2,
  ChevronDown,
  ChevronUp,
  Share2,
  Download,
  Pencil,
  AlertTriangle,
  Clock,
  Truck,
  CheckCircle,
  XCircle,
  Ban,
  RefreshCw,
  Copy,
  Filter,
  User,
  Printer,
  Package,
  FileText,
  Search,
  CalendarRange,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

import type { Quote as QuoteRow } from "@/types/db"

// History rows carry a derived join artifact (`client_name`, resolved from the
// client_id at load time) on top of the stored quote columns.
type Quote = QuoteRow & {
  client_name?: string
}

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-700 border-gray-300", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700 border-blue-300", icon: Clock },
  shipping: { label: "Shipping", color: "bg-purple-100 text-purple-700 border-purple-300", icon: Truck },
  finished: { label: "Finished", color: "bg-green-100 text-green-700 border-green-300", icon: CheckCircle },
  canceled: { label: "Canceled", color: "bg-red-100 text-red-700 border-red-300", icon: XCircle },
  invalid: { label: "Invalid", color: "bg-orange-100 text-orange-700 border-orange-300", icon: Ban },
}

const safeFixed = (value: any, decimals = 2) => {
  return (value ?? 0).toFixed(decimals)
}

function QuoteHistory({
  quotes,
  clients = [],
  printers = [],
  filaments = []
}: {
  quotes: Quote[],
  clients?: any[],
  printers?: any[],
  filaments?: any[]
}) {
  // Fully controlled: props are the source of truth. The parent page reloads
  // on every local-db change (including this component's own mutations), so
  // copying props into state here only created a second, stale copy.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [statusFilters, setStatusFilters] = useState<string[]>([])
  const [clientFilters, setClientFilters] = useState<string[]>([])
  const [printerFilters, setPrinterFilters] = useState<string[]>([])
  const [filamentFilters, setFilamentFilters] = useState<string[]>([])
  const { toast } = useToast()
  const router = useRouter()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [quoteToDelete, setQuoteToDelete] = useState<string | null>(null)

  // Captured once per mount so render stays pure (the react-hooks/purity rule
  // forbids Date.now() in render). Fresh enough: the parent remounts/reloads
  // this list on every data change, and expiry granularity is a whole day.
  const [now] = useState(() => Date.now())

  const handleDownload = (id: string) => {
    // The quote document page opens the browser's print dialog when ?print=1
    // is present, so "download" = navigate there and let it print to PDF.
    router.push(`/quote/${id}?print=1`)
  }

  const handleDuplicate = async (quote: Quote) => {
    const supabase = createClient()
    
    // Create a copy of the quote without the id and with updated name
    const duplicatedQuote = {
      ...quote,
      quote_name: `${quote.quote_name} (Copy)`,
      created_at: new Date().toISOString(),
      is_draft: true, // Set as draft by default
      status: "pending",
    }
    
    // Remove id and other non-column fields before insert.
    // The history query loads quotes with select("*, clients(name)"), so each row
    // carries a nested `clients` object (a PostgREST embed, not a real column). Spreading
    // the whole row would send `clients` (and other read/derived join artifacts like
    // `client_name`) as payload keys, and PostgREST rejects any unknown column
    // ("Could not find the 'clients' column of 'quotes'..."), so duplicate always failed.
    // Strip those join artifacts so the insert only contains real `quotes` columns.
    const { id, clients, client_name, ...quoteData } = duplicatedQuote as any
    
    const { data, error } = await supabase.from("quotes").insert([quoteData]).select()
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to duplicate quote",
        variant: "destructive",
      })
      return
    }
    
    if (data && data.length > 0) {
      // Parent refetches via the local-db change event; no local copy to update.
      toast({
        title: "Success",
        description: "Quote duplicated successfully",
      })
    }
  }

  const handleEdit = (quote: Quote) => {
    // Navigate to the appropriate calculator page with the quote ID
    const route = quote.quote_type === "business" ? "/business" : "/personal"
    router.push(`${route}?edit=${quote.id}`)
  }

  const handleDelete = async (id: string) => {
    setQuoteToDelete(id)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!quoteToDelete) return

    const supabase = createClient()
    const { error } = await supabase.from("quotes").delete().eq("id", quoteToDelete)

    if (!error) {
      toast({
        title: "Success",
        description: "Quote deleted successfully",
      })
    } else {
      toast({
        title: "Error",
        description: "Failed to delete quote",
        variant: "destructive",
      })
    }

    setDeleteDialogOpen(false)
    setQuoteToDelete(null)
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const getPrinterName = (printerId: string) => {
    const printer = printers.find((p) => p.id === printerId)
    return printer?.name || "N/A"
  }

  const getFilamentName = (filamentId: string) => {
    const filament = filaments.find((f) => f.id === filamentId)
    return filament?.name || "N/A"
  }

  const updateStatus = async (quoteId: string, newStatus: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("quotes").update({ status: newStatus }).eq("id", quoteId)

    if (!error) {
      toast({
        title: "Status Updated",
        description: `Quote status changed to ${STATUS_CONFIG[newStatus as keyof typeof STATUS_CONFIG]?.label || newStatus}`,
      })
    } else {
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      })
    }
  }

  const convertQuoteType = async (quoteId: string, currentType: string) => {
    const newType = currentType === "personal" ? "business" : "personal"
    const supabase = createClient()
    const { error } = await supabase.from("quotes").update({ quote_type: newType }).eq("id", quoteId)

    if (!error) {
      toast({
        title: "Quote Converted",
        description: `Quote converted from ${currentType} to ${newType}`,
      })
    } else {
      toast({
        title: "Error",
        description: "Failed to convert quote type",
        variant: "destructive",
      })
    }
  }

  // Toggle filter selection
  const toggleFilter = (filter: string) => {
    if (statusFilters.includes(filter)) {
      setStatusFilters(statusFilters.filter((f) => f !== filter))
    } else {
      setStatusFilters([...statusFilters, filter])
    }
  }

  const toggleClientFilter = (clientId: string) => {
    if (clientFilters.includes(clientId)) {
      setClientFilters(clientFilters.filter((f) => f !== clientId))
    } else {
      setClientFilters([...clientFilters, clientId])
    }
  }

  const togglePrinterFilter = (printerId: string) => {
    if (printerFilters.includes(printerId)) {
      setPrinterFilters(printerFilters.filter((f) => f !== printerId))
    } else {
      setPrinterFilters([...printerFilters, printerId])
    }
  }

  const toggleFilamentFilter = (filamentId: string) => {
    if (filamentFilters.includes(filamentId)) {
      setFilamentFilters(filamentFilters.filter((f) => f !== filamentId))
    } else {
      setFilamentFilters([...filamentFilters, filamentId])
    }
  }

  // A quote past its validity window that is still awaiting a decision.
  // Only pending/draft quotes can "expire" — once in progress or finished the
  // date no longer matters. Legacy rows without valid_until never expire.
  const isExpired = (quote: Quote) => {
    const awaitingDecision = quote.is_draft || (quote.status || "pending") === "pending"
    return awaitingDecision && !!quote.valid_until && new Date(quote.valid_until).getTime() < now
  }

  // Local calendar date as "YYYY-MM-DD", so the date-range filter compares in
  // the user's timezone (matching the Created timestamps shown on the cards).
  const localDateKey = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }

  // Filter quotes based on search text, date range, and selected statuses,
  // clients, printers, and filaments
  const filteredQuotes = quotes.filter((quote) => {
    // Text search - quote name, resolved client name, and part names
    const query = searchQuery.trim().toLowerCase()
    if (query) {
      const clientName =
        quote.client_name || clients.find((c) => c.id === quote.client_id)?.name || ""
      const partNames = (quote.printed_parts || [])
        .map((part: any) => part?.name || "")
        .join(" ")
      const haystack = `${quote.quote_name || ""} ${clientName} ${partNames}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }

    // Date range filter (inclusive on both ends)
    if (dateFrom || dateTo) {
      const createdKey = localDateKey(quote.created_at)
      if (dateFrom && createdKey < dateFrom) return false
      if (dateTo && createdKey > dateTo) return false
    }

    // Status filter
    if (statusFilters.length > 0) {
      const statusMatch = statusFilters.some((filter) => {
        if (filter === "draft") return quote.is_draft
        return quote.status === filter
      })
      if (!statusMatch) return false
    }

    // Client filter - match by client_id
    if (clientFilters.length > 0) {
      if (!quote.client_id || !clientFilters.includes(quote.client_id)) return false
    }

    // Printer filter
    if (printerFilters.length > 0) {
      // Check if any part uses one of the filtered printers
      const hasPrinter = quote.printed_parts?.some((part: any) => 
        part.printer_id && printerFilters.includes(part.printer_id)
      )
      if (!hasPrinter) return false
    }

    // Filament filter
    if (filamentFilters.length > 0) {
      // Check if any part uses one of the filtered filaments
      const hasFilament = quote.printed_parts?.some((part: any) => {
        if (part.filaments && Array.isArray(part.filaments)) {
          // Multi-filament format
          return part.filaments.some((f: any) => f.filament_id && filamentFilters.includes(f.filament_id))
        } else if (part.filament_id) {
          // Single filament format
          return filamentFilters.includes(part.filament_id)
        }
        return false
      })
      if (!hasFilament) return false
    }

    return true
  })

  if (quotes.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="border-dashed shadow-none bg-card/50">
          <CardContent className="py-16">
            <div className="flex flex-col items-center text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FileText className="size-7" />
              </span>
              <p className="mt-4 text-lg font-semibold text-foreground">No quotes saved yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Build your first quote with the Personal or Business calculator and it will show up here.
              </p>
              <div className="mt-6 flex gap-3">
                <Button onClick={() => router.push("/personal")} variant="outline" className="bg-card">
                  Personal calculator
                </Button>
                <Button onClick={() => router.push("/business")}>Business calculator</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-2xl font-bold">
            Total quotes: {quotes.length}
            {quotes.filter((q) => q.is_draft).length > 0 && (
              <span className="ml-2 text-sm text-muted-foreground">
                ({quotes.filter((q) => q.is_draft).length} draft{quotes.filter((q) => q.is_draft).length !== 1 ? "s" : ""}
                )
              </span>
            )}
          </h2>
        </div>

        {/* Filter Section */}
        <div className="space-y-3">
          {/* Search + Date Range Row */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by quote, client or part name…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-card"
                aria-label="Search quotes"
              />
            </div>
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[150px] bg-card"
                aria-label="Created from date"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[150px] bg-card"
                aria-label="Created to date"
              />
            </div>
          </div>

          {/* Dropdown Filters Row */}
          <div className="flex items-center gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Status Dropdown */}
              <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Status:</span>
              <Select
                value={statusFilters.length === 1 ? statusFilters[0] : "all"}
                onValueChange={(value) => {
                  if (value === "all") {
                    setStatusFilters([])
                  } else {
                    setStatusFilters([value])
                  }
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Any Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Status</SelectItem>
                  <SelectItem value="draft">
                    Draft ({quotes.filter((q) => q.is_draft).length})
                  </SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                    const count = quotes.filter((q) => q.status === key).length
                    return (
                      <SelectItem key={key} value={key}>
                        {config.label} ({count})
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            {/* Client Dropdown */}
            {clients.length > 0 && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Client:</span>
                <Select
                  value={clientFilters.length === 1 ? clientFilters[0] : "all"}
                  onValueChange={(value) => {
                    if (value === "all") {
                      setClientFilters([])
                    } else {
                      setClientFilters([value])
                    }
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clients</SelectItem>
                    {clients
                      .map((client) => {
                        const count = quotes.filter((q) => q.client_id === client.id).length
                        return { client, count }
                      })
                      .filter(({ count }) => count > 0)
                      .map(({ client, count }) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name} ({count})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Machine Dropdown */}
            {printers.length > 0 && (
              <div className="flex items-center gap-2">
                <Printer className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Machine:</span>
                <Select
                  value={printerFilters.length === 1 ? printerFilters[0] : "all"}
                  onValueChange={(value) => {
                    if (value === "all") {
                      setPrinterFilters([])
                    } else {
                      setPrinterFilters([value])
                    }
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Machines" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Machines</SelectItem>
                    {printers
                      .map((printer) => {
                        const count = quotes.filter((q) => 
                          q.printed_parts?.some((part: any) => part.printer_id === printer.id)
                        ).length
                        return { printer, count }
                      })
                      .filter(({ count }) => count > 0)
                      .map(({ printer, count }) => (
                        <SelectItem key={printer.id} value={printer.id}>
                          {printer.name} ({count})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Material Dropdown */}
            {filaments.length > 0 && (
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Material:</span>
                <Select
                  value={filamentFilters.length === 1 ? filamentFilters[0] : "all"}
                  onValueChange={(value) => {
                    if (value === "all") {
                      setFilamentFilters([])
                    } else {
                      setFilamentFilters([value])
                    }
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Materials" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Materials</SelectItem>
                    {filaments
                      .map((filament) => {
                        const count = quotes.filter((q) => 
                          q.printed_parts?.some((part: any) => {
                            if (part.filaments && Array.isArray(part.filaments)) {
                              return part.filaments.some((f: any) => f.filament_id === filament.id)
                            }
                            return part.filament_id === filament.id
                          })
                        ).length
                        return { filament, count }
                      })
                      .filter(({ count }) => count > 0)
                      .map(({ filament, count }) => (
                        <SelectItem key={filament.id} value={filament.id}>
                          {filament.name} ({count})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            </div>
            
            {/* Clear All Filters Button */}
            {(searchQuery !== "" || dateFrom !== "" || dateTo !== "" || statusFilters.length > 0 || clientFilters.length > 0 || printerFilters.length > 0 || filamentFilters.length > 0) && (
              <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("")
                    setDateFrom("")
                    setDateTo("")
                    setStatusFilters([])
                    setClientFilters([])
                    setPrinterFilters([])
                    setFilamentFilters([])
                  }}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                Clear All Filters
              </Button>
            )}
          </div>

          <p className="text-sm text-muted-foreground" aria-live="polite">
            Showing {filteredQuotes.length} of {quotes.length} quote{quotes.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {filteredQuotes.map((quote) => {
        const totalParts = (quote.printed_parts || []).length
        const totalMaterials = (quote.materials || []).length || (quote.materials_cost > 0 ? 1 : 0)
        const totalLabor = (quote.labor_items || []).length
        const totalPackaging = (quote.packaging_items || []).length
        const totalDriedBatches = (quote.dried_batches || []).length

        const currentStatus = quote.status || "pending"
        const statusConfig = STATUS_CONFIG[currentStatus as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending
        const StatusIcon = statusConfig.icon

        return (
          <Card key={quote.id} className="overflow-hidden shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className={expandedId === quote.id ? "border-b border-border" : ""}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-lg sm:text-xl flex flex-wrap items-center gap-2">
                    <span className="break-words">{quote.quote_name}</span>
                    {quote.is_draft && <Badge variant="secondary">Draft</Badge>}
                    <Badge variant={quote.quote_type === "business" ? "default" : "secondary"}>
                      {quote.quote_type}
                    </Badge>
                    {quote.is_emergency && (
                      <Badge className="bg-red-500 hover:bg-red-600 text-white border-0">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Emergency
                      </Badge>
                    )}
                    {isExpired(quote) && (
                      <Badge className="bg-red-100 text-red-700 border-red-300 border" variant="outline">
                        <XCircle className="h-3 w-3 mr-1" />
                        Expired
                      </Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        {/* Real button so status changes are keyboard-reachable; Badge alone is not focusable. */}
                        <button type="button" aria-label={`Change status (currently ${statusConfig.label})`}>
                          <Badge
                            className={`cursor-pointer ${statusConfig.color} border hover:opacity-80 transition-opacity`}
                            variant="outline"
                          >
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig.label}
                            <ChevronDown className="h-3 w-3 ml-1" />
                          </Badge>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                          const Icon = config.icon
                          return (
                            <DropdownMenuItem
                              key={key}
                              onClick={() => updateStatus(quote.id, key)}
                              className={`cursor-pointer ${currentStatus === key ? "bg-accent" : ""}`}
                            >
                              <Icon className="h-4 w-4 mr-2" />
                              {config.label}
                            </DropdownMenuItem>
                          )
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground break-words mt-1">
                    {totalParts} part{totalParts !== 1 ? "s" : ""} | {totalMaterials} material
                    {totalMaterials !== 1 ? "s" : ""} | {totalLabor} labor item{totalLabor !== 1 ? "s" : ""} |{" "}
                    {totalPackaging} packaging item{totalPackaging !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Created: {new Date(quote.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {/* Action Buttons */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 p-0 bg-transparent"
                        title="Share Quote"
                        aria-label="Share quote"
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/quote/${quote.id}`)}>
                        Standard Quotation
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push(`/quote/${quote.id}/detailed`)}>
                        Fully Detailed Quotation
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(quote.id)}
                    className="h-9 w-9 p-0"
                    title="Download Quote"
                    aria-label="Download quote"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(quote)}
                    className="h-9 w-9 p-0"
                    title="Edit Quote"
                    aria-label="Edit quote"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDuplicate(quote)}
                    className="h-9 w-9 p-0"
                    title="Duplicate Quote"
                    aria-label="Duplicate quote"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => convertQuoteType(quote.id, quote.quote_type)}
                    className="h-9 w-9 p-0"
                    title={`Convert to ${quote.quote_type === "personal" ? "Business" : "Personal"}`}
                    aria-label={`Convert to ${quote.quote_type === "personal" ? "business" : "personal"} quote`}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedId(expandedId === quote.id ? null : quote.id)}
                    className="h-9 w-9 p-0"
                    title={expandedId === quote.id ? "Collapse" : "Expand"}
                    aria-label={expandedId === quote.id ? "Collapse quote details" : "Expand quote details"}
                    aria-expanded={expandedId === quote.id}
                  >
                    {expandedId === quote.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(quote.id)}
                    className="h-9 w-9 p-0"
                    title="Delete Quote"
                    aria-label="Delete quote"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            {expandedId === quote.id && (
              <CardContent className="pt-6 bg-muted/20">
                {quote.printed_parts && quote.printed_parts.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Printed Parts</h3>
                    <div className="overflow-x-auto -mx-4 sm:mx-0">
                      <div className="inline-block min-w-full align-middle">
                        <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                          <thead className="bg-muted/70 text-muted-foreground [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider">
                            <tr>
                              <th className="border border-border/70 px-3 py-2 text-left">Part Name</th>
                              <th className="border border-border/70 px-3 py-2 text-left">Printer</th>
                              <th className="border border-border/70 px-3 py-2 text-left">Filament</th>
                              <th className="border border-border/70 px-3 py-2 text-right">Weight (g)</th>
                              <th className="border border-border/70 px-3 py-2 text-right">Time (h)</th>
                              <th className="border border-border/70 px-3 py-2 text-right">Cost</th>
                            </tr>
                          </thead>
                          <tbody className="bg-card">
                            {quote.printed_parts.map((part: any, index: number) => {
                              let totalGrams = 0
                              const filamentNames: string[] = []
                              let totalCost = 0

                              if (part.filaments && Array.isArray(part.filaments) && part.filaments.length > 0) {
                                // New multi-filament format
                                part.filaments.forEach((filamentEntry: any) => {
                                  totalGrams += filamentEntry.grams || 0
                                  const filament = filaments.find((f) => f.id === filamentEntry.filament_id)
                                  if (filament) {
                                    filamentNames.push(filament.name)
                                    totalCost += (filament.price_per_kg * (filamentEntry.grams || 0)) / 1000
                                  }
                                })
                              } else if (part.filament_id) {
                                // Old single-filament format
                                totalGrams = part.filament_grams || 0
                                const filament = filaments.find((f) => f.id === part.filament_id)
                                if (filament) {
                                  filamentNames.push(filament.name)
                                  totalCost = (filament.price_per_kg * totalGrams) / 1000
                                }
                              }

                              return (
                                <tr key={index}>
                                  <td className="border border-border/50 px-3 py-2">{part.name || "N/A"}</td>
                                  <td className="border border-border/50 px-3 py-2">
                                    {getPrinterName(part.printer_id)}
                                  </td>
                                  <td className="border border-border/50 px-3 py-2">
                                    {filamentNames.length > 0 ? filamentNames.join(", ") : "N/A"}
                                  </td>
                                  <td className="border border-border/50 px-3 py-2 text-right">{totalGrams}</td>
                                  <td className="border border-border/50 px-3 py-2 text-right">
                                    {part.printing_time_hr || 0}
                                  </td>
                                  <td className="border border-border/50 px-3 py-2 text-right">
                                    €{safeFixed(totalCost)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {quote.dried_batches && quote.dried_batches.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Dried Batches</h3>
                    <div className="overflow-x-auto -mx-4 sm:mx-0">
                      <div className="inline-block min-w-full align-middle">
                        <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                          <thead className="bg-muted/70 text-muted-foreground [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider">
                            <tr>
                              <th className="border border-border/70 px-3 py-2 text-left">Filament</th>
                              <th className="border border-border/70 px-3 py-2 text-right">Hours</th>
                              <th className="border border-border/70 px-3 py-2 text-right">Cost</th>
                            </tr>
                          </thead>
                          <tbody className="bg-card">
                            {quote.dried_batches.map((batch: any, index: number) => (
                              <tr key={index}>
                                <td className="border border-border/50 px-3 py-2">{batch.material || "N/A"}</td>
                                <td className="border border-border/50 px-3 py-2 text-right">
                                  {batch.drying_time_hr || 0}
                                </td>
                                <td className="border border-border/50 px-3 py-2 text-right">
                                  €{safeFixed(batch.cost)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {quote.materials && quote.materials.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Materials</h3>
                      <div className="bg-card p-3 rounded-lg border border-border/70 space-y-2">
                        {quote.materials.map((item: any, index: number) => (
                          <div key={index} className="flex justify-between text-sm">
                            {/* Materials are stored as {id, name, quantity, unit_cost} (no description/cost keys),
                                so read `name` and compute the line cost as quantity * unit_cost to mirror the
                                calculator's totals math, instead of the always-undefined item.description/item.cost. */}
                            <span className="text-muted-foreground">{item.name || "N/A"}</span>
                            <span className="text-foreground tabular-nums">€{safeFixed((item.quantity ?? 0) * (item.unit_cost ?? 0))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {quote.labor_items && quote.labor_items.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Labor</h3>
                      <div className="bg-card p-3 rounded-lg border border-border/70 space-y-2">
                        {quote.labor_items.map((item: any, index: number) => (
                          <div key={index} className="flex justify-between text-sm">
                            {/* Labor items are stored as {id, action, hours, hourly_cost} (no description/cost keys),
                                so read `action` and compute the line cost as hours * hourly_cost to mirror the
                                calculator's totals math, instead of the always-undefined item.description/item.cost. */}
                            <span className="text-muted-foreground">{item.action || "N/A"}</span>
                            <span className="text-foreground tabular-nums">€{safeFixed((item.hours ?? 0) * (item.hourly_cost ?? 0))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {quote.packaging_items && quote.packaging_items.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Packaging</h3>
                      <div className="bg-card p-3 rounded-lg border border-border/70 space-y-2">
                        {quote.packaging_items.map((item: any, index: number) => (
                          <div key={index} className="flex justify-between text-sm">
                            {/* Packaging items are stored as {id, name, quantity, unit_cost} (no description/cost keys),
                                so read `name` and compute the line cost as quantity * unit_cost to mirror the
                                calculator's totals math, instead of the always-undefined item.description/item.cost. */}
                            <span className="text-muted-foreground">{item.name || "N/A"}</span>
                            <span className="text-foreground tabular-nums">€{safeFixed((item.quantity ?? 0) * (item.unit_cost ?? 0))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-4 sm:gap-6 pt-4 border-t border-border">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Cost Breakdown</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Printing Cost</span>
                        <span className="text-foreground tabular-nums">€{safeFixed(quote.total_printing_cost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Machine Cost</span>
                        <span className="text-foreground tabular-nums">€{safeFixed(quote.machine_cost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Materials Cost</span>
                        <span className="text-foreground tabular-nums">€{safeFixed(quote.materials_cost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Labor Cost</span>
                        <span className="text-foreground tabular-nums">€{safeFixed(quote.labor_cost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Packaging & Shipping Cost</span>
                        <span className="text-foreground tabular-nums">€{safeFixed(quote.packaging_cost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Transportation Cost</span>
                        <span className="text-foreground tabular-nums">€{safeFixed(quote.fuel_cost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Electricity Cost</span>
                        <span className="text-foreground tabular-nums">
                          €{safeFixed((quote.electricity_cost || 0) + (quote.drying_cost || 0))}
                        </span>
                      </div>
                      {quote.is_emergency && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Emergency Fee</span>
                          <span className="text-foreground tabular-nums">€{safeFixed(quote.emergency_fee)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-border pt-2">
                        <span className="text-muted-foreground font-semibold">Total Landed Cost</span>
                        <span className="text-foreground tabular-nums font-semibold">€{safeFixed(quote.landed_cost)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Profit Margins</h3>
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      {Number(quote.selected_margin_percentage) >= 0 &&
                        Number(quote.selected_margin_percentage) < 29 && (
                          <div className="col-span-2 p-3 rounded-lg border-2 bg-primary border-primary shadow-md">
                            <div className="text-xs mb-1 text-primary-foreground/80">
                              Custom: {Number(quote.selected_margin_percentage).toFixed(1)}% Margin
                            </div>
                            <div className="text-lg font-semibold text-primary-foreground">
                              €
                              {quote.final_price 
                                ? safeFixed(quote.final_price)
                                : safeFixed(
                                    (quote.landed_cost || 0) / (1 - Number(quote.selected_margin_percentage) / 100),
                                  )}
                            </div>
                          </div>
                        )}
                      <div
                        className={`p-3 rounded-lg border-2 ${
                          (
                            Number(quote.selected_margin_percentage) >= 29 &&
                              Number(quote.selected_margin_percentage) < 35
                          ) || quote.selected_margin === "30"
                            ? "bg-primary border-primary shadow-md"
                            : "bg-card border-border"
                        }`}
                      >
                        <div
                          className={`text-xs mb-1 ${(Number(quote.selected_margin_percentage) >= 29 && Number(quote.selected_margin_percentage) < 35) || quote.selected_margin === "30" ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                        >
                          {quote.final_price && (Number(quote.selected_margin_percentage) >= 29 && Number(quote.selected_margin_percentage) < 35)
                            ? `Custom: ${Number(quote.selected_margin_percentage).toFixed(1)}% Margin`
                            : "30% Margin"}
                        </div>
                        <div
                          className={`text-lg font-semibold ${(Number(quote.selected_margin_percentage) >= 29 && Number(quote.selected_margin_percentage) < 35) || quote.selected_margin === "30" ? "text-primary-foreground" : "text-emerald-600"}`}
                        >
                          €{quote.final_price && (Number(quote.selected_margin_percentage) >= 29 && Number(quote.selected_margin_percentage) < 35)
                            ? safeFixed(quote.final_price)
                            : safeFixed(quote.margin_30)}
                        </div>
                      </div>
                      <div
                        className={`p-3 rounded-lg border-2 ${
                          (
                            Number(quote.selected_margin_percentage) >= 35 &&
                              Number(quote.selected_margin_percentage) < 45
                          ) || quote.selected_margin === "40"
                            ? "bg-primary border-primary shadow-md"
                            : "bg-card border-border"
                        }`}
                      >
                        <div
                          className={`text-xs mb-1 ${(Number(quote.selected_margin_percentage) >= 35 && Number(quote.selected_margin_percentage) < 45) || quote.selected_margin === "40" ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                        >
                          {quote.final_price && (Number(quote.selected_margin_percentage) >= 35 && Number(quote.selected_margin_percentage) < 45)
                            ? `Custom: ${Number(quote.selected_margin_percentage).toFixed(1)}% Margin`
                            : "40% Margin"}
                        </div>
                        <div
                          className={`text-lg font-semibold ${(Number(quote.selected_margin_percentage) >= 35 && Number(quote.selected_margin_percentage) < 45) || quote.selected_margin === "40" ? "text-primary-foreground" : "text-emerald-600"}`}
                        >
                          €{quote.final_price && (Number(quote.selected_margin_percentage) >= 35 && Number(quote.selected_margin_percentage) < 45)
                            ? safeFixed(quote.final_price)
                            : safeFixed(quote.margin_40)}
                        </div>
                      </div>
                      <div
                        className={`p-3 rounded-lg border-2 ${
                          (
                            Number(quote.selected_margin_percentage) >= 45 &&
                              Number(quote.selected_margin_percentage) < 55
                          ) || quote.selected_margin === "50"
                            ? "bg-primary border-primary shadow-md"
                            : "bg-card border-border"
                        }`}
                      >
                        <div
                          className={`text-xs mb-1 ${(Number(quote.selected_margin_percentage) >= 45 && Number(quote.selected_margin_percentage) < 55) || quote.selected_margin === "50" ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                        >
                          {quote.final_price && (Number(quote.selected_margin_percentage) >= 45 && Number(quote.selected_margin_percentage) < 55)
                            ? `Custom: ${Number(quote.selected_margin_percentage).toFixed(1)}% Margin`
                            : "50% Margin"}
                        </div>
                        <div
                          className={`text-lg font-semibold ${(Number(quote.selected_margin_percentage) >= 45 && Number(quote.selected_margin_percentage) < 55) || quote.selected_margin === "50" ? "text-primary-foreground" : "text-emerald-600"}`}
                        >
                          €{quote.final_price && (Number(quote.selected_margin_percentage) >= 45 && Number(quote.selected_margin_percentage) < 55)
                            ? safeFixed(quote.final_price)
                            : safeFixed(quote.margin_50)}
                        </div>
                      </div>
                      <div
                        className={`p-3 rounded-lg border-2 ${
                          (
                            Number(quote.selected_margin_percentage) >= 55 &&
                              Number(quote.selected_margin_percentage) <= 60
                          ) || quote.selected_margin === "60"
                            ? "bg-primary border-primary shadow-md"
                            : "bg-card border-border"
                        }`}
                      >
                        <div
                          className={`text-xs mb-1 ${(Number(quote.selected_margin_percentage) >= 55 && Number(quote.selected_margin_percentage) <= 60) || quote.selected_margin === "60" ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                        >
                          {quote.final_price && (Number(quote.selected_margin_percentage) >= 55 && Number(quote.selected_margin_percentage) <= 60)
                            ? `Custom: ${Number(quote.selected_margin_percentage).toFixed(1)}% Margin`
                            : "60% Margin"}
                        </div>
                        <div
                          className={`text-lg font-semibold ${(Number(quote.selected_margin_percentage) >= 55 && Number(quote.selected_margin_percentage) <= 60) || quote.selected_margin === "60" ? "text-primary-foreground" : "text-emerald-600"}`}
                        >
                          €{quote.final_price && (Number(quote.selected_margin_percentage) >= 55 && Number(quote.selected_margin_percentage) <= 60)
                            ? safeFixed(quote.final_price)
                            : safeFixed(quote.margin_60)}
                        </div>
                      </div>
                      {Number(quote.selected_margin_percentage) > 60 && (
                        <div className="col-span-2 p-3 rounded-lg border-2 bg-primary border-primary shadow-md">
                          <div className="text-xs mb-1 text-primary-foreground/80">
                            Custom: {Number(quote.selected_margin_percentage).toFixed(1)}% Margin
                          </div>
                          <div className="text-lg font-semibold text-primary-foreground">
                            €
                            {quote.final_price 
                              ? safeFixed(quote.final_price)
                              : safeFixed(
                                  (quote.landed_cost || 0) / (1 - Number(quote.selected_margin_percentage) / 100),
                                )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Wrap the owner-share check in Boolean(): when both shares are the number 0,
                    `(0 || 0)` is 0 and React would render a stray literal "0" under the card.
                    Coercing to a boolean makes the all-zero case render nothing instead. */}
                {quote.quote_type === "business" && Boolean(quote.owner_a_receives || quote.owner_b_receives) && (
                  <div className="mt-6 pt-4 border-t border-border">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Profit Split</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-card p-4 rounded-xl border border-border">
                        <div className="text-sm text-muted-foreground mb-1">Owner A Receives</div>
                        <div className="text-2xl font-bold text-foreground tabular-nums">€{safeFixed(quote.owner_a_receives)}</div>
                      </div>
                      <div className="bg-card p-4 rounded-xl border border-border">
                        <div className="text-sm text-muted-foreground mb-1">Owner B Receives</div>
                        <div className="text-2xl font-bold text-foreground tabular-nums">€{safeFixed(quote.owner_b_receives)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )
      })}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this quote? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export { QuoteHistory }
