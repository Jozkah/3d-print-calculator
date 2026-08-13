// Browser-side binary attachment storage, backed by IndexedDB.
//
// Order/file *metadata* (name, size, type, category…) lives in the normal
// local-db JSON layer as `order_attachments` rows. The actual file bytes live
// HERE, in IndexedDB — never base64'd into localStorage, which would blow the
// ~5MB quota on the first STL.
//
// This module is the single seam for binary storage. The Orders UI only ever
// calls these functions, so swapping IndexedDB for Supabase Storage / S3 / R2
// later means reimplementing this file, not rewriting components. Every op is
// promise-based and degrades gracefully when IndexedDB is unavailable (SSR,
// private-mode restrictions) instead of throwing at import time.

import { isServerBackend } from "@/lib/data-backend"
import * as remote from "@/lib/remote-attachments"

const DB_NAME = "3dpc-attachments"
const DB_VERSION = 1
const STORE = "blobs"

/** What we persist per attachment. `id` matches the order_attachments row id. */
type StoredBlob = {
  id: string
  order_id: string
  blob: Blob
  size: number
  name: string
  type: string
  created_at: string
}

function hasIndexedDB(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window && window.indexedDB != null
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (!hasIndexedDB()) return Promise.reject(new Error("IndexedDB is not available in this browser."))
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" })
        store.createIndex("order_id", "order_id", { unique: false })
      }
    }
    req.onsuccess = () => {
      const db = req.result
      // If another tab triggers an upgrade, close so it isn't blocked.
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error ?? new Error("Failed to open attachment database."))
    req.onblocked = () => reject(new Error("Attachment database is blocked by another tab."))
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode)
        const store = transaction.objectStore(STORE)
        let request: IDBRequest<T>
        try {
          request = run(store)
        } catch (e) {
          reject(e)
          return
        }
        transaction.onerror = () => reject(transaction.error ?? new Error("Attachment transaction failed."))
        transaction.onabort = () =>
          reject(transaction.error ?? new Error("Attachment transaction aborted (storage full?)."))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error("Attachment request failed."))
      }),
  )
}

// ---------------------------------------------------------------------------
// Public API — the abstraction the UI depends on.
// ---------------------------------------------------------------------------

export type SaveAttachmentInput = {
  id: string
  orderId: string
  file: Blob & { name?: string }
  name: string
  type: string
}

/** Persist a file's bytes. The caller writes the metadata row separately. */
export async function saveAttachmentBlob(input: SaveAttachmentInput): Promise<void> {
  if (isServerBackend) return remote.saveAttachmentBlob(input)
  const record: StoredBlob = {
    id: input.id,
    order_id: input.orderId,
    blob: input.file,
    size: input.file.size,
    name: input.name,
    type: input.type || input.file.type || "application/octet-stream",
    created_at: new Date().toISOString(),
  }
  await tx("readwrite", (store) => store.put(record))
}

/** Retrieve raw bytes for an attachment, or null if the blob is missing. */
export async function getAttachmentBlob(id: string): Promise<Blob | null> {
  if (isServerBackend) return remote.getAttachmentBlob(id)
  try {
    const record = (await tx<StoredBlob | undefined>("readonly", (store) => store.get(id))) ?? null
    return record?.blob ?? null
  } catch {
    return null
  }
}

/** Delete a single attachment's bytes. Safe if it doesn't exist. */
export async function deleteAttachmentBlob(id: string): Promise<void> {
  if (isServerBackend) return remote.deleteAttachmentBlob(id)
  await tx("readwrite", (store) => store.delete(id))
}

/** Delete every blob belonging to an order (used when an order is hard-deleted). */
export async function deleteAttachmentsForOrder(orderId: string): Promise<number> {
  if (isServerBackend) return remote.deleteAttachmentsForOrder(orderId)
  const db = await openDB()
  return new Promise<number>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite")
    const store = transaction.objectStore(STORE)
    const index = store.index("order_id")
    const req = index.openCursor(IDBKeyRange.only(orderId))
    let removed = 0
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        cursor.delete()
        removed += 1
        cursor.continue()
      }
    }
    transaction.oncomplete = () => resolve(removed)
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed clearing order attachments."))
  })
}

/** List stored blob ids (metadata only — does not load bytes). */
export async function listAttachmentIds(): Promise<string[]> {
  if (isServerBackend) return remote.listAttachmentIds()
  try {
    const keys = await tx<IDBValidKey[]>("readonly", (store) => store.getAllKeys())
    return keys.map((k) => String(k))
  } catch {
    return []
  }
}

/**
 * Create an object URL for previewing/downloading an attachment. The CALLER
 * must revoke it (revokeAttachmentUrl) when done to avoid a memory leak.
 * Returns null when the blob is missing.
 */
export async function getAttachmentUrl(id: string): Promise<string | null> {
  if (isServerBackend) return remote.getAttachmentUrl(id)
  const blob = await getAttachmentBlob(id)
  if (!blob) return null
  return URL.createObjectURL(blob)
}

export function revokeAttachmentUrl(url: string | null | undefined): void {
  if (url) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* already revoked / invalid — ignore */
    }
  }
}

/** Total bytes stored across all attachments (sums metadata sizes, not blobs). */
export async function attachmentStorageUsed(): Promise<number> {
  if (isServerBackend) return remote.attachmentStorageUsed()
  try {
    const records = await tx<StoredBlob[]>("readonly", (store) => store.getAll())
    return records.reduce((sum, r) => sum + (r.size || 0), 0)
  } catch {
    return 0
  }
}

/** Best-effort overall storage estimate from the browser (bytes used / quota). */
export async function browserStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (isServerBackend) return remote.browserStorageEstimate()
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null
  try {
    const est = await navigator.storage.estimate()
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 }
  } catch {
    return null
  }
}

/** Fetch a full stored record (bytes + meta) — used by the ZIP backup writer. */
export async function getAttachmentRecord(
  id: string,
): Promise<{ blob: Blob; name: string; type: string; order_id: string } | null> {
  if (isServerBackend) return remote.getAttachmentRecord(id)
  try {
    const record = (await tx<StoredBlob | undefined>("readonly", (store) => store.get(id))) ?? null
    if (!record) return null
    return { blob: record.blob, name: record.name, type: record.type, order_id: record.order_id }
  } catch {
    return null
  }
}

/** Count of stored attachment blobs. */
export async function attachmentCount(): Promise<number> {
  if (isServerBackend) return remote.attachmentCount()
  try {
    return await tx<number>("readonly", (store) => store.count())
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Backup / restore of the binary layer (base64 envelope — see lib/orders/backup.ts).
// ---------------------------------------------------------------------------

export type AttachmentExport = {
  id: string
  order_id: string
  name: string
  type: string
  /** base64 (no data: prefix). */
  data: string
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

/**
 * Read every stored blob as base64 for inclusion in a full backup. Individual
 * failures are reported (spec: never pretend a backup was complete) rather than
 * aborting the whole export.
 */
export async function exportAllAttachments(): Promise<{ items: AttachmentExport[]; failed: string[] }> {
  if (isServerBackend) return remote.exportAllAttachments()
  const items: AttachmentExport[] = []
  const failed: string[] = []
  let records: StoredBlob[] = []
  try {
    records = await tx<StoredBlob[]>("readonly", (store) => store.getAll())
  } catch {
    return { items, failed }
  }
  for (const r of records) {
    try {
      items.push({ id: r.id, order_id: r.order_id, name: r.name, type: r.type, data: await blobToBase64(r.blob) })
    } catch {
      failed.push(r.name || r.id)
    }
  }
  return { items, failed }
}

/** Restore blobs from a full backup. Returns counts; per-item failures are collected. */
export async function importAttachmentRecords(
  records: AttachmentExport[],
): Promise<{ imported: number; failed: string[] }> {
  if (isServerBackend) return remote.importAttachmentRecords(records)
  let imported = 0
  const failed: string[] = []
  for (const r of records) {
    try {
      const blob = base64ToBlob(r.data, r.type)
      const record: StoredBlob = {
        id: r.id,
        order_id: r.order_id,
        blob,
        size: blob.size,
        name: r.name,
        type: r.type,
        created_at: new Date().toISOString(),
      }
      await tx("readwrite", (store) => store.put(record))
      imported += 1
    } catch {
      failed.push(r.name || r.id)
    }
  }
  return { imported, failed }
}

export const ATTACHMENT_DB_NAME = DB_NAME
