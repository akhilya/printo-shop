import { BACKEND_URL, storeHeaders } from "./sdk.js"
import { shopState } from "./shop.js"

const KEY = "shop_visitor"
const SOURCE_KEY = "shop_visit_source"
const VIEW_GAP_MS = 1500

let started = false
let shopReady = false
let pendingPath = ""
let lastViewPath = ""
let lastViewAt = 0

function visitorId() {
  try {
    const saved = localStorage.getItem(KEY) || ""
    if (/^[a-f0-9]{32}$/.test(saved)) return saved
    const next = crypto.randomUUID().replace(/-/g, "")
    localStorage.setItem(KEY, next)
    return next
  } catch {
    return ""
  }
}

function sourceHost() {
  try {
    const saved = sessionStorage.getItem(SOURCE_KEY)
    if (saved != null) return saved
    let host = ""
    const ref = document.referrer
    if (ref) {
      const next = new URL(ref).hostname.replace(/^www\./, "").toLowerCase()
      const here = location.hostname.replace(/^www\./, "").toLowerCase()
      if (next && next !== here) host = next.slice(0, 80)
    }
    sessionStorage.setItem(SOURCE_KEY, host)
    return host
  } catch {
    return ""
  }
}

function rememberShopLink(path) {
  try {
    sessionStorage.setItem(SOURCE_KEY, path)
  } catch {
    // A missed source must not affect the page.
  }
}

function isShopLink(path) {
  const link = String(shopState.redirectPath || "")
  return Boolean(link && path === link)
}

function send(kind, path) {
  const visitor = visitorId()
  if (!visitor || !path) return
  const body = { visitor, path, kind }
  if (kind === "view") body.source = sourceHost()
  try {
    void fetch(`${BACKEND_URL}/store/shop-analytics`, {
      method: "POST",
      headers: {
        ...storeHeaders(),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      keepalive: true,
    })
  } catch {
    // A missed visit must not affect the page.
  }
}

function sendView(path, force = false) {
  const now = Date.now()
  if (!force && path === lastViewPath && now - lastViewAt < VIEW_GAP_MS) return
  lastViewPath = path
  lastViewAt = now
  send("view", path)
}

export function recordPageView(path) {
  const next = String(path || "")
  if (!next.startsWith("/")) return
  if (!shopReady) {
    pendingPath = next
    return
  }
  if (isShopLink(next)) rememberShopLink(next)
  sendView(next)
}

export function recordShopLinkVisit(path) {
  const next = String(path || "")
  if (!next.startsWith("/")) return
  rememberShopLink(next)
  if (pendingPath === next) pendingPath = ""
  sendView(next, true)
}

export function shopAnalyticsReady() {
  shopReady = true
  if (!pendingPath) return
  const path = pendingPath
  pendingPath = ""
  recordPageView(path)
}

export function recordCartAdd() {
  send("cart", window.location.pathname || "/")
}

export function startShopAnalytics() {
  if (started || typeof window === "undefined") return
  started = true
  const beat = () => {
    if (document.visibilityState === "hidden") return
    send("beat", window.location.pathname || "/")
  }
  beat()
  window.setInterval(beat, 45_000)
  document.addEventListener("visibilitychange", beat)
}
