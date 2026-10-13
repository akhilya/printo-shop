import { reactive } from "vue"
import { BACKEND_URL, storeHeaders } from "./sdk.js"

export const shopState = reactive({
  closed: false,
  message: "Магазин в разработке.",
  ordersClosed: false,
  ordersMessage: "Заказы временно недоступны.",
  ozonConfigured: false,
  ozonQuoteMode: "ozon",
  ozonFixedAmount: 0,
  redirectPath: "",
  redirectTarget: "",
  customOrderChannels: ["telegram", "max"],
})

export async function loadShopStatus() {
  const res = await fetch(`${BACKEND_URL}/store/shop-status`, {
    headers: storeHeaders(),
  })
  if (!res.ok) return
  const data = await res.json()
  shopState.closed = data.shop?.closed === true
  if (data.shop?.message) shopState.message = data.shop.message
  shopState.ordersClosed = data.shop?.orders_closed === true
  if (data.shop?.orders_message) {
    shopState.ordersMessage = data.shop.orders_message
  }
  shopState.ozonConfigured = data.shop?.ozon_configured === true
  shopState.ozonQuoteMode =
    data.shop?.ozon_quote_mode === "fixed" ? "fixed" : "ozon"
  const fixed = Number(data.shop?.ozon_fixed_amount)
  shopState.ozonFixedAmount =
    Number.isFinite(fixed) && fixed > 0 ? Math.round(fixed) : 0
  shopState.redirectPath = String(data.shop?.redirect_path || "")
  shopState.redirectTarget = String(data.shop?.redirect_target || "")
  if (Array.isArray(data.shop?.custom_order_channels)) {
    shopState.customOrderChannels = data.shop.custom_order_channels.filter(
      (id) => id === "telegram" || id === "max"
    )
  }
}
