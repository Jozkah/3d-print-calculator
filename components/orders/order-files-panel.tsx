"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Upload,
  Download,
  Trash2,
  FileText,
  ImageIcon,
  Box as BoxIcon,
  FileArchive,
  File as FileIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import type { OrderAttachment } from "@/types/orders"
import { addAttachment, deleteAttachment } from "@/lib/orders/data"
import { getAttachmentUrl, revokeAttachmentUrl } from "@/lib/attachment-store"

const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml)$/i
const MODEL_EXT = /\.(stl|3mf|obj|step|stp|gcode|bgcode)$/i

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function kindOf(a: OrderAttachment): "image" | "model" | "pdf" | "archive" | "other" {
  if (IMAGE_TYPES.test(a.mime_type)) return "image"
  if (MODEL_EXT.test(a.file_name)) return "model"
  if (a.mime_type === "application/pdf" || /\.pdf$/i.test(a.file_name)) return "pdf"
  if (/(zip|rar|7z|tar|gz)$/i.test(a.file_name)) return "archive"
  return "other"
}

export function OrderFilesPanel({
  orderId,
  attachments,
  onChanged,
}: {
  orderId: string
  attachments: OrderAttachment[]
  onChanged: () => void
}) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const images = attachments.filter((a) => kindOf(a) === "image")

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) return
      setUploading(true)
      let failed = 0
      for (const file of list) {
        try {
          await addAttachment(orderId, file)
        } catch (e: unknown) {
          failed += 1
          toast({
            title: `Could not store "${file.name}"`,
            description: e instanceof Error ? e.message : "Storage error",
            variant: "destructive",
          })
        }
      }
      setUploading(false)
      if (failed < list.length) onChanged()
    },
    [orderId, onChanged, toast],
  )

  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Files</h3>
          <span className="text-xs text-muted-foreground">{attachments.length}</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <Upload className="size-4" />
          {uploading ? "Uploading…" : "Upload"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </header>

      <div className="p-4">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
          }}
          className={cn(
            "rounded-xl border border-dashed px-4 py-6 text-center text-sm transition-colors",
            dragOver ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground",
          )}
        >
          <Upload className="mx-auto mb-1.5 size-5 text-muted-foreground/60" />
          Drag &amp; drop files here, or use Upload. STL, images, PDFs, gcode, zips…
        </div>

        {attachments.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {attachments.map((a) => (
              <AttachmentRow
                key={a.id}
                attachment={a}
                onDelete={async () => {
                  await deleteAttachment(a)
                  onChanged()
                }}
                onPreview={
                  kindOf(a) === "image"
                    ? () => setLightboxIndex(images.findIndex((img) => img.id === a.id))
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </div>

      {lightboxIndex !== null && images[lightboxIndex] && (
        <Lightbox images={images} index={lightboxIndex} onIndex={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </section>
  )
}

function KindIcon({ attachment }: { attachment: OrderAttachment }) {
  const kind = kindOf(attachment)
  const cls = "size-4"
  if (kind === "image") return <ImageIcon className={cn(cls, "text-sky-500")} />
  if (kind === "model") return <BoxIcon className={cn(cls, "text-violet-500")} />
  if (kind === "pdf") return <FileText className={cn(cls, "text-red-500")} />
  if (kind === "archive") return <FileArchive className={cn(cls, "text-amber-500")} />
  return <FileIcon className={cn(cls, "text-muted-foreground")} />
}

function AttachmentRow({
  attachment,
  onDelete,
  onPreview,
}: {
  attachment: OrderAttachment
  onDelete: () => void
  onPreview?: () => void
}) {
  const [thumb, setThumb] = useState<string | null>(null)
  const attachmentId = attachment.id
  const isImage = kindOf(attachment) === "image"

  // Lazy thumbnail for images only — never load blobs for non-images.
  useEffect(() => {
    let url: string | null = null
    let active = true
    if (isImage) {
      getAttachmentUrl(attachmentId).then((u) => {
        if (active) {
          url = u
          setThumb(u)
        } else {
          revokeAttachmentUrl(u)
        }
      })
    }
    return () => {
      active = false
      revokeAttachmentUrl(url)
    }
  }, [attachmentId, isImage])

  async function download() {
    const url = await getAttachmentUrl(attachment.id)
    if (!url) return
    const link = document.createElement("a")
    link.href = url
    link.download = attachment.display_name || attachment.file_name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    revokeAttachmentUrl(url)
  }

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border/60 bg-background px-2.5 py-2">
      <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="size-full object-cover" />
        ) : (
          <KindIcon attachment={attachment} />
        )}
      </div>
      <button type="button" onClick={onPreview} disabled={!onPreview} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-medium text-foreground">{attachment.display_name || attachment.file_name}</div>
        <div className="text-xs text-muted-foreground">{humanSize(attachment.size)}</div>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button size="icon-sm" variant="ghost" title="Download" onClick={download}>
          <Download className="size-4" />
        </Button>
        <Button size="icon-sm" variant="ghost" title="Delete" onClick={onDelete}>
          <Trash2 className="size-4 text-red-500" />
        </Button>
      </div>
    </li>
  )
}

function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: OrderAttachment[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const current = images[index]

  useEffect(() => {
    let active = true
    let objUrl: string | null = null
    getAttachmentUrl(current.id).then((u) => {
      if (active) {
        objUrl = u
        setUrl(u)
      } else {
        revokeAttachmentUrl(u)
      }
    })
    return () => {
      active = false
      revokeAttachmentUrl(objUrl)
    }
  }, [current.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowRight" && index < images.length - 1) onIndex(index + 1)
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [index, images.length, onIndex, onClose])

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={onClose}>
        <X className="size-5" />
      </button>
      {index > 0 && (
        <button
          className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation()
            onIndex(index - 1)
          }}
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      <div className="max-h-[85vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={current.display_name || current.file_name} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
        ) : (
          <div className="flex h-40 items-center justify-center text-white">Loading…</div>
        )}
        <p className="mt-2 text-center text-sm text-white/80">
          {current.display_name || current.file_name} · {index + 1} / {images.length}
        </p>
      </div>
      {index < images.length - 1 && (
        <button
          className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation()
            onIndex(index + 1)
          }}
        >
          <ChevronRight className="size-6" />
        </button>
      )}
    </div>
  )
}
