"use client"

// UV ink catalogue. Every colour carries two prices: the OEM bottle the client
// is always billed at, and the cheaper third-party refill we sometimes load.
// Quotes never bill the refill price — the difference is the operator's margin.

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { AlertTriangle, Check, Wand2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { inkOemPerMl, inkRefillPerMl } from "@/lib/uv-pricing"
import type { UvInk } from "@/types/db"

/** €/ml needs more precision than money formatting gives — ink is pennies per ml. */
const perMl = (value: number, currency: string) => `${currency}${value.toFixed(4)}/ml`

function InkRow({ ink, currency }: { ink: UvInk; currency: string }) {
  const { toast } = useToast()
  const [form, setForm] = useState({
    oem_price: ink.oem_price ? String(ink.oem_price) : "",
    oem_volume_ml: ink.oem_volume_ml ? String(ink.oem_volume_ml) : "",
    refill_price: ink.refill_price != null ? String(ink.refill_price) : "",
    refill_volume_ml: ink.refill_volume_ml != null ? String(ink.refill_volume_ml) : "",
  })

  // Preview from the live form, so the €/ml readout tracks typing instead of
  // waiting for the blur that saves it.
  const preview = {
    color_key: ink.color_key,
    oem_price: Number.parseFloat(form.oem_price) || 0,
    oem_volume_ml: Number.parseFloat(form.oem_volume_ml) || 0,
    refill_price: Number.parseFloat(form.refill_price) || 0,
    refill_volume_ml: Number.parseFloat(form.refill_volume_ml) || 0,
  }

  const persist = async () => {
    const supabase = createClient()
    const { error } = await supabase
      .from("uv_inks")
      .update({
        oem_price: preview.oem_price,
        oem_volume_ml: preview.oem_volume_ml,
        refill_price: form.refill_price === "" ? null : preview.refill_price,
        refill_volume_ml: form.refill_volume_ml === "" ? null : preview.refill_volume_ml,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ink.id)
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" })
  }

  const field = (key: keyof typeof form, label: string, step: string) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min="0"
        step={step}
        className="bg-card"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        onBlur={persist}
      />
    </div>
  )

  return (
    <Card className="p-4 sm:p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <span
          className="size-8 shrink-0 rounded-full border border-border"
          style={{ backgroundColor: ink.hex }}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="font-medium text-foreground">{ink.name}</p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {perMl(inkOemPerMl(preview), currency)} OEM · {perMl(inkRefillPerMl(preview), currency)} refill
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {field("oem_price", `OEM price (${currency})`, "0.01")}
        {field("oem_volume_ml", "OEM volume (ml)", "1")}
        {field("refill_price", `Refill price (${currency})`, "0.01")}
        {field("refill_volume_ml", "Refill volume (ml)", "1")}
      </div>
      {preview.oem_volume_ml <= 0 && (
        <p className="mt-3 text-[11px] text-amber-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Set a volume — this ink is currently priced at {currency}0/ml and costs nothing in quotes.
        </p>
      )}
    </Card>
  )
}

export function UvInksList({ inks, currency = "€" }: { inks: UvInk[]; currency?: string }) {
  const { toast } = useToast()
  const [kitPrice, setKitPrice] = useState("174.99")
  const [kitColours, setKitColours] = useState("6")
  const [kitMl, setKitMl] = useState("100")
  const [applying, setApplying] = useState(false)

  const price = Number.parseFloat(kitPrice) || 0
  const colours = Number.parseInt(kitColours, 10) || 0
  const ml = Number.parseFloat(kitMl) || 0
  const kitPerMl = colours > 0 && ml > 0 ? price / (colours * ml) : 0

  const applyKit = async () => {
    if (price <= 0 || colours <= 0 || ml <= 0) {
      toast({
        title: "Check the kit figures",
        description: "Price, colours and ml must all be above zero.",
        variant: "destructive",
      })
      return
    }
    setApplying(true)
    try {
      const supabase = createClient()
      const perColour = price / colours
      for (const ink of inks) {
        const { error } = await supabase
          .from("uv_inks")
          .update({ oem_price: perColour, oem_volume_ml: ml, updated_at: new Date().toISOString() })
          .eq("id", ink.id)
        if (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" })
          return
        }
      }
      toast({ title: "Kit price applied to all inks", description: perMl(kitPerMl, currency) })
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Fill from kit</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cleaner volume is deliberately left out — dividing the whole kit price by the printing ml only is what
            recovers the cleaner&apos;s cost through the ink you actually sell.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Kit price ({currency})</Label>
            <Input type="number" min="0" step="0.01" className="bg-card" value={kitPrice} onChange={(e) => setKitPrice(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Colours in the kit</Label>
            <Input type="number" min="1" step="1" className="bg-card" value={kitColours} onChange={(e) => setKitColours(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">ml per colour</Label>
            <Input type="number" min="0" step="1" className="bg-card" value={kitMl} onChange={(e) => setKitMl(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={applyKit} disabled={applying} className="shadow-sm">
            {applying ? <Check className="w-4 h-4 mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
            Apply to all inks
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">→ {perMl(kitPerMl, currency)}</span>
        </div>
      </Card>

      {inks.map((ink) => (
        <InkRow key={ink.id} ink={ink} currency={currency} />
      ))}
    </div>
  )
}
