import { reactive } from "vue"
import { BACKEND_URL, storeHeaders } from "./sdk.js"

export const shopState = reactive({
  closed: false,
  message: "Магазин в разработке.",
  ordersClosed: false,
  ordersMessage: "Заказы временно недоступны.",
  ozonConfigured: false,
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
}
