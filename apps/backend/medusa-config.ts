import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
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
              terminalKey: process.env.TBANK_TERMINAL_KEY || "",
              password: process.env.TBANK_PASSWORD || "",
              apiUrl:
                process.env.TBANK_API_URL ||
                "https://rest-api-test.tinkoff.ru/v2",
              successUrl: process.env.TBANK_SUCCESS_URL,
              failUrl: process.env.TBANK_FAIL_URL,
              notificationUrl:
                process.env.TBANK_NOTIFICATION_URL ||
                `${process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"}/hooks/tbank`,
              payType: process.env.TBANK_PAY_TYPE || "O",
            },
          },
        ],
      },
    },
  ],
})
