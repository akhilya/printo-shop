const RESERVED = new Set([
  "products",
  "p",
  "collections",
  "groups",
  "g",
  "custom-order",
  "order",
  "promo",
  "a",
  "checkout",
  "delivery",
  "returns",
  "offer",
  "contacts",
  "privacy",
  "app",
])

export function shopLinkPath(value: unknown): string | null {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`
  const path = withSlash.replace(/\/+$/, "").toLowerCase()
  if (!path || path === "/" || path.length > 64) return null
  if (path.includes("//") || path.includes("..")) return null
  if (!/^\/[a-z0-9][a-z0-9/_-]*$/.test(path)) return null
  const segment = path.split("/")[1]
  if (!segment || RESERVED.has(segment)) return null
  return path
}

export function shopLinkTarget(value: unknown): string | null {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return null
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`
  if (withSlash.includes("..") || withSlash.includes("\\") || withSlash.includes("//")) {
    return null
  }
  const queryAt = withSlash.indexOf("?")
  const pathPart = queryAt === -1 ? withSlash : withSlash.slice(0, queryAt)
  const query = queryAt === -1 ? "" : withSlash.slice(queryAt + 1)
  const path = pathPart.replace(/\/+$/, "") || "/"
  if (/^\/promo(\/|$)/i.test(path)) return null
  if (path !== "/" && !/^\/[a-z0-9][a-z0-9/_-]*$/i.test(path)) return null
  if (query && !/^[a-z0-9=&_%.-]+$/i.test(query)) return null
  return query ? `${path}?${query}` : path
}

export function parseShopLink(body: unknown): {
  path: string | null
  target: string | null
  error: string
} {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const pathRaw = String(rec.path ?? "").trim()
  const targetRaw = String(rec.target ?? "").trim()
  if (!pathRaw && !targetRaw) {
    return { path: null, target: null, error: "" }
  }
  const path = shopLinkPath(pathRaw)
  if (/^\/promo(\/|$)/i.test(targetRaw.startsWith("/") ? targetRaw : `/${targetRaw}`)) {
    return {
      path: null,
      target: null,
      error: "Адрес акции не должен содержать промокод",
    }
  }
  const target = shopLinkTarget(targetRaw)
  if (!path) {
    return {
      path: null,
      target: null,
      error: "Такой путь занят или не подходит",
    }
  }
  if (!target) {
    return {
      path: null,
      target: null,
      error: "Укажите страницу магазина",
    }
  }
  const targetPath = target.split("?")[0]
  if (targetPath === path) {
    return {
      path: null,
      target: null,
      error: "Ссылка не может вести сама на себя",
    }
  }
  return { path, target, error: "" }
}
