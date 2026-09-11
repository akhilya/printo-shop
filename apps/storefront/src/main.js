import { createApp } from "vue"
import App from "./app.vue"
import { router } from "./router.js"
import { loadCart } from "./lib/cart.js"
import { loadShopConfig } from "./lib/sdk.js"
import "./style.css"

loadShopConfig()
  .catch(() => {})
  .then(() => loadCart())
  .finally(() => {
    createApp(App).use(router).mount("#app")
  })
