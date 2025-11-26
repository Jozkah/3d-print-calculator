"use client"

import { useState, useMemo } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"

interface ComboboxCreatableProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  emptyText?: string
  className?: string
}

export function ComboboxCreatable({
  value,
  onChange,
  options,
  placeholder = "Select or type...",
  emptyText = "No results found.",
  className,
}: ComboboxCreatableProps) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

  const filteredOptions = useMemo(() => {
    if (!searchValue) return options
    return options.filter((option) => option.toLowerCase().includes(searchValue.toLowerCase()))
  }, [options, searchValue])

  const showCreateOption = searchValue && !options.some((opt) => opt.toLowerCase() === searchValue.toLowerCase())

  return (
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
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {/* Show create option first if typing new value */}
              {showCreateOption && (
                <CommandItem
                  value={searchValue}
                  onSelect={() => {
                    onChange(searchValue)
                    setSearchValue("")
                    setOpen(false)
                  }}
                  className="text-blue-600 font-medium break-words whitespace-normal"
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", "opacity-0")} />
                  <span className="break-words">Create "{searchValue}"</span>
                </CommandItem>
              )}
              {/* Show existing options */}
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => {
                    onChange(option)
                    setSearchValue("")
                    setOpen(false)
                  }}
                  className="break-words whitespace-normal"
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === option ? "opacity-100" : "opacity-0")} />
                  <span className="break-words">{option}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
