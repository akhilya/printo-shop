import { createApp } from "vue"
import App from "./app.vue"
import { router } from "./router.js"
import { loadShopConfig } from "./lib/sdk.js"
import "./style.css"

loadShopConfig()
  .catch(() => {})
  .finally(() => {
    createApp(App).use(router).mount("#app")
  })
