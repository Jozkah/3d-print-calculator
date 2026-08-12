"use client"

import { useState } from "react"
import { Pin, PinOff, Trash2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { OrderNote } from "@/types/orders"
import { addNote, updateNote, deleteNote } from "@/lib/orders/data"

function timeAgo(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function OrderNotesPanel({ orderId, notes, onChanged }: { orderId: string; notes: OrderNote[]; onChanged: () => void }) {
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)

  const pinned = notes.filter((n) => n.pinned)
  const rest = notes.filter((n) => !n.pinned)

  async function submit() {
    if (!draft.trim()) return
    setSaving(true)
    try {
      await addNote(orderId, draft.trim())
      setDraft("")
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="border-b border-border/70 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Internal notes</h3>
      </header>

      <div className="space-y-2 p-4">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Add a note — matte black, logo faces left, call before starting…"
          className="bg-card"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit()
          }}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={saving || !draft.trim()}>
            <Plus className="size-4" />
            Add note
          </Button>
        </div>
      </div>

      {(pinned.length > 0 || rest.length > 0) && (
        <div className="space-y-2 px-4 pb-4">
          {pinned.map((n) => (
            <NoteCard key={n.id} note={n} onChanged={onChanged} pinned />
          ))}
          {rest.map((n) => (
            <NoteCard key={n.id} note={n} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  )
}

function NoteCard({ note, onChanged, pinned }: { note: OrderNote; onChanged: () => void; pinned?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note.content)

  async function save() {
    await updateNote(note.id, { content: text.trim() })
    setEditing(false)
    onChanged()
  }

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        pinned ? "border-amber-500/30 bg-amber-500/5" : "border-border/70 bg-background",
      )}
    >
      {editing ? (
        <div className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="bg-card" autoFocus />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm text-foreground" onDoubleClick={() => setEditing(true)}>
            {note.content}
          </p>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{timeAgo(note.created_at)}</span>
            <div className="flex items-center gap-0.5">
              <Button
                size="icon-sm"
                variant="ghost"
                title={pinned ? "Unpin" : "Pin"}
                onClick={async () => {
                  await updateNote(note.id, { pinned: !note.pinned })
                  onChanged()
                }}
              >
                {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                title="Delete"
                onClick={async () => {
                  await deleteNote(note.id)
                  onChanged()
                }}
              >
                <Trash2 className="size-3.5 text-red-500" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
