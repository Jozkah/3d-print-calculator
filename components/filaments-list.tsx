"use client"

import { useState, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2, Edit2, Check, X, Search, SlidersHorizontal } from "lucide-react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Filament = {
  id: string
  name: string
  price_per_kg: number
  requires_heating: boolean
  heating_time_hours: number
}

export function FilamentsList({ filaments: initialFilaments }: { filaments: Filament[] }) {
  const [filaments, setFilaments] = useState(initialFilaments)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newFilament, setNewFilament] = useState({
    name: "",
    price_per_kg: "",
    requires_heating: false,
  })
  const [editData, setEditData] = useState({
    name: "",
    price_per_kg: "",
    requires_heating: false,
  })

  const [searchQuery, setSearchQuery] = useState("")
  const [showFilters, setShowFilters] = useState(false)
  const [filterBrand, setFilterBrand] = useState("all")
  const [filterType, setFilterType] = useState("all")
  const [filterColor, setFilterColor] = useState("all")
  const [filterHeating, setFilterHeating] = useState("all")
  const [sortBy, setSortBy] = useState<"name" | "price" | "type">("name")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")

  const router = useRouter()

  const extractFilamentInfo = (name: string) => {
    const nameLower = name.toLowerCase()

    // Common filament types
    const types = ["pla", "abs", "petg", "tpu", "nylon", "pc", "asa", "pva", "hips"]
    const type = types.find((t) => nameLower.includes(t)) || "other"

    // Common colors
    const colors = [
      "black",
      "white",
      "red",
      "blue",
      "green",
      "yellow",
      "orange",
      "purple",
      "pink",
      "gray",
      "grey",
      "brown",
      "transparent",
      "clear",
      "natural",
    ]
    const color = colors.find((c) => nameLower.includes(c)) || "other"

    // Extract brand (words after type/color, or last word)
    const words = name.split(" ")
    let brand = "generic"
    if (words.length > 1) {
      brand = words[words.length - 1]
    }

    return { type: type.toUpperCase(), color: color.charAt(0).toUpperCase() + color.slice(1), brand }
  }

  const filterOptions = useMemo(() => {
    const brands = new Set<string>()
    const types = new Set<string>()
    const colors = new Set<string>()

    filaments.forEach((f) => {
      const info = extractFilamentInfo(f.name)
      brands.add(info.brand)
      types.add(info.type)
      colors.add(info.color)
    })

    return {
      brands: Array.from(brands).sort(),
      types: Array.from(types).sort(),
      colors: Array.from(colors).sort(),
    }
  }, [filaments])

  const filteredAndSortedFilaments = useMemo(() => {
    const filtered = filaments.filter((f) => {
      const info = extractFilamentInfo(f.name)
      const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesBrand = filterBrand === "all" || info.brand === filterBrand
      const matchesType = filterType === "all" || info.type === filterType
      const matchesColor = filterColor === "all" || info.color === filterColor
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
        comparison = a.price_per_kg - b.price_per_kg
      } else if (sortBy === "type") {
        const typeA = extractFilamentInfo(a.name).type
        const typeB = extractFilamentInfo(b.name).type
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
    })

    if (!error) {
      setNewFilament({ name: "", price_per_kg: "", requires_heating: false })
      setIsAdding(false)
      router.refresh()
    }
  }

  const handleDelete = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("filaments").delete().eq("id", id)

    if (!error) {
      setFilaments(filaments.filter((f) => f.id !== id))
    }
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
      })
      .eq("id", id)

    if (!error) {
      setEditingId(null)
      router.refresh()
    }
  }

  const startEdit = (filament: Filament) => {
    setEditingId(filament.id)
    setEditData({
      name: filament.name,
      price_per_kg: filament.price_per_kg.toString(),
      requires_heating: filament.requires_heating || false,
    })
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-blue-900">Your Filaments</h2>
        <Button onClick={() => setIsAdding(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Filament
        </Button>
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
                placeholder="e.g., PLA Black"
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
          <Card key={filament.id} className="bg-white border-2 border-blue-300">
            <CardContent className="p-6">
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
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-blue-900">{filament.name}</h3>
                    <div className="flex gap-4 text-sm text-blue-600 mt-1">
                      <span>€{filament.price_per_kg.toFixed(2)}/kg</span>
                      <span className="text-blue-400">•</span>
                      <span>{extractFilamentInfo(filament.name).type}</span>
                      {filament.requires_heating && (
                        <>
                          <span className="text-blue-400">•</span>
                          <span className="text-orange-600">Requires Heating</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => startEdit(filament)}
                      size="sm"
                      variant="outline"
                      className="border-blue-300 text-blue-900"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => handleDelete(filament.id)}
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

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
    </div>
  )
}
