import { existsSync } from "node:fs"
import { readFile, readdir, rename, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { SHOP_PHOTO_MAX_EDGE } from "./delegat-bridge/ingest-images-io"
import { WEBP_QUALITY } from "./delegat-bridge/ingest-images"

const PHOTO_EXT = new Set([".webp", ".jpg", ".jpeg", ".png"])

function staticDir() {
  return process.env.MEDUSA_STATIC_DIR || path.join(process.cwd(), "static")
}

function markerPath(dir: string) {
  return path.join(dir, `.shop-photo-max-${SHOP_PHOTO_MAX_EDGE}`)
}

export async function shrinkOversizedStaticPhotos(
  dir = staticDir()
): Promise<{ shrunk: number; skipped: number; failed: number }> {
  if (!existsSync(dir)) return { shrunk: 0, skipped: 0, failed: 0 }
  if (existsSync(markerPath(dir))) return { shrunk: 0, skipped: 0, failed: 0 }

  const names = await readdir(dir)
  let shrunk = 0
  let skipped = 0
  let failed = 0

  for (const name of names) {
    const ext = path.extname(name).toLowerCase()
    if (!PHOTO_EXT.has(ext)) continue
    const file = path.join(dir, name)
    try {
      const info = await stat(file)
      if (!info.isFile()) continue
      const changed = await shrinkFile(file, ext)
      if (changed) shrunk += 1
      else skipped += 1
    } catch {
      failed += 1
    }
  }

  if (!failed) {
    await writeFile(markerPath(dir), String(SHOP_PHOTO_MAX_EDGE))
  }
  return { shrunk, skipped, failed }
}

async function shrinkFile(file: string, ext: string): Promise<boolean> {
  const bytes = await readFile(file)
  const meta = await sharp(bytes, { failOn: "none" }).metadata()
  const width = meta.width || 0
  const height = meta.height || 0
  if (!width || !height) return false
  if (width <= SHOP_PHOTO_MAX_EDGE && height <= SHOP_PHOTO_MAX_EDGE) return false

  let pipeline = sharp(bytes, { failOn: "none" }).rotate().resize({
    width: SHOP_PHOTO_MAX_EDGE,
    height: SHOP_PHOTO_MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  })
  if (ext === ".png") pipeline = pipeline.png()
  else if (ext === ".jpg" || ext === ".jpeg") pipeline = pipeline.jpeg({ quality: WEBP_QUALITY })
  else pipeline = pipeline.webp({ quality: WEBP_QUALITY })

  const next = await pipeline.toBuffer()
  const tmp = `${file}.shrinking`
  await writeFile(tmp, next)
  await rename(tmp, file)
  return true
}
