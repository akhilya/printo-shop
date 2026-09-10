import { createHash } from "node:crypto"

const SKIP_KEYS = new Set(["Token", "token"])

export function signTbankPayload(
  payload: Record<string, unknown>,
  password: string
): string {
  const pairs: { key: string; value: string }[] = [
    { key: "Password", value: password },
  ]

  for (const [key, value] of Object.entries(payload)) {
    if (SKIP_KEYS.has(key)) {
      continue
    }
    if (value == null) {
      continue
    }
    if (typeof value === "object") {
      continue
    }
    pairs.push({ key, value: String(value) })
  }

  pairs.sort((a, b) => a.key.localeCompare(b.key))
  const concatenated = pairs.map((p) => p.value).join("")
  return createHash("sha256").update(concatenated, "utf8").digest("hex")
}

export function verifyTbankToken(
  payload: Record<string, unknown>,
  password: string
): boolean {
  const incoming = payload.Token ?? payload.token
  if (typeof incoming !== "string" || !incoming) {
    return false
  }
  const expected = signTbankPayload(payload, password)
  return timingSafeEqual(incoming, expected)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}
