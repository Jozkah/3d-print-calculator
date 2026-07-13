// One-shot fetch of filament brand logos (via Google's favicon service)
// into public/brands/. Run: node scripts/fetch-brand-logos.mjs
import { writeFile, mkdir } from "node:fs/promises"
import path from "node:path"

const BRANDS = {
  "bambu-lab": "bambulab.com",
  "prusament": "prusa3d.com",
  "esun": "esun3d.com",
  "polymaker": "polymaker.com",
  "sunlu": "sunlu.com",
  "overture": "overture3d.com",
  "hatchbox": "hatchbox3d.com",
  "creality": "creality.com",
  "anycubic": "anycubic.com",
  "elegoo": "elegoo.com",
  "eryone": "eryone.com",
  "colorfabb": "colorfabb.com",
  "fillamentum": "fillamentum.com",
  "formfutura": "formfutura.com",
  "fiberlogy": "fiberlogy.com",
  "spectrum": "spectrumfilaments.com",
  "devil-design": "devildesign.com",
  "kingroon": "kingroon.com",
}

const outDir = path.join(process.cwd(), "public", "brands")
await mkdir(outDir, { recursive: true })

for (const [slug, domain] of Object.entries(BRANDS)) {
  const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    await writeFile(path.join(outDir, `${slug}.png`), buf)
    console.log(`saved ${slug}.png (${buf.length} bytes)`)
  } catch (err) {
    console.error(`FAILED ${slug}: ${err.message}`)
  }
}
