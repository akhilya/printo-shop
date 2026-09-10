import { createHash } from "node:crypto"

const WEBP_QUALITY = 80

export function isMedusaHostedUrl(url: string, backendUrl?: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.pathname.startsWith("/static/")) return true
  if (!backendUrl) return false
  try {
    return parsed.host === new URL(backendUrl).host
  } catch {
    return false
  }
}

export function webpFilenameFor(url: string): string {
  const hash = createHash("sha1").update(stripQuery(url)).digest("hex").slice(0, 16)
  return `delegat-${hash}.webp`
}

export function stripQuery(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.search = ""
    parsed.hash = ""
    return parsed.toString()
  } catch {
    return url.split("?")[0] ?? url
  }
}

export type ImageIngestDeps = {
  download: (url: string) => Promise<Buffer>
  convert: (input: Buffer) => Promise<Buffer>
  upload: (filename: string, mimeType: string, content: Buffer) => Promise<string>
  existingUrl?: (filename: string) => string | null | Promise<string | null>
  backendUrl?: string
}

const INGEST_CONCURRENCY = 8

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const out = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, limit), items.length) },
      () => worker()
    )
  )
  return out
}

export async function ingestManyUrls(
  urls: Array<string | null | undefined>,
  deps: ImageIngestDeps,
  concurrency = INGEST_CONCURRENCY
): Promise<Map<string, string>> {
  const unique: string[] = []
  const seen = new Set<string>()
  for (const raw of urls) {
    const url = typeof raw === "string" ? raw.trim() : ""
    if (!url || seen.has(url)) continue
    seen.add(url)
    unique.push(url)
  }

  const hosted = await mapPool(unique, concurrency, async (url) => {
    if (isMedusaHostedUrl(url, deps.backendUrl)) return url
    const filename = webpFilenameFor(url)
    try {
      const existing = deps.existingUrl
        ? await deps.existingUrl(filename)
        : null
      if (existing) return existing
      const downloaded = await deps.download(url)
      const webp = await deps.convert(downloaded)
      return await deps.upload(filename, "image/webp", webp)
    } catch {
      return ""
    }
  })

  const map = new Map<string, string>()
  unique.forEach((url, i) => {
    if (hosted[i]) map.set(url, hosted[i])
  })
  return map
}

export async function ingestImageUrls(
  urls: Array<string | null | undefined>,
  deps: ImageIngestDeps
): Promise<string[]> {
  const map = await ingestManyUrls(urls, deps)
  const out: string[] = []
  for (const raw of urls) {
    const url = typeof raw === "string" ? raw.trim() : ""
    if (!url) continue
    const hosted = map.get(url)
    if (hosted) out.push(hosted)
  }
  return out
}

export { WEBP_QUALITY }
