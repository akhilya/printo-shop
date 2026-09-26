import { existsSync, readdirSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { MedusaContainer } from "@medusajs/framework"
import sharp from "sharp"
import {
  type ImageIngestDeps,
  WEBP_QUALITY,
} from "./ingest-images"

export async function downloadUrl(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`image download ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

/** Longest side of a shop photo. 1600×2134 is heavier than the gallery needs. */
export const SHOP_PHOTO_MAX_EDGE = 1280

/**
 * WebP for storage. Fits inside 1280×1280, keeps aspect ratio, does not enlarge.
 */
export function convertToWebp(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({
      width: SHOP_PHOTO_MAX_EDGE,
      height: SHOP_PHOTO_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer()
}

function staticDir() {
  return process.env.MEDUSA_STATIC_DIR || path.join(process.cwd(), "static")
}

function publicUrl(backendUrl: string, filename: string) {
  return `${backendUrl.replace(/\/$/, "")}/static/${filename}`
}

const HASH_FILE = /delegat-[a-f0-9]{16}\.webp$/i

function indexExistingDelegatFiles(backendUrl: string): Map<string, string> {
  const dir = staticDir()
  const found = new Map<string, string>()
  if (!existsSync(dir)) return found
  for (const name of readdirSync(dir)) {
    const match = name.match(HASH_FILE)
    if (!match) continue
    if (!found.has(match[0])) found.set(match[0], publicUrl(backendUrl, name))
  }
  return found
}

export function ingestDepsFromContainer(
  _container: MedusaContainer
): ImageIngestDeps {
  const backendUrl =
    process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
  const existing = indexExistingDelegatFiles(backendUrl)

  return {
    backendUrl,
    download: downloadUrl,
    convert: convertToWebp,
    existingUrl: (filename) => existing.get(filename) ?? null,
    upload: async (filename, _mimeType, content) => {
      const dir = staticDir()
      await mkdir(dir, { recursive: true })
      await writeFile(path.join(dir, filename), content)
      const url = publicUrl(backendUrl, filename)
      existing.set(filename, url)
      return url
    },
  }
}
