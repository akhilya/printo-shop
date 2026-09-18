import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import { fileURLToPath, URL } from "node:url"

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 8000,
    strictPort: true,
    proxy: {
      "/sitemap.xml": {
        target: process.env.VITE_MEDUSA_BACKEND_URL || "http://localhost:9000",
        changeOrigin: true,
        rewrite: () => "/store/shop-sitemap",
      },
      "/llms.txt": {
        target: process.env.VITE_MEDUSA_BACKEND_URL || "http://localhost:9000",
        changeOrigin: true,
        rewrite: () => "/store/shop-llms",
      },
      "/llms-full.txt": {
        target: process.env.VITE_MEDUSA_BACKEND_URL || "http://localhost:9000",
        changeOrigin: true,
        rewrite: () => "/store/shop-llms-full",
      },
      "/llm.json": {
        target: process.env.VITE_MEDUSA_BACKEND_URL || "http://localhost:9000",
        changeOrigin: true,
        rewrite: () => "/store/shop-llm-json",
      },
    },
  },
})
