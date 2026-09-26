import { nextTick } from "vue"
import { createRouter, createWebHistory } from "vue-router"
import { holdPage } from "./lib/page-busy.js"
import HomePage from "./pages/HomePage.vue"
import CatalogPage from "./pages/CatalogPage.vue"
import ProductPage from "./pages/ProductPage.vue"
import GroupPage from "./pages/GroupPage.vue"
import GroupsPage from "./pages/GroupsPage.vue"
import CheckoutPage from "./pages/CheckoutPage.vue"
import CheckoutSuccessPage from "./pages/CheckoutSuccessPage.vue"
import LegalPage from "./pages/LegalPage.vue"
import CustomOrderPage from "./pages/CustomOrderPage.vue"
import OrderPage from "./pages/OrderPage.vue"
import { SHOP_DESCRIPTION, SHOP_NAME } from "./lib/seo.js"
import { applyShopSeo } from "./lib/seo-head.js"

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: HomePage,
      meta: { seo: { title: SHOP_NAME, description: SHOP_DESCRIPTION } },
    },
    {
      path: "/products",
      component: CatalogPage,
      meta: {
        seo: {
          title: "Товары",
          description: "Каталог фигурок PrintO.studio.",
        },
      },
    },
    {
      path: "/p/:handle",
      component: ProductPage,
      meta: { seo: { title: "Товар", ogType: "product" } },
    },
    { path: "/groups", redirect: "/collections" },
    { path: "/g/:id", redirect: (to) => `/collections/${to.params.id}` },
    {
      path: "/collections",
      component: GroupsPage,
      meta: {
        seo: {
          title: "Коллекции",
          description: "Коллекции фигурок PrintO.studio.",
        },
      },
    },
    {
      path: "/collections/:id",
      component: GroupPage,
      meta: { seo: { title: "Коллекция" } },
    },
    {
      path: "/custom-order",
      component: CustomOrderPage,
      meta: {
        seo: {
          title: "Индивидуальный заказ",
          description: "Своя фигурка или правки под ваш запрос.",
        },
      },
    },
    {
      path: "/order/:number",
      component: OrderPage,
      meta: { seo: { title: "Заказ", robots: "noindex, nofollow" } },
    },
    {
      path: "/order",
      component: OrderPage,
      meta: { seo: { title: "Заказ", robots: "noindex, nofollow" } },
    },
    {
      path: "/custom-order/pay/:token/success",
      component: CheckoutSuccessPage,
      meta: { seo: { title: "Оплата", robots: "noindex, nofollow" } },
    },
    {
      path: "/custom-order/pay/:token",
      component: CheckoutPage,
      meta: { seo: { title: "Оплата", robots: "noindex, nofollow" } },
    },
    {
      path: "/checkout",
      component: CheckoutPage,
      meta: { seo: { title: "Оформление", robots: "noindex, nofollow" } },
    },
    {
      path: "/checkout/success",
      component: CheckoutSuccessPage,
      meta: { seo: { title: "Оплата", robots: "noindex, nofollow" } },
    },
    {
      path: "/checkout/fail",
      component: LegalPage,
      props: {
        title: "Оплата не прошла",
        body: "Платёж не завершён. Можно вернуться в корзину и попробовать снова.",
      },
      meta: { seo: { title: "Оплата не прошла", robots: "noindex, nofollow" } },
    },
    {
      path: "/delivery",
      component: LegalPage,
      meta: { seo: { title: "Доставка" } },
    },
    {
      path: "/returns",
      component: LegalPage,
      meta: { seo: { title: "Возврат" } },
    },
    {
      path: "/offer",
      component: LegalPage,
      meta: { seo: { title: "Оферта" } },
    },
    {
      path: "/contacts",
      component: LegalPage,
      meta: { seo: { title: "Контакты" } },
    },
    {
      path: "/privacy",
      component: LegalPage,
      meta: { seo: { title: "Конфиденциальность" } },
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

let releaseNav = null

router.beforeEach(() => {
  releaseNav?.()
  releaseNav = holdPage()
})

router.afterEach(() => {
  const release = releaseNav
  releaseNav = null
  nextTick(() => release?.())
})

router.afterEach((to) => {
  const seo = to.meta?.seo || {}
  applyShopSeo({
    path: to.path,
    query: to.query,
    title: seo.title || SHOP_NAME,
    description: seo.description,
    robots: seo.robots,
    ogType: seo.ogType,
    crumbs: [{ name: SHOP_NAME, path: "/" }],
  })
})
