// Server-side binary attachment storage for the shared backend. The bytes live
// on the host's disk under data/attachments/ (override with ATTACHMENTS_PATH),
// with a small JSON sidecar per file for metadata. This is the server-mode
// counterpart to the browser's IndexedDB store (lib/attachment-store.ts) — so
// files uploaded by one person are downloadable by everyone.
//
// Server-only: imported exclusively by the /api/attachments route handlers.

import { mkdir, writeFile, readFile, unlink, readdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { resolve, join } from "node:path"

export type AttachmentMeta = {
  id: string
  order_id: string
  name: string
  type: string
  size: number
  created_at: string
}

function baseDir(): string {
  return process.env.ATTACHMENTS_PATH
    ? resolve(process.env.ATTACHMENTS_PATH)
    : resolve(process.cwd(), "data", "attachments")
}

// Attachment ids are app-generated UUIDs; validate before using in a path so a
// crafted id can't escape the directory.
function safeId(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Invalid attachment id: ${id}`)
  return id
}

function binPath(id: string): string {
  return join(baseDir(), `${safeId(id)}.bin`)
}
function metaPath(id: string): string {
  return join(baseDir(), `${safeId(id)}.json`)
}

async function ensureDir(): Promise<void> {
  await mkdir(baseDir(), { recursive: true })
}

export async function saveBlob(meta: Omit<AttachmentMeta, "size" | "created_at"> & { created_at?: string }, bytes: Uint8Array): Promise<void> {
  await ensureDir()
  const full: AttachmentMeta = {
    id: meta.id,
    order_id: meta.order_id,
    name: meta.name,
    type: meta.type || "application/octet-stream",
    size: bytes.byteLength,
    created_at: meta.created_at ?? new Date().toISOString(),
  }
  await writeFile(binPath(meta.id), bytes)
  await writeFile(metaPath(meta.id), JSON.stringify(full))
}

export async function getBlob(id: string): Promise<{ meta: AttachmentMeta; bytes: Buffer } | null> {
  try {
    if (!existsSync(binPath(id))) return null
    const [bytes, metaRaw] = await Promise.all([readFile(binPath(id)), readFile(metaPath(id), "utf8")])
    return { meta: JSON.parse(metaRaw) as AttachmentMeta, bytes }
  } catch {
    return null
  }
}

export async function getMeta(id: string): Promise<AttachmentMeta | null> {
  try {
    return JSON.parse(await readFile(metaPath(id), "utf8")) as AttachmentMeta
  } catch {
    return null
  }
}

export async function deleteBlob(id: string): Promise<void> {
  await Promise.allSettled([unlink(binPath(id)), unlink(metaPath(id))])
}

export async function listMeta(): Promise<AttachmentMeta[]> {
  await ensureDir()
  let files: string[]
  try {
    files = await readdir(baseDir())
  } catch {
    return []
  }
  const metas: AttachmentMeta[] = []
  for (const f of files) {
    if (!f.endsWith(".json")) continue
    try {
      metas.push(JSON.parse(await readFile(join(baseDir(), f), "utf8")) as AttachmentMeta)
    } catch {
      /* skip unreadable sidecar */
    }
  }
  return metas
}

export async function deleteForOrder(orderId: string): Promise<number> {
  const metas = await listMeta()
  let removed = 0
  for (const m of metas) {
    if (m.order_id === orderId) {
      await deleteBlob(m.id)
      removed += 1
    }
  }
  return removed
}
