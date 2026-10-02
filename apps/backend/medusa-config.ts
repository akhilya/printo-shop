import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

function databaseUrl() {
  const password = process.env.POSTGRES_PASSWORD
  if (password) {
    const user = encodeURIComponent(process.env.POSTGRES_USER || "medusa")
    const pass = encodeURIComponent(password)
    const db = encodeURIComponent(process.env.POSTGRES_DB || "medusa")
    const host = process.env.POSTGRES_HOST || "printo-pg"
    return `postgres://${user}:${pass}@${host}:5432/${db}`
  }
  return process.env.DATABASE_URL
}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: databaseUrl(),
    databaseDriverOptions: {
      connection: {
        ssl: false,
      },
    },
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    }
  },
  modules: [
    {
      resolve: "./src/modules/reviews",
    },
    {
      resolve: "./src/modules/banner",
    },
    {
      resolve: "./src/modules/custom-order",
    },
    {
      resolve: "./src/modules/legal-page",
    },
    {
      resolve: "./src/modules/blocked-ip",
    },
    {
      resolve: "./src/modules/shop-setting",
    },
    {
      resolve: "./src/modules/shop-event",
    },
    {
      resolve: "./src/modules/shop-analytics",
    },
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              backend_url: `${process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"}/static`,
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/tbank",
            id: "tbank",
            options: {
              terminalKey: "",
              password: "",
            },
          },
        ],
      },
    },
  ],
})
