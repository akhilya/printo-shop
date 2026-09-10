<script setup>
import { computed, onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"

const props = defineProps({
  title: { type: String, default: "" },
  body: { type: String, default: "" },
})

const STATIC_SLUGS = {
  "/delivery": "delivery",
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
    return
  }
  loading.value = true
  error.value = ""
  try {
    const res = await fetch(
      `${import.meta.env.VITE_MEDUSA_BACKEND_URL}/store/legal-pages/${encodeURIComponent(slug.value)}`,
      {
        headers: {
          "x-publishable-api-key": import.meta.env.VITE_MEDUSA_PUBLISHABLE_KEY,
        },
      }
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
  }
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
