// Server-backed implementation of the attachment-store API, used when
// NEXT_PUBLIC_DATA_BACKEND=server. Mirrors every function lib/attachment-store.ts
// exposes, but talks to /api/attachments so file bytes are shared across users
// instead of trapped in one browser's IndexedDB.

import type { SaveAttachmentInput, AttachmentExport } from "@/lib/attachment-store"

const BASE = "/api/attachments"

type Meta = { id: string; order_id: string; name: string; type: string; size: number; created_at: string }

async function fetchMetas(): Promise<Meta[]> {
  try {
    const res = await fetch(`${BASE}?meta=1`, { cache: "no-store" })
    if (!res.ok) return []
    const json = (await res.json()) as { items?: Meta[] }
    return json.items ?? []
  } catch {
    return []
  }
}

export async function saveAttachmentBlob(input: SaveAttachmentInput): Promise<void> {
  const form = new FormData()
  form.set("id", input.id)
  form.set("order_id", input.orderId)
  form.set("name", input.name)
  form.set("type", input.type || (input.file as Blob).type || "application/octet-stream")
  form.set("file", input.file, input.name)
  const res = await fetch(BASE, { method: "POST", body: form })
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}))
    throw new Error((msg as any)?.error ?? `Failed to upload attachment (${res.status})`)
  }
}

export async function getAttachmentBlob(id: string): Promise<Blob | null> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, { cache: "no-store" })
    if (!res.ok) return null
    return await res.blob()
  } catch {
    return null
  }
}

export async function deleteAttachmentBlob(id: string): Promise<void> {
  await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" })
}

export async function deleteAttachmentsForOrder(orderId: string): Promise<number> {
  try {
    const res = await fetch(`${BASE}?order_id=${encodeURIComponent(orderId)}`, { method: "DELETE" })
    if (!res.ok) return 0
    const json = (await res.json()) as { removed?: number }
    return json.removed ?? 0
  } catch {
    return 0
  }
}

export async function listAttachmentIds(): Promise<string[]> {
  return (await fetchMetas()).map((m) => m.id)
}

// Direct endpoint URL — streams from the host, so nothing to revoke. (The
// shared revokeAttachmentUrl no-ops on non-blob URLs.)
export async function getAttachmentUrl(id: string): Promise<string | null> {
  return `${BASE}/${encodeURIComponent(id)}`
}

export async function attachmentStorageUsed(): Promise<number> {
  return (await fetchMetas()).reduce((sum, m) => sum + (m.size || 0), 0)
}

export async function browserStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  // Storage lives on the server now; the browser quota is irrelevant.
  return null
}

export async function getAttachmentRecord(
  id: string,
): Promise<{ blob: Blob; name: string; type: string; order_id: string } | null> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, { cache: "no-store" })
    if (!res.ok) return null
    const blob = await res.blob()
    const name = decodeURIComponent(res.headers.get("X-Attachment-Name") ?? "")
    const order_id = res.headers.get("X-Order-Id") ?? ""
    const type = res.headers.get("Content-Type") ?? blob.type
    return { blob, name, type, order_id }
  } catch {
    return null
  }
}

export async function attachmentCount(): Promise<number> {
  return (await fetchMetas()).length
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(",")
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error("Failed reading attachment for backup."))
    reader.readAsDataURL(blob)
  })
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: type || "application/octet-stream" })
}

export async function exportAllAttachments(): Promise<{ items: AttachmentExport[]; failed: string[] }> {
  const metas = await fetchMetas()
  const items: AttachmentExport[] = []
  const failed: string[] = []
  for (const m of metas) {
    const blob = await getAttachmentBlob(m.id)
    if (!blob) {
      failed.push(m.name || m.id)
      continue
    }
    try {
      items.push({ id: m.id, order_id: m.order_id, name: m.name, type: m.type, data: await blobToBase64(blob) })
    } catch {
      failed.push(m.name || m.id)
    }
  }
  return { items, failed }
}

export async function importAttachmentRecords(
  records: AttachmentExport[],
): Promise<{ imported: number; failed: string[] }> {
  let imported = 0
  const failed: string[] = []
  for (const r of records) {
    try {
      const blob = base64ToBlob(r.data, r.type)
      await saveAttachmentBlob({ id: r.id, orderId: r.order_id, file: blob, name: r.name, type: r.type })
      imported += 1
    } catch {
      failed.push(r.name || r.id)
    }
  }
  return { imported, failed }
}
