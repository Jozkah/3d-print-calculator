// Full local backup, including binary attachments.
//
// The existing Settings "Export backup" produces a plain `{ table: rows }` JSON
// (lib/seed-import.ts) — now covering the order metadata tables too. That file
// does NOT contain attachment bytes, which live in IndexedDB.
//
// This module adds a versioned envelope that bundles everything — every
// localStorage table AND every attachment blob (base64) — into one JSON file so
// a full backup is genuinely complete. Attachment read/write failures are
// reported per-file rather than silently dropped (spec 39).

import { exportAll, importSeedObject, type SeedImportSummary } from "@/lib/seed-import"
import {
  exportAllAttachments,
  importAttachmentRecords,
  type AttachmentExport,
} from "@/lib/attachment-store"

export const BACKUP_FORMAT = "3dpc-backup"
export const BACKUP_VERSION = 2

export type FullBackup = {
  format: typeof BACKUP_FORMAT
  version: number
  exported_at: string
  /** Table-name -> rows, identical to the plain backup payload. */
  tables: Record<string, unknown>
  attachments: AttachmentExport[]
}

export type BackupBuildResult = {
  backup: FullBackup
  attachmentCount: number
  /** Names of attachments whose bytes could not be read. */
  failed: string[]
}

/** Build a full backup object (tables + attachment blobs). */
export async function buildFullBackup(nowIso: string): Promise<BackupBuildResult> {
  const tables = exportAll()
  const { items, failed } = await exportAllAttachments()
  return {
    backup: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exported_at: nowIso,
      tables,
      attachments: items,
    },
    attachmentCount: items.length,
    failed,
  }
}

export type RestoreResult = {
  tables: SeedImportSummary
  attachments: { imported: number; failed: string[] }
}

function isFullBackup(payload: unknown): payload is FullBackup {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as any).format === BACKUP_FORMAT &&
    typeof (payload as any).tables === "object"
  )
}

/**
 * Restore from either a full backup envelope (tables + attachments) or a plain
 * table-map produced by the legacy export. Table restore replaces per-table
 * (existing seed-import semantics); attachments are merged into IndexedDB.
 */
export async function restoreFromPayload(payload: unknown): Promise<RestoreResult> {
  if (isFullBackup(payload)) {
    const tables = importSeedObject(payload.tables)
    const attachments = Array.isArray(payload.attachments)
      ? await importAttachmentRecords(payload.attachments)
      : { imported: 0, failed: [] }
    return { tables, attachments }
  }
  // Legacy plain `{ table: rows }` file — no attachments in it.
  const tables = importSeedObject(payload)
  return { tables, attachments: { imported: 0, failed: [] } }
}
