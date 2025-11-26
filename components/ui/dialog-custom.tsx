"use client"

import type React from "react"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface DialogCustomProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: "danger" | "default" | "success"
  showCancel?: boolean
  children?: React.ReactNode
}

export function DialogCustom({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  showCancel = true,
  children,
}: DialogCustomProps) {
  if (!isOpen) return null

  const getButtonVariant = () => {
    if (variant === "danger") return "destructive"
    if (variant === "success") return "default"
    return "default"
  }

  const getButtonClassName = () => {
    if (variant === "success") return "bg-green-600 hover:bg-green-700 text-white"
    return ""
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <button onClick={onClose} className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          {children}

          <div className="flex justify-end gap-3">
            {showCancel && (
              <Button variant="outline" onClick={onClose}>
                {cancelText}
              </Button>
            )}
            <Button
              variant={getButtonVariant()}
              className={getButtonClassName()}
              onClick={() => {
                onConfirm()
                onClose()
              }}
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
