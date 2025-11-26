"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2, Edit2, Check, X } from "lucide-react"
import { useRouter } from "next/navigation"

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
  const router = useRouter()

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
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-blue-900">Your Filaments</h2>
        <Button onClick={() => setIsAdding(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Filament
        </Button>
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
        {filaments.map((filament) => (
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
                    <p className="text-blue-600">€{filament.price_per_kg.toFixed(2)}/kg</p>
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
    </div>
  )
}
