// One-shot fetch of Bambu Lab printer cutout renders into public/printers/.
// Run: node scripts/fetch-printer-images.mjs
import { writeFile, mkdir } from "node:fs/promises"
import path from "node:path"

const IMAGES = {
  "a1-mini": "https://portal.bblmw.com/compare/A1mini.png",
  "a1": "https://portal.bblmw.com/compare/A1.png",
  "p1s": "https://portal.bblmw.com/compare/P1S.png",
  "p2s": "https://portal.bblmw.com/compare/P2S-qw75b7il1t.png",
  "x1c": "https://portal.bblmw.com/compare/X1C-zbpu2eltq5.png",
  "x2d": "https://portal.bblmw.com/compare/X2D-zbpu2eltq5.png",
  "h2d": "https://portal.bblmw.com/compare/H2D-139c8d33e2ed.png",
  "h2s": "https://portal.bblmw.com/compare/H2S-mimdn0opvna.png",
  "h2c": "https://portal.bblmw.com/compare/h2c-h2e4s63566c.png",
  "a2l": "https://portal.bblmw.com/compare/a2l-hl38wbwrmum.png",
}

const outDir = path.join(process.cwd(), "public", "printers")
await mkdir(outDir, { recursive: true })

for (const [slug, url] of Object.entries(IMAGES)) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status} from ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(path.join(outDir, `${slug}.png`), buf)
  console.log(`saved ${slug}.png (${(buf.length / 1024).toFixed(0)} KB)`)
}
