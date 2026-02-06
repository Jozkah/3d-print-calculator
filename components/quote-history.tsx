"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
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
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

type Quote = {
  id: string
  quote_type: string
  quote_name: string
  client_name: string // Added client_name field
  client_id?: string // Added client_id field
  printer_id?: string // Added printer_id field
  printed_parts: any[]
  dried_batches: any[]
  materials: any[]
  labor_items: any[]
  packaging_items: any[]
  distance_traveled_km: number
  is_emergency: boolean
  total_printing_cost: number
  machine_cost: number
  drying_cost: number
  materials_cost: number
  labor_cost: number
  packaging_cost: number
  fuel_cost: number
  emergency_fee: number
  electricity_cost: number
  landed_cost: number
  margin_30: number
  margin_40: number
  margin_50: number
  margin_60: number
  selected_margin: string // Updated to string
  selected_margin_percentage: number | null // Updated to number | null
  ownerA_receives: number
  ownerB_receives: number
  created_at: string
  is_draft?: boolean
  status?: string // Added status field
  final_price?: number // Added final_price field
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
  quotes: initialQuotes, 
  clients: initialClients = [],
  printers: initialPrinters = [],
  filaments: initialFilaments = []
}: { 
  quotes: Quote[],
  clients?: any[],
  printers?: any[],
  filaments?: any[]
}) {
  console.log("[v0] QuoteHistory - Received props:")
  console.log("[v0]   initialClients:", initialClients?.length, "clients", initialClients)
  console.log("[v0]   initialPrinters:", initialPrinters?.length, "printers")
  console.log("[v0]   initialFilaments:", initialFilaments?.length, "filaments")
  
  const [quotes, setQuotes] = useState(initialQuotes)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [printers, setPrinters] = useState<any[]>(initialPrinters)
  const [filaments, setFilaments] = useState<any[]>(initialFilaments)
  const [clients, setClients] = useState<any[]>(initialClients)
  
  console.log("[v0] QuoteHistory - State after init:")
  console.log("[v0]   clients state:", clients?.length, "clients", clients)
  const [statusFilters, setStatusFilters] = useState<string[]>([])
  const [clientFilters, setClientFilters] = useState<string[]>([])
  const [printerFilters, setPrinterFilters] = useState<string[]>([])
  const [filamentFilters, setFilamentFilters] = useState<string[]>([])
  const { toast } = useToast()
  const router = useRouter()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [quoteToDelete, setQuoteToDelete] = useState<string | null>(null)

  const handleDownload = (id: string) => {
    // Placeholder for download logic
    console.log(`Download quote with id: ${id}`)
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
    
    // Remove id and other auto-generated fields
    const { id, ...quoteData } = duplicatedQuote as any
    
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
      setQuotes([data[0], ...quotes])
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

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      
      // Only fetch if not provided via props
      if (initialPrinters.length === 0) {
        const { data: printersData } = await supabase.from("printers").select("*")
        if (printersData) setPrinters(printersData)
      }
      if (initialFilaments.length === 0) {
        const { data: filamentsData } = await supabase.from("filaments").select("*")
        if (filamentsData) setFilaments(filamentsData)
      }
      if (initialClients.length === 0) {
        const { data: clientsData } = await supabase.from("clients").select("*")
        if (clientsData) setClients(clientsData)
      }
    }
    loadData()
  }, [initialPrinters.length, initialFilaments.length, initialClients.length])

  const handleDelete = async (id: string) => {
    setQuoteToDelete(id)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!quoteToDelete) return

    const supabase = createClient()
    const { error } = await supabase.from("quotes").delete().eq("id", quoteToDelete)

    if (!error) {
      setQuotes(quotes.filter((q) => q.id !== quoteToDelete))
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
      setQuotes(quotes.map((q) => (q.id === quoteId ? { ...q, status: newStatus } : q)))
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
      setQuotes(quotes.map((q) => (q.id === quoteId ? { ...q, quote_type: newType } : q)))
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

  // Filter quotes based on selected statuses, clients, printers, and filaments
  const filteredQuotes = quotes.filter((quote) => {
    // Status filter
    if (statusFilters.length > 0) {
      const statusMatch = statusFilters.some((filter) => {
        if (filter === "draft") return quote.is_draft
        return quote.status === filter
      })
      if (!statusMatch) return false
    }

    // Client filter - match by client_name to catch both personal and business quotes
    if (clientFilters.length > 0) {
      const selectedClient = clients.find(c => clientFilters.includes(c.id))
      console.log("[v0] Client filter - selectedClient:", selectedClient, "quote.client_name:", quote.client_name, "match:", quote.client_name === selectedClient?.name)
      if (!selectedClient || quote.client_name !== selectedClient.name) return false
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
        <Card className="bg-white border-2 border-blue-300">
          <CardContent className="py-12">
            <div className="text-center">
              <p className="text-blue-900 text-lg mb-4">No quotes saved yet</p>
              <p className="text-blue-600">Create a quote using the Personal or Business calculator</p>
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
          {/* Clear All Filters Button */}
          {(statusFilters.length > 0 || clientFilters.length > 0 || printerFilters.length > 0 || filamentFilters.length > 0) && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilters([])
                  setClientFilters([])
                  setPrinterFilters([])
                  setFilamentFilters([])
                }}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                Clear All Filters
              </Button>
            </div>
          )}

          {/* Dropdown Filters Row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Status Dropdown */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Status:</span>
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
                <User className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Client:</span>
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
                        const count = quotes.filter((q) => q.client_name === client.name).length
                        console.log("[v0] Client dropdown - client:", client.name, "count:", count, "matching quotes:", quotes.filter((q) => q.client_name === client.name).map(q => `${q.quote_name} (${q.quote_type})`))
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
                <Printer className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Machine:</span>
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
                <Package className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Material:</span>
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
          <Card key={quote.id} className="overflow-hidden bg-white border border-gray-200 shadow-sm">
            <CardHeader className={`bg-white ${expandedId === quote.id ? "border-b border-gray-200" : ""}`}>
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Badge
                          className={`cursor-pointer ${statusConfig.color} border hover:opacity-80 transition-opacity`}
                          variant="outline"
                        >
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusConfig.label}
                          <ChevronDown className="h-3 w-3 ml-1" />
                        </Badge>
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
                      <Button variant="outline" size="sm" className="h-9 w-9 p-0 bg-transparent" title="Share Quote">
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
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(quote)}
                    className="h-9 w-9 p-0"
                    title="Edit Quote"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDuplicate(quote)}
                    className="h-9 w-9 p-0"
                    title="Duplicate Quote"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => convertQuoteType(quote.id, quote.quote_type)}
                    className="h-9 w-9 p-0"
                    title={`Convert to ${quote.quote_type === "personal" ? "Business" : "Personal"}`}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedId(expandedId === quote.id ? null : quote.id)}
                    className="h-9 w-9 p-0"
                    title={expandedId === quote.id ? "Collapse" : "Expand"}
                  >
                    {expandedId === quote.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(quote.id)}
                    className="h-9 w-9 p-0"
                    title="Delete Quote"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            {expandedId === quote.id && (
              <CardContent className="bg-white pt-6">
                {quote.printed_parts && quote.printed_parts.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-blue-900 mb-3">Printed Parts</h3>
                    <div className="overflow-x-auto -mx-4 sm:mx-0">
                      <div className="inline-block min-w-full align-middle">
                        <table className="w-full text-sm border-2 border-gray-200">
                          <thead className="bg-blue-600 text-white">
                            <tr>
                              <th className="border border-gray-300 px-3 py-2 text-left">Part Name</th>
                              <th className="border border-gray-300 px-3 py-2 text-left">Printer</th>
                              <th className="border border-gray-300 px-3 py-2 text-left">Filament</th>
                              <th className="border border-gray-300 px-3 py-2 text-right">Weight (g)</th>
                              <th className="border border-gray-300 px-3 py-2 text-right">Time (h)</th>
                              <th className="border border-gray-300 px-3 py-2 text-right">Cost</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white">
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
                                  <td className="border border-gray-200 px-3 py-2">{part.name || "N/A"}</td>
                                  <td className="border border-gray-200 px-3 py-2">
                                    {getPrinterName(part.printer_id)}
                                  </td>
                                  <td className="border border-gray-200 px-3 py-2">
                                    {filamentNames.length > 0 ? filamentNames.join(", ") : "N/A"}
                                  </td>
                                  <td className="border border-gray-200 px-3 py-2 text-right">{totalGrams}</td>
                                  <td className="border border-gray-200 px-3 py-2 text-right">
                                    {part.printing_time_hr || 0}
                                  </td>
                                  <td className="border border-gray-200 px-3 py-2 text-right">
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
                    <h3 className="text-sm font-semibold text-blue-900 mb-3">Dried Batches</h3>
                    <div className="overflow-x-auto -mx-4 sm:mx-0">
                      <div className="inline-block min-w-full align-middle">
                        <table className="w-full text-sm border-2 border-gray-200">
                          <thead className="bg-blue-600 text-white">
                            <tr>
                              <th className="border border-gray-300 px-3 py-2 text-left">Filament</th>
                              <th className="border border-gray-300 px-3 py-2 text-right">Hours</th>
                              <th className="border border-gray-300 px-3 py-2 text-right">Cost</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            {quote.dried_batches.map((batch: any, index: number) => (
                              <tr key={index}>
                                <td className="border border-gray-200 px-3 py-2">{batch.material || "N/A"}</td>
                                <td className="border border-gray-200 px-3 py-2 text-right">
                                  {batch.drying_time_hr || 0}
                                </td>
                                <td className="border border-gray-200 px-3 py-2 text-right">
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
                      <h3 className="text-sm font-semibold text-blue-900 mb-2">Materials</h3>
                      <div className="bg-white p-3 rounded border border-gray-200 space-y-2">
                        {quote.materials.map((item: any, index: number) => (
                          <div key={index} className="flex justify-between text-sm">
                            <span className="text-gray-600">{item.description || "N/A"}</span>
                            <span className="text-gray-900">€{safeFixed(item.cost)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {quote.labor_items && quote.labor_items.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-blue-900 mb-2">Labor</h3>
                      <div className="bg-white p-3 rounded border border-gray-200 space-y-2">
                        {quote.labor_items.map((item: any, index: number) => (
                          <div key={index} className="flex justify-between text-sm">
                            <span className="text-gray-600">{item.description || "N/A"}</span>
                            <span className="text-gray-900">€{safeFixed(item.cost)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {quote.packaging_items && quote.packaging_items.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-blue-900 mb-2">Packaging</h3>
                      <div className="bg-white p-3 rounded border border-gray-200 space-y-2">
                        {quote.packaging_items.map((item: any, index: number) => (
                          <div key={index} className="flex justify-between text-sm">
                            <span className="text-gray-600">{item.description || "N/A"}</span>
                            <span className="text-gray-900">€{safeFixed(item.cost)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-4 sm:gap-6 pt-4 border-t-2 border-gray-200">
                  <div>
                    <h3 className="text-sm font-semibold text-blue-900 mb-3">Cost Breakdown</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Printing Cost</span>
                        <span className="text-gray-900">€{safeFixed(quote.total_printing_cost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Machine Cost</span>
                        <span className="text-gray-900">€{safeFixed(quote.machine_cost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Materials Cost</span>
                        <span className="text-gray-900">€{safeFixed(quote.materials_cost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Labor Cost</span>
                        <span className="text-gray-900">€{safeFixed(quote.labor_cost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Packaging & Shipping Cost</span>
                        <span className="text-gray-900">€{safeFixed(quote.packaging_cost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Transportation Cost</span>
                        <span className="text-gray-900">€{safeFixed(quote.fuel_cost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Electricity Cost</span>
                        <span className="text-gray-900">
                          €{safeFixed((quote.electricity_cost || 0) + (quote.drying_cost || 0))}
                        </span>
                      </div>
                      {quote.is_emergency && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Emergency Fee</span>
                          <span className="text-gray-900">€{safeFixed(quote.emergency_fee)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t-2 border-gray-200 pt-2">
                        <span className="text-gray-600 font-semibold">Total Landed Cost</span>
                        <span className="text-gray-900 font-semibold">€{safeFixed(quote.landed_cost)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-blue-900 mb-3">Profit Margins</h3>
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      {Number(quote.selected_margin_percentage) >= 0 &&
                        Number(quote.selected_margin_percentage) < 29 && (
                          <div className="col-span-2 p-3 rounded-lg border-2 bg-blue-600 border-blue-700 shadow-lg">
                            <div className="text-xs mb-1 text-blue-100">
                              Custom: {Number(quote.selected_margin_percentage).toFixed(1)}% Margin
                            </div>
                            <div className="text-lg font-semibold text-white">
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
                            ? "bg-blue-600 border-blue-700 shadow-lg"
                            : "bg-white border-gray-200"
                        }`}
                      >
                        <div
                          className={`text-xs mb-1 ${(Number(quote.selected_margin_percentage) >= 29 && Number(quote.selected_margin_percentage) < 35) || quote.selected_margin === "30" ? "text-blue-100" : "text-gray-600"}`}
                        >
                          {quote.final_price && (Number(quote.selected_margin_percentage) >= 29 && Number(quote.selected_margin_percentage) < 35)
                            ? `Custom: ${Number(quote.selected_margin_percentage).toFixed(1)}% Margin`
                            : "30% Margin"}
                        </div>
                        <div
                          className={`text-lg font-semibold ${(Number(quote.selected_margin_percentage) >= 29 && Number(quote.selected_margin_percentage) < 35) || quote.selected_margin === "30" ? "text-white" : "text-green-600"}`}
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
                            ? "bg-blue-600 border-blue-700 shadow-lg"
                            : "bg-white border-gray-200"
                        }`}
                      >
                        <div
                          className={`text-xs mb-1 ${(Number(quote.selected_margin_percentage) >= 35 && Number(quote.selected_margin_percentage) < 45) || quote.selected_margin === "40" ? "text-blue-100" : "text-gray-600"}`}
                        >
                          {quote.final_price && (Number(quote.selected_margin_percentage) >= 35 && Number(quote.selected_margin_percentage) < 45)
                            ? `Custom: ${Number(quote.selected_margin_percentage).toFixed(1)}% Margin`
                            : "40% Margin"}
                        </div>
                        <div
                          className={`text-lg font-semibold ${(Number(quote.selected_margin_percentage) >= 35 && Number(quote.selected_margin_percentage) < 45) || quote.selected_margin === "40" ? "text-white" : "text-green-600"}`}
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
                            ? "bg-blue-600 border-blue-700 shadow-lg"
                            : "bg-white border-gray-200"
                        }`}
                      >
                        <div
                          className={`text-xs mb-1 ${(Number(quote.selected_margin_percentage) >= 45 && Number(quote.selected_margin_percentage) < 55) || quote.selected_margin === "50" ? "text-blue-100" : "text-gray-600"}`}
                        >
                          {quote.final_price && (Number(quote.selected_margin_percentage) >= 45 && Number(quote.selected_margin_percentage) < 55)
                            ? `Custom: ${Number(quote.selected_margin_percentage).toFixed(1)}% Margin`
                            : "50% Margin"}
                        </div>
                        <div
                          className={`text-lg font-semibold ${(Number(quote.selected_margin_percentage) >= 45 && Number(quote.selected_margin_percentage) < 55) || quote.selected_margin === "50" ? "text-white" : "text-green-600"}`}
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
                            ? "bg-blue-600 border-blue-700 shadow-lg"
                            : "bg-white border-gray-200"
                        }`}
                      >
                        <div
                          className={`text-xs mb-1 ${(Number(quote.selected_margin_percentage) >= 55 && Number(quote.selected_margin_percentage) <= 60) || quote.selected_margin === "60" ? "text-blue-100" : "text-gray-600"}`}
                        >
                          {quote.final_price && (Number(quote.selected_margin_percentage) >= 55 && Number(quote.selected_margin_percentage) <= 60)
                            ? `Custom: ${Number(quote.selected_margin_percentage).toFixed(1)}% Margin`
                            : "60% Margin"}
                        </div>
                        <div
                          className={`text-lg font-semibold ${(Number(quote.selected_margin_percentage) >= 55 && Number(quote.selected_margin_percentage) <= 60) || quote.selected_margin === "60" ? "text-white" : "text-green-600"}`}
                        >
                          €{quote.final_price && (Number(quote.selected_margin_percentage) >= 55 && Number(quote.selected_margin_percentage) <= 60)
                            ? safeFixed(quote.final_price)
                            : safeFixed(quote.margin_60)}
                        </div>
                      </div>
                      {Number(quote.selected_margin_percentage) > 60 && (
                        <div className="col-span-2 p-3 rounded-lg border-2 bg-blue-600 border-blue-700 shadow-lg">
                          <div className="text-xs mb-1 text-blue-100">
                            Custom: {Number(quote.selected_margin_percentage).toFixed(1)}% Margin
                          </div>
                          <div className="text-lg font-semibold text-white">
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

                {quote.quote_type === "business" && (quote.ownerA_receives || quote.ownerB_receives) && (
                  <div className="mt-6 pt-4 border-t-2 border-gray-200">
                    <h3 className="text-sm font-semibold text-blue-900 mb-3">Profit Split</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-lg border-2 border-gray-300">
                        <div className="text-sm text-gray-600 mb-1">Owner A Receives</div>
                        <div className="text-2xl font-bold text-gray-900">€{safeFixed(quote.ownerA_receives)}</div>
                      </div>
                      <div className="bg-white p-4 rounded-lg border-2 border-gray-300">
                        <div className="text-sm text-gray-600 mb-1">Owner B Receives</div>
                        <div className="text-2xl font-bold text-gray-900">€{safeFixed(quote.ownerB_receives)}</div>
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
