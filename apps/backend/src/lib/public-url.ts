function firstHeader(
  headers: { [key: string]: string | string[] | undefined } | undefined,
  name: string
): string {
  if (!headers) return ""
  const raw = headers[name] ?? headers[name.toLowerCase()]
  const value = Array.isArray(raw) ? raw[0] : raw
  return String(value || "")
    .split(",")[0]
    .trim()
}

function firstOrigin(cors?: string): string {
  const raw = String(cors || "")
    .split(",")[0]
    .trim()
    .replace(/\/$/, "")
  return /^https?:\/\//i.test(raw) ? raw : ""
}

function isLoopback(host: string) {
  const name = host.replace(/:\d+$/, "").toLowerCase()
  return (
    name === "localhost" ||
    name === "127.0.0.1" ||
    name === "::1" ||
    name === "0.0.0.0"
  )
}

function stripDefaultPort(host: string) {
  return host.replace(/:443$/, "").replace(/:80$/, "")
}

export function publicBackendUrl(
  req?: {
    headers?: { [key: string]: string | string[] | undefined }
    protocol?: string
  },
  env: NodeJS.ProcessEnv = process.env
): string {
  const host = stripDefaultPort(
    firstHeader(req?.headers, "x-forwarded-host") ||
      firstHeader(req?.headers, "host")
  )
  const proto = (
    firstHeader(req?.headers, "x-forwarded-proto") ||
    req?.protocol ||
    "https"
  ).replace(/:$/, "")
  if (host && !isLoopback(host)) {
    const scheme = proto === "http" ? "http" : "https"
    return `${scheme}://${host}`
  }

  const apiHost = String(env.API_HOST || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
  if (apiHost && !isLoopback(apiHost)) {
    return `https://${apiHost}`
  }

  const fromEnv = String(env.MEDUSA_BACKEND_URL || "").replace(/\/$/, "")
  if (fromEnv) return fromEnv

  const admin = firstOrigin(env.ADMIN_CORS)
  if (admin) return admin

  return "http://localhost:9000"
}
