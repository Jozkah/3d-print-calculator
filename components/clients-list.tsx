"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, Trash2, Pencil, Search, Mail, Phone, MapPin } from "lucide-react"
import { useRouter } from "next/navigation"
import { DialogCustom } from "@/components/ui/dialog-custom"
import { Textarea } from "@/components/ui/textarea"

type Client = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  created_at: string
}

type ClientsListProps = {
  clients: Client[]
}

export function ClientsList({ clients: initialClients }: ClientsListProps) {
  const [clients, setClients] = useState(initialClients)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; clientId: string | null }>({
    isOpen: false,
    clientId: null,
  })

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  })

  const router = useRouter()

  const filteredClients = clients.filter((client) =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.phone?.includes(searchQuery)
  )

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      address: "",
      notes: "",
    })
  }

  const handleAdd = async () => {
    if (!formData.name.trim()) return

    const supabase = createClient()
    const { error } = await supabase.from("clients").insert({
      name: formData.name,
      email: formData.email || null,
      phone: formData.phone || null,
      address: formData.address || null,
      notes: formData.notes || null,
    })

    if (!error) {
      resetForm()
      setIsAdding(false)
      const { data } = await supabase.from("clients").select("*").order("name")
      if (data) {
        setClients(data)
      }
      router.refresh()
    }
  }

  const handleEdit = async (id: string) => {
    if (!formData.name.trim()) return

    const supabase = createClient()
    const { error } = await supabase
      .from("clients")
      .update({
        name: formData.name,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        notes: formData.notes || null,
      })
      .eq("id", id)

    if (!error) {
      setEditingId(null)
      const { data } = await supabase.from("clients").select("*").order("name")
      if (data) {
        setClients(data)
      }
      router.refresh()
    }
  }

  const startEdit = (client: Client) => {
    setEditingId(client.id)
    setFormData({
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      notes: client.notes || "",
    })
  }

  const handleDelete = async (id: string) => {
    setDeleteDialog({ isOpen: true, clientId: id })
  }

  const confirmDelete = async () => {
    if (!deleteDialog.clientId) return

    const supabase = createClient()
    const { error } = await supabase.from("clients").delete().eq("id", deleteDialog.clientId)

    if (!error) {
      const newClients = clients.filter((c) => c.id !== deleteDialog.clientId)
      setClients(newClients)
    }
    setDeleteDialog({ isOpen: false, clientId: null })
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 border-blue-200"
          />
        </div>
        <Button onClick={() => setIsAdding(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Client
        </Button>
      </div>

      {/* Add Client Dialog */}
      <DialogCustom
        isOpen={isAdding}
        onClose={() => {
          setIsAdding(false)
          resetForm()
        }}
        onConfirm={handleAdd}
        title="Add New Client"
        description="Enter the client's information below."
        confirmText="Add Client"
        cancelText="Cancel"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="name" className="text-blue-900">
              Name *
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="border-blue-200"
            />
          </div>
          <div>
            <Label htmlFor="email" className="text-blue-900">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="border-blue-200"
            />
          </div>
          <div>
            <Label htmlFor="phone" className="text-blue-900">
              Phone
            </Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="border-blue-200"
            />
          </div>
          <div>
            <Label htmlFor="address" className="text-blue-900">
              Address (Optional)
            </Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="border-blue-200"
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="notes" className="text-blue-900">
              Notes
            </Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="border-blue-200"
              rows={3}
            />
          </div>
        </div>
      </DialogCustom>

      {/* Edit Client Dialog */}
      <DialogCustom
        isOpen={!!editingId}
        onClose={() => {
          setEditingId(null)
          resetForm()
        }}
        onConfirm={() => editingId && handleEdit(editingId)}
        title="Edit Client"
        description="Update the client's information below."
        confirmText="Save Changes"
        cancelText="Cancel"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-name" className="text-blue-900">
              Name *
            </Label>
            <Input
              id="edit-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="border-blue-200"
            />
          </div>
          <div>
            <Label htmlFor="edit-email" className="text-blue-900">
              Email
            </Label>
            <Input
              id="edit-email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="border-blue-200"
            />
          </div>
          <div>
            <Label htmlFor="edit-phone" className="text-blue-900">
              Phone
            </Label>
            <Input
              id="edit-phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="border-blue-200"
            />
          </div>
          <div>
            <Label htmlFor="edit-address" className="text-blue-900">
              Address (Optional)
            </Label>
            <Textarea
              id="edit-address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="border-blue-200"
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="edit-notes" className="text-blue-900">
              Notes
            </Label>
            <Textarea
              id="edit-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="border-blue-200"
              rows={3}
            />
          </div>
        </div>
      </DialogCustom>

      {/* Delete Confirmation Dialog */}
      <DialogCustom
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, clientId: null })}
        onConfirm={confirmDelete}
        title="Delete Client"
        description="Are you sure you want to delete this client? This will not delete associated quotes."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Clients List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredClients.map((client) => (
          <Card key={client.id} className="border-blue-200">
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-semibold text-lg text-blue-900">{client.name}</h3>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(client)}
                    className="h-8 w-8 p-0 hover:bg-blue-50"
                  >
                    <Pencil className="w-4 h-4 text-blue-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(client.id)}
                    className="h-8 w-8 p-0 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {client.email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-4 h-4 shrink-0" />
                    <span className="truncate">{client.email}</span>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-4 h-4 shrink-0" />
                    <span>{client.phone}</span>
                  </div>
                )}
                {client.address && (
                  <div className="flex items-start gap-2 text-gray-600">
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{client.address}</span>
                  </div>
                )}
                {client.notes && (
                  <div className="text-gray-500 text-xs mt-2 line-clamp-2 italic">{client.notes}</div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredClients.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No clients found.</p>
          {searchQuery && <p className="text-sm mt-2">Try adjusting your search.</p>}
        </div>
      )}
    </div>
  )
}
