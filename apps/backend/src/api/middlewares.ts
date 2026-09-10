import {
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import { clientIp } from "../lib/client-ip"
import { BLOCKED_MESSAGE, isIpBlocked } from "../lib/ip-block"

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

/**
 * Delegat category export sends the full PIM field schema (select options
 * included). Express json() defaults to 100kb and returns 413 otherwise.
 * Product bulk can also exceed that, so the whole bridge shares this limit.
 */
export default defineMiddlewares({
  routes: [
    {
      matcher: "/store*",
      methods: ["POST", "PUT", "PATCH", "DELETE"],
      middlewares: [rejectBlockedIp],
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
