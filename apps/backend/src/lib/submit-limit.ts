const WINDOW_MS = 15 * 60 * 1000
const MAX_HITS = 3

import { clientIp } from "./client-ip"

const hits = new Map<string, number[]>()

export function clientKey(req: {
  ip?: string
  headers?: Record<string, unknown>
  socket?: { remoteAddress?: string }
}): string {
  return clientIp(req)
}

export function checkSubmitLimit(key: string): { ok: true } | { error: string } {
  const now = Date.now()
  const recent = (hits.get(key) || []).filter((time) => now - time < WINDOW_MS)
  if (recent.length >= MAX_HITS) {
    return { error: "Слишком много заявок. Подождите несколько минут." }
  }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 2000) {
    for (const [entry, times] of hits) {
      const kept = times.filter((time) => now - time < WINDOW_MS)
      if (kept.length) hits.set(entry, kept)
      else hits.delete(entry)
    }
  }
  return { ok: true }
}
