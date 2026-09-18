<script setup>
import { computed, onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { BACKEND_URL, storeHeaders } from "../lib/sdk.js"
import { applyShopSeo } from "../lib/seo-head.js"
import { SHOP_NAME, seoPlainText } from "../lib/seo.js"

const props = defineProps({
  title: { type: String, default: "" },
  body: { type: String, default: "" },
})

const STATIC_SLUGS = {
  "/delivery": "delivery",
  "/returns": "returns",
  "/offer": "offer",
  "/contacts": "contacts",
  "/privacy": "privacy",
}

const route = useRoute()
const loading = ref(false)
const error = ref("")
const page = ref(null)

const isStatic = computed(() => Boolean(props.title && props.body))
const slug = computed(() => STATIC_SLUGS[route.path] || "")

async function load() {
  if (isStatic.value || !slug.value) {
    page.value = null
    error.value = ""
    applyLegalSeo()
    return
  }
  loading.value = true
  error.value = ""
  try {
    const res = await fetch(
      `${BACKEND_URL}/store/legal-pages/${encodeURIComponent(slug.value)}`,
      { headers: storeHeaders() }
    )
    if (!res.ok) {
      error.value = "Страница не найдена"
      page.value = null
      return
    }
    const data = await res.json()
    page.value = data.page || null
  } catch {
    error.value = "Не удалось загрузить страницу"
    page.value = null
  } finally {
    loading.value = false
    applyLegalSeo()
  }
}

function applyLegalSeo() {
  if (isStatic.value) {
    applyShopSeo({
      path: route.path,
      title: props.title,
      description: props.body,
      robots: route.path === "/checkout/fail" ? "noindex, nofollow" : undefined,
      crumbs: [
        { name: SHOP_NAME, path: "/" },
        { name: props.title, path: route.path },
      ],
    })
    return
  }
  if (error.value) {
    applyShopSeo({
      path: route.path,
      title: "Страница не найдена",
      description: "Такой страницы нет.",
      robots: "noindex, follow",
    })
    return
  }
  if (!page.value) return
  applyShopSeo({
    path: route.path,
    title: page.value.title,
    description: seoPlainText(page.value.html || page.value.body || page.value.title),
    crumbs: [
      { name: SHOP_NAME, path: "/" },
      { name: page.value.title, path: route.path },
    ],
  })
}

onMounted(load)
watch(() => route.path, load)
</script>

<template>
  <article class="legal">
    <template v-if="isStatic">
      <h1>{{ title }}</h1>
      <p>{{ body }}</p>
    </template>
    <p v-else-if="loading" class="empty">Загрузка</p>
    <p v-else-if="error" class="err">{{ error }}</p>
    <template v-else-if="page">
      <h1>{{ page.title }}</h1>
      <div class="legal-body" v-html="page.html" />
    </template>
  </article>
</template>
