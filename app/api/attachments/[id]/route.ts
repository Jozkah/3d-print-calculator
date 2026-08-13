// Streams a single attachment's bytes for preview/download. GET only.
// 404 when the file is missing. order_id is echoed in a header so the backup
// exporter can reconstruct records from the byte response.

import { getBlob } from "@/lib/server-db/attachments"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params
  const record = await getBlob(id)
  if (!record) return new Response("Not found", { status: 404 })

  const { meta, bytes } = record
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": meta.type || "application/octet-stream",
      "Content-Length": String(meta.size),
      "Content-Disposition": `inline; filename="${encodeURIComponent(meta.name)}"`,
      "X-Order-Id": meta.order_id,
      "X-Attachment-Name": encodeURIComponent(meta.name),
      "Cache-Control": "no-store",
    },
  })
}
