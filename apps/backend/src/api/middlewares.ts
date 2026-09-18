import {
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import { clientIp } from "../lib/client-ip"
import { BLOCKED_MESSAGE, isIpBlocked } from "../lib/ip-block"
import { isOrderWritePath } from "../lib/shop-orders"
import {
  DEFAULT_ORDERS_MESSAGE,
  getShopSetting,
} from "../lib/shop-setting"
import { stripStoreDelegatFields } from "../lib/shop-store-category"
import { applyStoreCors } from "../lib/store-cors"

async function rejectBlockedIp(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    const blocked = await isIpBlocked(req.scope, clientIp(req))
    if (blocked) {
      res.status(403).json({ message: BLOCKED_MESSAGE })
      return
    }
  } catch {
    // If the blocklist module is unavailable, do not lock the store.
  }
  next()
}

async function warmShopSettings(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  if (req.method === "OPTIONS") {
    next()
    return
  }
  try {
    await getShopSetting(req.scope)
  } catch {
    // Settings load is best-effort for payment and the closed storefront.
  }
  next()
}

function stripStoreCategoryDictionaries(
  _req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const sendJson = res.json.bind(res)
  res.json = ((body: unknown) =>
    sendJson(stripStoreDelegatFields(body))) as typeof res.json
  next()
}

async function rejectClosedOrders(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  if (!isOrderWritePath(req.method, String(req.originalUrl || req.url || ""))) {
    next()
    return
  }
  try {
    const row = (await getShopSetting(req.scope)) as unknown as Record<
      string,
      unknown
    >
    if (row.orders_closed === true) {
      const message =
        String(row.orders_message || "").trim() || DEFAULT_ORDERS_MESSAGE
      res.status(403).json({ message })
      return
    }
  } catch {
    // If settings are unavailable, do not block checkout.
  }
  next()
}

/**
 * Delegat category export sends the full PIM field schema (select options
 * included). Express json() defaults to 100kb and returns 413 otherwise.
 * Product bulk can also exceed that, so the whole bridge shares this limit.
 */
export default defineMiddlewares({
  routes: [
    {
      matcher: "/store*",
      methods: ["OPTIONS"],
      middlewares: [applyStoreCors],
    },
    {
      matcher: "/store*",
      middlewares: [warmShopSettings, stripStoreCategoryDictionaries],
    },
    {
      matcher: "/store*",
      methods: ["POST", "PUT", "PATCH", "DELETE"],
      middlewares: [rejectBlockedIp, rejectClosedOrders],
    },
    {
      matcher: "/hooks/tbank",
      methods: ["POST"],
      middlewares: [warmShopSettings],
    },
    {
      matcher: "/hooks/storefront-config",
      methods: ["GET", "OPTIONS", "HEAD"],
      middlewares: [applyStoreCors],
    },
    {
      matcher: "/hooks/shop-*",
      methods: ["GET", "OPTIONS", "HEAD"],
      middlewares: [applyStoreCors],
    },
    {
      matcher: "/admin/delegat*",
      methods: ["POST"],
      bodyParser: {
        sizeLimit: "20mb",
      },
    },
    {
      matcher: "/store/reviews",
      methods: ["POST"],
      bodyParser: {
        sizeLimit: "40mb",
      },
    },
    {
      matcher: "/store/custom-orders",
      methods: ["POST"],
      bodyParser: {
        sizeLimit: "18mb",
      },
    },
    {
      matcher: "/admin/legal-pages*",
      methods: ["POST"],
      bodyParser: {
        sizeLimit: "200kb",
      },
    },
  ],
})
