"use client"

import type React from "react"
import { useState, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2, Check, X, Search, SlidersHorizontal, Upload, Pencil, Download } from "lucide-react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ComboboxCreatable } from "@/components/ui/combobox-creatable"
import { DialogCustom } from "@/components/ui/dialog-custom"

type Filament = {
  id: string
  name: string
  price_per_kg: number | null
  requires_heating: boolean
  heating_time_hours: number
  brand?: string
  type?: string
  color?: string
}

type FilamentsListProps = {
  filaments: Filament[]
}

export function FilamentsList({ filaments: initialFilaments }: FilamentsListProps) {
  const [filaments, setFilaments] = useState(initialFilaments)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newFilament, setNewFilament] = useState({
    name: "",
    price_per_kg: "",
    requires_heating: false,
    brand: "",
    type: "",
    color: "",
  })
  const [editData, setEditData] = useState({
    name: "",
    price_per_kg: "",
    requires_heating: false,
    brand: "",
    type: "",
    color: "",
  })

  const [searchQuery, setSearchQuery] = useState("")
  const [showFilters, setShowFilters] = useState(false)
  const [filterBrand, setFilterBrand] = useState("all")
  const [filterType, setFilterType] = useState("all")
  const [filterColor, setFilterColor] = useState("all")
  const [filterHeating, setFilterHeating] = useState("all")
  const [sortBy, setSortBy] = useState<"name" | "price" | "type">("name")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; filamentId: string | null }>({
    isOpen: false,
    filamentId: null,
  })
  const [csvErrorDialog, setCsvErrorDialog] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: "",
  })

  const [bulkUpdateMode, setBulkUpdateMode] = useState(false)
  const [selectedFilaments, setSelectedFilaments] = useState<Set<string>>(new Set())
  const [bulkUpdateDialog, setBulkUpdateDialog] = useState<{ isOpen: boolean; newPrice: string }>({
    isOpen: false,
    newPrice: "",
  })

  const router = useRouter()

  const filterOptions = useMemo(() => {
    const brands = new Set<string>()
    const types = new Set<string>()
    const colors = new Set<string>()

    filaments.forEach((f) => {
      if (f.brand) brands.add(f.brand)
      if (f.type) types.add(f.type)
      if (f.color) colors.add(f.color)
    })

    return {
      brands: Array.from(brands).sort(),
      types: Array.from(types).sort(),
      colors: Array.from(colors).sort(),
    }
  }, [filaments])

  const filteredAndSortedFilaments = useMemo(() => {
    const filtered = filaments.filter((f) => {
      const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesBrand = filterBrand === "all" || f.brand === filterBrand
      const matchesType = filterType === "all" || f.type === filterType
      const matchesColor = filterColor === "all" || f.color === filterColor
      const matchesHeating =
        filterHeating === "all" ||
        (filterHeating === "heating" && f.requires_heating) ||
        (filterHeating === "no-heating" && !f.requires_heating)

      return matchesSearch && matchesBrand && matchesType && matchesColor && matchesHeating
    })

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0

      if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name)
      } else if (sortBy === "price") {
        comparison = (a.price_per_kg || 0) - (b.price_per_kg || 0)
      } else if (sortBy === "type") {
        const typeA = a.type || "Other"
        const typeB = b.type || "Other"
        comparison = typeA.localeCompare(typeB)
      }

      return sortOrder === "asc" ? comparison : -comparison
    })

    return filtered
  }, [filaments, searchQuery, filterBrand, filterType, filterColor, filterHeating, sortBy, sortOrder])

  const resetFilters = () => {
    setSearchQuery("")
    setFilterBrand("all")
    setFilterType("all")
    setFilterColor("all")
    setFilterHeating("all")
    setSortBy("name")
    setSortOrder("asc")
  }

  const handleAdd = async () => {
    if (!newFilament.name || !newFilament.price_per_kg) return

    const supabase = createClient()
    const { error } = await supabase.from("filaments").insert({
      name: newFilament.name,
      price_per_kg: Number.parseFloat(newFilament.price_per_kg),
      requires_heating: newFilament.requires_heating,
      heating_time_hours: 0,
      brand: newFilament.brand || "Generic",
      type: newFilament.type || "Other",
      color: newFilament.color || "Other",
    })

    if (!error) {
      setNewFilament({ name: "", price_per_kg: "", requires_heating: false, brand: "", type: "", color: "" })
      setIsAdding(false)
      const { data } = await supabase.from("filaments").select("*").order("name")
      if (data) {
        setFilaments(data)
      }
      router.refresh()
    }
  }

  const handleDelete = async (id: string) => {
    setDeleteDialog({ isOpen: true, filamentId: id })
  }

  const confirmDelete = async () => {
    if (!deleteDialog.filamentId) return

    const supabase = createClient()
    const { error } = await supabase.from("filaments").delete().eq("id", deleteDialog.filamentId)

    if (!error) {
      setFilaments(filaments.filter((f) => f.id !== deleteDialog.filamentId))
    }
    setDeleteDialog({ isOpen: false, filamentId: null })
  }

  const handleEdit = async (id: string) => {
    if (!editData.name || !editData.price_per_kg) return

    const supabase = createClient()
    const { error } = await supabase
      .from("filaments")
      .update({
        name: editData.name,
        price_per_kg: Number.parseFloat(editData.price_per_kg),
        requires_heating: editData.requires_heating,
        heating_time_hours: 0,
        brand: editData.brand || "Generic",
        type: editData.type || "Other",
        color: editData.color || "Other",
      })
      .eq("id", id)

    if (!error) {
      setEditingId(null)
      const { data } = await supabase.from("filaments").select("*").order("name")
      if (data) {
        setFilaments(data)
      }
      router.refresh()
    }
  }

  const startEdit = (filament: Filament) => {
    setEditingId(filament.id)
    setEditData({
      name: filament.name,
      price_per_kg: filament.price_per_kg?.toString() || "",
      requires_heating: filament.requires_heating || false,
      brand: filament.brand || "",
      type: filament.type || "",
      color: filament.color || "",
    })
  }

  const handleCSVImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const fileHash = await hashString(text)

      // Check if CSV was already imported
      const supabase = createClient()
      const { data: existingImport } = await supabase
        .from("imported_csv_files")
        .select("*")
        .eq("file_hash", fileHash)
        .single()

      if (existingImport) {
        setCsvErrorDialog({
          isOpen: true,
          message: `This CSV file was already imported on ${new Date(existingImport.imported_at).toLocaleDateString()}.`,
        })
        event.target.value = ""
        return
      }

      const lines = text.split("\n").filter((line) => line.trim())
      const filamentData: Array<{
        brand: string
        type: string
        color: string
        price_per_kg: number | null
      }> = []

      // Skip header row (index 0)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]
        const columns = line.split(";").map((col) => col.trim())

        if (columns.length < 3) continue // Need at least Brand, Type, Color

        const brand = columns[0] || ""
        const type = columns[1] || ""
        const color = columns[2] || ""
        const priceStr = columns[5] || "" // Column F (index 5)

        // Parse European price format (comma as decimal, remove € symbol)
        let price: number | null = null
        if (priceStr) {
          const cleanPrice = priceStr.replace("€", "").replace(",", ".").trim()
          const parsed = Number.parseFloat(cleanPrice)
          if (!isNaN(parsed)) {
            price = parsed
          }
        }

        // Skip EMPTY filaments
        if (brand && type && color && type !== "EMPTY") {
          filamentData.push({
            brand,
            type,
            color,
            price_per_kg: price,
          })
        }
      }

      if (filamentData.length === 0) {
        setCsvErrorDialog({
          isOpen: true,
          message: "No valid filament data found in CSV file.",
        })
        event.target.value = ""
        return
      }

      // Insert filaments
      const { error: insertError } = await supabase.from("filaments").insert(
        filamentData.map((f) => ({
          name: `${f.brand} ${f.type} ${f.color}`,
          brand: f.brand,
          type: f.type,
          color: f.color,
          price_per_kg: f.price_per_kg,
          requires_heating: false,
          heating_time_hours: 0,
        })),
      )

      if (insertError) {
        console.error("[v0] Error importing filaments:", insertError)
        setCsvErrorDialog({
          isOpen: true,
          message: "Error importing filaments. Please try again.",
        })
        event.target.value = ""
        return
      }

      // Track the imported CSV
      await supabase.from("imported_csv_files").insert({
        file_name: file.name,
        file_hash: fileHash,
        records_imported: filamentData.length,
      })

      // Refresh the page to show new filaments
      router.refresh()
      event.target.value = ""
    } catch (error) {
      console.error("[v0] Error processing CSV:", error)
      setCsvErrorDialog({
        isOpen: true,
        message: "Error processing CSV file. Please check the format.",
      })
      event.target.value = ""
    }
  }

  const hashString = async (str: string): Promise<string> => {
    const encoder = new TextEncoder()
    const data = encoder.encode(str)
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  }

  const toggleFilamentSelection = (filamentId: string) => {
    const newSelected = new Set(selectedFilaments)
    if (newSelected.has(filamentId)) {
      newSelected.delete(filamentId)
    } else {
      newSelected.add(filamentId)
    }
    setSelectedFilaments(newSelected)
  }

  const selectAllFiltered = () => {
    const allIds = new Set(filteredAndSortedFilaments.map((f) => f.id))
    setSelectedFilaments(allIds)
  }

  const deselectAll = () => {
    setSelectedFilaments(new Set())
  }

  const handleBulkUpdatePrice = async () => {
    if (selectedFilaments.size === 0) return

    const newPrice = Number.parseFloat(bulkUpdateDialog.newPrice)
    if (isNaN(newPrice) || newPrice < 0) {
      setCsvErrorDialog({
        isOpen: true,
        message: "Please enter a valid price",
      })
      return
    }

    try {
      const supabase = createClient()

      // Update all selected filaments
      const { error } = await supabase
        .from("filaments")
        .update({ price_per_kg: newPrice })
        .in("id", Array.from(selectedFilaments))

      if (error) throw error

      // Refresh filaments list
      const { data: updatedFilaments } = await supabase.from("filaments").select("*").order("name")

      if (updatedFilaments) {
        setFilaments(updatedFilaments)
      }

      // Reset state
      setBulkUpdateDialog({ isOpen: false, newPrice: "" })
      setSelectedFilaments(new Set())
      setBulkUpdateMode(false)
      router.refresh()
    } catch (error: any) {
      console.error("[v0] Error bulk updating prices:", error)
      setCsvErrorDialog({
        isOpen: true,
        message: `Failed to update prices: ${error.message}`,
      })
    }
  }

  const handleExportCSV = () => {
    // Determine which filaments to export
    let filamentsToExport = filteredAndSortedFilaments

    // If in bulk mode and some are selected, export only selected
    if (bulkUpdateMode && selectedFilaments.size > 0) {
      filamentsToExport = filteredAndSortedFilaments.filter((f) => selectedFilaments.has(f.id))
    }

    if (filamentsToExport.length === 0) {
      setCsvErrorDialog({
        isOpen: true,
        message: "No filaments to export",
      })
      return
    }

    // Updated headers to include Heating and remove Weight/Spools
    const headers = ["Brand", "Type/Material", "Color", "Price", "Heating"]
    const csvRows = [headers.join(";")]

    filamentsToExport.forEach((filament) => {
      const price = filament.price_per_kg ? `€${filament.price_per_kg.toFixed(2).replace(".", ",")}` : ""
      // Added true/false for requires_heating
      const heating = filament.requires_heating ? "true" : "false"

      const row = [filament.brand || "", filament.type || "", filament.color || "", price, heating]
      csvRows.push(row.join(";"))
    })

    // Create blob and download
    const csvContent = csvRows.join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `filaments_export_${new Date().toISOString().split("T")[0]}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-blue-900">Filaments</h2>
        <div className="flex gap-2">
          <Button
            onClick={() => document.getElementById("csv-import")?.click()}
            variant="outline"
            className="bg-white border-blue-300 text-blue-900"
          >
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
          <input id="csv-import" type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
          <Button onClick={() => setIsAdding(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Filament
          </Button>
        </div>
      </div>

      <Card className="mb-6 bg-white border-2 border-blue-300">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4">
            {/* Search and Filter Toggle */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                <Input
                  placeholder="Search filaments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 border-blue-200"
                />
              </div>
              <Button
                variant="outline"
                className="border-blue-300 text-blue-900 bg-transparent"
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                Filters
              </Button>
            </div>

            {/* Filter Controls */}
            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-blue-200">
                <div>
                  <Label className="text-blue-900 text-sm mb-2">Type</Label>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="border-blue-200">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {filterOptions.types.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-blue-900 text-sm mb-2">Brand</Label>
                  <Select value={filterBrand} onValueChange={setFilterBrand}>
                    <SelectTrigger className="border-blue-200">
                      <SelectValue placeholder="All Brands" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Brands</SelectItem>
                      {filterOptions.brands.map((brand) => (
                        <SelectItem key={brand} value={brand}>
                          {brand}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-blue-900 text-sm mb-2">Color</Label>
                  <Select value={filterColor} onValueChange={setFilterColor}>
                    <SelectTrigger className="border-blue-200">
                      <SelectValue placeholder="All Colors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Colors</SelectItem>
                      {filterOptions.colors.map((color) => (
                        <SelectItem key={color} value={color}>
                          {color}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-blue-900 text-sm mb-2">Heating Required</Label>
                  <Select value={filterHeating} onValueChange={setFilterHeating}>
                    <SelectTrigger className="border-blue-200">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="heating">Requires Heating</SelectItem>
                      <SelectItem value="no-heating">No Heating</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-blue-900 text-sm mb-2">Sort By</Label>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                    <SelectTrigger className="border-blue-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="price">Price</SelectItem>
                      <SelectItem value="type">Type</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-blue-900 text-sm mb-2">Order</Label>
                  <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as any)}>
                    <SelectTrigger className="border-blue-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    variant="outline"
                    className="w-full border-blue-300 text-blue-900 bg-transparent"
                    onClick={resetFilters}
                  >
                    Reset Filters
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 text-sm text-blue-600">
        Showing {filteredAndSortedFilaments.length} of {filaments.length} filament(s)
      </div>

      {isAdding && (
        <Card className="mb-6 bg-white border-2 border-blue-300">
          <CardHeader>
            <CardTitle className="text-blue-900">New Filament</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-blue-900">
                Filament Name
              </Label>
              <Input
                id="name"
                value={newFilament.name}
                onChange={(e) => setNewFilament({ ...newFilament, name: e.target.value })}
                className="border-blue-200"
                placeholder="e.g., PLA Black Prusament"
              />
            </div>
            <div>
              <Label htmlFor="type" className="text-blue-900">
                Type
              </Label>
              <ComboboxCreatable
                value={newFilament.type}
                onChange={(value) => setNewFilament({ ...newFilament, type: value })}
                options={filterOptions.types}
                placeholder="Select or type filament type..."
                emptyText="Type to create a new filament type"
              />
            </div>
            <div>
              <Label htmlFor="brand" className="text-blue-900">
                Brand
              </Label>
              <ComboboxCreatable
                value={newFilament.brand}
                onChange={(value) => setNewFilament({ ...newFilament, brand: value })}
                options={filterOptions.brands}
                placeholder="Select or type brand..."
                emptyText="Type to create a new brand"
              />
            </div>
            <div>
              <Label htmlFor="color" className="text-blue-900">
                Color
              </Label>
              <ComboboxCreatable
                value={newFilament.color}
                onChange={(value) => setNewFilament({ ...newFilament, color: value })}
                options={filterOptions.colors}
                placeholder="Select or type color..."
                emptyText="Type to create a new color"
              />
            </div>
            <div>
              <Label htmlFor="price" className="text-blue-900">
                Price per KG (€)
              </Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={newFilament.price_per_kg}
                onChange={(e) => setNewFilament({ ...newFilament, price_per_kg: e.target.value })}
                className="border-blue-200"
                placeholder="20.00"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="requires_heating"
                checked={newFilament.requires_heating}
                onCheckedChange={(checked) => setNewFilament({ ...newFilament, requires_heating: checked as boolean })}
              />
              <Label htmlFor="requires_heating" className="text-blue-900 text-sm">
                Requires Heating (automatically adds drying cost based on printing time)
              </Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdd} className="bg-green-600 hover:bg-green-700">
                <Check className="w-4 h-4 mr-2" />
                Save
              </Button>
              <Button onClick={() => setIsAdding(false)} variant="outline" className="border-blue-300 text-blue-900">
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {filteredAndSortedFilaments.map((filament) => (
          <Card
            key={filament.id}
            className={`border-blue-200 bg-white ${!filament.price_per_kg || filament.price_per_kg === 0 ? "border-red-500 border-2" : ""} ${
              bulkUpdateMode && selectedFilaments.has(filament.id) ? "ring-2 ring-blue-500" : ""
            }`}
          >
            <CardContent className="p-6">
              {bulkUpdateMode && (
                <div className="mb-4">
                  <Checkbox
                    id={`select_${filament.id}`}
                    checked={selectedFilaments.has(filament.id)}
                    onCheckedChange={() => toggleFilamentSelection(filament.id)}
                  />
                  <label htmlFor={`select_${filament.id}`} className="ml-2 text-sm text-gray-600 cursor-pointer">
                    Select for bulk update
                  </label>
                </div>
              )}

              {editingId === filament.id ? (
                <div className="space-y-4">
                  <div>
                    <Label className="text-blue-900">Filament Name</Label>
                    <Input
                      value={editData.name}
                      onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      className="border-blue-200"
                    />
                  </div>
                  <div>
                    <Label className="text-blue-900">Type</Label>
                    <ComboboxCreatable
                      value={editData.type}
                      onChange={(value) => setEditData({ ...editData, type: value })}
                      options={filterOptions.types}
                      placeholder="Select or type filament type..."
                      emptyText="Type to create a new filament type"
                    />
                  </div>
                  <div>
                    <Label className="text-blue-900">Brand</Label>
                    <ComboboxCreatable
                      value={editData.brand}
                      onChange={(value) => setEditData({ ...editData, brand: value })}
                      options={filterOptions.brands}
                      placeholder="Select or type brand..."
                      emptyText="Type to create a new brand"
                    />
                  </div>
                  <div>
                    <Label className="text-blue-900">Color</Label>
                    <ComboboxCreatable
                      value={editData.color}
                      onChange={(value) => setEditData({ ...editData, color: value })}
                      options={filterOptions.colors}
                      placeholder="Select or type color..."
                      emptyText="Type to create a new color"
                    />
                  </div>
                  <div>
                    <Label className="text-blue-900">Price per KG (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editData.price_per_kg}
                      onChange={(e) => setEditData({ ...editData, price_per_kg: e.target.value })}
                      className="border-blue-200"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit_heating_${filament.id}`}
                      checked={editData.requires_heating}
                      onCheckedChange={(checked) => setEditData({ ...editData, requires_heating: checked as boolean })}
                    />
                    <Label htmlFor={`edit_heating_${filament.id}`} className="text-blue-900 text-sm">
                      Requires Heating (automatically adds drying cost based on printing time)
                    </Label>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleEdit(filament.id)}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Save
                    </Button>
                    <Button
                      onClick={() => setEditingId(null)}
                      size="sm"
                      variant="outline"
                      className="border-blue-300 text-blue-900"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-blue-900 text-lg">{filament.name}</h3>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingId(filament.id)
                          setEditData({
                            name: filament.name,
                            price_per_kg: filament.price_per_kg?.toString() || "",
                            requires_heating: filament.requires_heating,
                            brand: filament.brand || "",
                            type: filament.type || "",
                            color: filament.color || "",
                          })
                        }}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteDialog({ isOpen: true, filamentId: filament.id })}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                    <span
                      className={
                        !filament.price_per_kg || filament.price_per_kg === 0 ? "text-red-600 font-semibold" : ""
                      }
                    >
                      {filament.price_per_kg && filament.price_per_kg > 0
                        ? `€${filament.price_per_kg.toFixed(2)}/kg`
                        : "No Price"}
                    </span>
                    {filament.type && (
                      <>
                        <span className="text-blue-400">•</span>
                        <span>{filament.type}</span>
                      </>
                    )}
                    {filament.brand && (
                      <>
                        <span className="text-blue-400">•</span>
                        <span>{filament.brand}</span>
                      </>
                    )}
                    {filament.color && (
                      <>
                        <span className="text-blue-400">•</span>
                        <span>{filament.color}</span>
                      </>
                    )}
                    {filament.requires_heating && (
                      <>
                        <span className="text-blue-400">•</span>
                        <span className="text-orange-600">Requires Heating</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button
          variant={bulkUpdateMode ? "default" : "outline"}
          className={bulkUpdateMode ? "bg-blue-600 text-white" : "border-blue-300 text-blue-900 bg-transparent"}
          onClick={() => {
            setBulkUpdateMode(!bulkUpdateMode)
            if (bulkUpdateMode) {
              setSelectedFilaments(new Set())
            }
          }}
        >
          {bulkUpdateMode ? "Cancel Bulk Update" : "Bulk Update Prices"}
        </Button>

        <div className="flex gap-2 items-center">
          {bulkUpdateMode && (
            <>
              <span className="text-sm text-gray-600">{selectedFilaments.size} selected</span>
              <Button
                variant="outline"
                size="sm"
                className="border-blue-300 text-blue-900 bg-transparent"
                onClick={selectAllFiltered}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-blue-300 text-blue-900 bg-transparent"
                onClick={deselectAll}
              >
                Deselect All
              </Button>
              <Button
                variant="default"
                size="sm"
                className="bg-blue-600 text-white"
                onClick={() => setBulkUpdateDialog({ isOpen: true, newPrice: "" })}
                disabled={selectedFilaments.size === 0}
              >
                Update {selectedFilaments.size} Price{selectedFilaments.size !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          <Button variant="outline" className="border-blue-300 text-blue-900 bg-transparent" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export to CSV (
            {bulkUpdateMode && selectedFilaments.size > 0
              ? selectedFilaments.size + " selected"
              : filteredAndSortedFilaments.length + " filaments"}
            )
          </Button>
        </div>
      </div>

      {/* Export Section */}
      {/* Removed duplicate Export to CSV button */}
      {/* <div className="mt-8 flex justify-end">
        <Button variant="outline" className="border-blue-300 text-blue-900 bg-transparent" onClick={handleExportCSV}>
          <Download className="w-4 h-4 mr-2" />
          Export to CSV (
          {bulkUpdateMode && selectedFilaments.size > 0
            ? selectedFilaments.size + " selected"
            : filteredAndSortedFilaments.length + " filaments"}
          )
        </Button>
      </div> */}

      <DialogCustom
        isOpen={bulkUpdateDialog.isOpen}
        onClose={() => setBulkUpdateDialog({ isOpen: false, newPrice: "" })}
        onConfirm={handleBulkUpdatePrice}
        title="Update Prices"
        message={`Set new price for ${selectedFilaments.size} selected filament${selectedFilaments.size !== 1 ? "s" : ""}:`}
        variant="default"
      >
        <div className="mt-4">
          <Label className="text-blue-900">New Price per KG (€)</Label>
          <Input
            type="number"
            step="0.01"
            value={bulkUpdateDialog.newPrice}
            onChange={(e) => setBulkUpdateDialog({ ...bulkUpdateDialog, newPrice: e.target.value })}
            className="border-blue-200 mt-2"
            placeholder="0.00"
            autoFocus
          />
        </div>
      </DialogCustom>

      {filteredAndSortedFilaments.length === 0 && filaments.length > 0 && (
        <Card className="bg-blue-50 border-2 border-blue-200">
          <CardContent className="p-8 text-center">
            <p className="text-blue-600">No filaments match your current filters.</p>
            <Button
              variant="outline"
              className="mt-4 border-blue-300 text-blue-900 bg-transparent"
              onClick={resetFilters}
            >
              Reset Filters
            </Button>
          </CardContent>
        </Card>
      )}

      <DialogCustom
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, filamentId: null })}
        onConfirm={confirmDelete}
        title="Delete Filament"
        description="Are you sure you want to delete this filament? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />

      <DialogCustom
        isOpen={csvErrorDialog.isOpen}
        onClose={() => setCsvErrorDialog({ isOpen: false, message: "" })}
        onConfirm={() => setCsvErrorDialog({ isOpen: false, message: "" })}
        title="Import Error"
        description={csvErrorDialog.message}
        confirmText="OK"
        showCancel={false}
        variant="danger"
      />
    </div>
  )
}

export default FilamentsList
