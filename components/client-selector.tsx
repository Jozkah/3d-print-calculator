"use client"

import { useState, useMemo, useEffect } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { DialogCustom } from "@/components/ui/dialog-custom"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"

type Client = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
}

interface ClientSelectorProps {
  value: string
  onChange: (value: string, clientId?: string) => void
  clients: Client[]
  onClientsUpdate?: () => void
  placeholder?: string
  className?: string
}

export function ClientSelector({
  value,
  onChange,
  clients,
  onClientsUpdate,
  placeholder = "Select or add client...",
  className,
}: ClientSelectorProps) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newClientName, setNewClientName] = useState("")
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  })

  const clientNames = useMemo(() => clients.map((c) => c.name), [clients])

  const filteredClients = useMemo(() => {
    if (!searchValue) return clients
    return clients.filter((client) => client.name.toLowerCase().includes(searchValue.toLowerCase()))
  }, [clients, searchValue])

  const showCreateOption = searchValue && !clients.some((c) => c.name.toLowerCase() === searchValue.toLowerCase())

  const handleCreateClick = () => {
    setNewClientName(searchValue)
    setFormData({
      name: searchValue,
      email: "",
      phone: "",
      address: "",
      notes: "",
    })
    setShowCreateDialog(true)
    setOpen(false)
  }

  const handleCreateClient = async () => {
    if (!formData.name.trim()) return

    const supabase = createClient()
    const { data, error } = await supabase
      .from("clients")
      .insert({
        name: formData.name,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        notes: formData.notes || null,
      })
      .select()
      .single()

    if (!error && data) {
      onChange(data.name, data.id)
      setShowCreateDialog(false)
      setSearchValue("")
      setFormData({
        name: "",
        email: "",
        phone: "",
        address: "",
        notes: "",
      })
      if (onClientsUpdate) {
        onClientsUpdate()
      }
    }
  }

  const handleSelectClient = (client: Client) => {
    onChange(client.name, client.id)
    setSearchValue("")
    setOpen(false)
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between border-blue-200", className)}
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>{value || placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput
              placeholder={placeholder}
              value={searchValue}
              onValueChange={setSearchValue}
              className="border-blue-200"
            />
            <CommandList>
              <CommandEmpty>No clients found.</CommandEmpty>
              <CommandGroup>
                {showCreateOption && (
                  <CommandItem
                    value={searchValue}
                    onSelect={handleCreateClick}
                    className="text-blue-600 font-medium break-words whitespace-normal"
                  >
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", "opacity-0")} />
                    <span className="break-words">Create "{searchValue}"</span>
                  </CommandItem>
                )}
                {filteredClients.map((client) => (
                  <CommandItem
                    key={client.id}
                    value={client.name}
                    onSelect={() => handleSelectClient(client)}
                    className="break-words whitespace-normal"
                  >
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", value === client.name ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col">
                      <span className="break-words">{client.name}</span>
                      {(client.email || client.phone) && (
                        <span className="text-xs text-gray-500">
                          {client.email || client.phone}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Create Client Dialog */}
      <DialogCustom
        isOpen={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false)
          setFormData({
            name: "",
            email: "",
            phone: "",
            address: "",
            notes: "",
          })
        }}
        title="Add New Client"
        description="Enter the client's information below."
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="client-name" className="text-blue-900">
              Name *
            </Label>
            <Input
              id="client-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="border-blue-200"
            />
          </div>
          <div>
            <Label htmlFor="client-email" className="text-blue-900">
              Email
            </Label>
            <Input
              id="client-email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="border-blue-200"
            />
          </div>
          <div>
            <Label htmlFor="client-phone" className="text-blue-900">
              Phone
            </Label>
            <Input
              id="client-phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="border-blue-200"
            />
          </div>
          <div>
            <Label htmlFor="client-address" className="text-blue-900">
              Address (Optional)
            </Label>
            <Textarea
              id="client-address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="border-blue-200"
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="client-notes" className="text-blue-900">
              Notes
            </Label>
            <Textarea
              id="client-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="border-blue-200"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false)
                setFormData({
                  name: "",
                  email: "",
                  phone: "",
                  address: "",
                  notes: "",
                })
              }}
              className="border-blue-300 text-blue-900"
            >
              Cancel
            </Button>
            <Button onClick={handleCreateClient} className="bg-blue-600 hover:bg-blue-700">
              Add Client
            </Button>
          </div>
        </div>
      </DialogCustom>
    </>
  )
}
