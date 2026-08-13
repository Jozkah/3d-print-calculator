// Shared binary-attachment endpoint (server backend). Stores/lists/deletes the
// actual file bytes on the host so every user can see files others uploaded.
//   POST   (multipart: id, order_id, name, type, file) → save bytes
//   GET    ?meta=1                                      → all metadata (id/order/size…)
//   DELETE ?id=<id>       → delete one
//   DELETE ?order_id=<id> → delete all for an order (returns count)
// Byte download/preview is served by /api/attachments/[id].

import { NextResponse } from "next/server"
import { saveBlob, listMeta, deleteBlob, deleteForOrder } from "@/lib/server-db/attachments"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const form = await request.formData()
    const id = String(form.get("id") ?? "")
    const orderId = String(form.get("order_id") ?? "")
    const name = String(form.get("name") ?? "")
    const type = String(form.get("type") ?? "application/octet-stream")
    const file = form.get("file")
    if (!id || !orderId || !(file instanceof Blob)) {
      return NextResponse.json({ error: "id, order_id and file are required" }, { status: 400 })
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    await saveBlob({ id, order_id: orderId, name, type }, bytes)
    return NextResponse.json({ ok: true, size: bytes.byteLength })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to save attachment" }, { status: 500 })
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  if (searchParams.get("meta") !== null) {
    return NextResponse.json({ items: await listMeta() }, { headers: { "Cache-Control": "no-store" } })
  }
  return NextResponse.json({ error: "Specify ?meta=1, or GET /api/attachments/<id> for bytes" }, { status: 400 })
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  const orderId = searchParams.get("order_id")
  try {
    if (id) {
      await deleteBlob(id)
      return NextResponse.json({ ok: true })
    }
    if (orderId) {
      const removed = await deleteForOrder(orderId)
      return NextResponse.json({ ok: true, removed })
    }
    return NextResponse.json({ error: "Specify id or order_id" }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to delete" }, { status: 500 })
  }
}
