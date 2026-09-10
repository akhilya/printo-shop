import { createRouter, createWebHistory } from "vue-router"
import HomePage from "./pages/HomePage.vue"
import CatalogPage from "./pages/CatalogPage.vue"
import ProductPage from "./pages/ProductPage.vue"
import GroupPage from "./pages/GroupPage.vue"
import GroupsPage from "./pages/GroupsPage.vue"
import CheckoutPage from "./pages/CheckoutPage.vue"
import LegalPage from "./pages/LegalPage.vue"
import CustomOrderPage from "./pages/CustomOrderPage.vue"

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomePage },
    { path: "/products", component: CatalogPage },
    { path: "/p/:handle", component: ProductPage },
    { path: "/groups", redirect: "/collections" },
    { path: "/g/:id", redirect: (to) => `/collections/${to.params.id}` },
    { path: "/collections", component: GroupsPage },
    { path: "/collections/:id", component: GroupPage },
    { path: "/custom-order", component: CustomOrderPage },
    { path: "/checkout", component: CheckoutPage },
    {
      path: "/checkout/success",
      component: LegalPage,
      props: {
        title: "Заказ оплачен",
        body: "Спасибо. Мы получили оплату и свяжемся по контактам из заказа.",
      },
    },
    {
      path: "/checkout/fail",
      component: LegalPage,
      props: {
        title: "Оплата не прошла",
        body: "Платёж не завершён. Можно вернуться в корзину и попробовать снова.",
      },
    },
    { path: "/delivery", component: LegalPage },
    { path: "/offer", component: LegalPage },
    { path: "/contacts", component: LegalPage },
    { path: "/privacy", component: LegalPage },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})
