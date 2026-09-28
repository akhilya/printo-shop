<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { shopPhotoSrc } from "../lib/photo-url.js"
import WaitIcon from "./WaitIcon.vue"

const props = defineProps({
  src: { type: String, default: "" },
  alt: { type: String, default: "" },
  eager: { type: Boolean, default: false },
  fetchpriority: { type: String, default: "" },
  fill: { type: Boolean, default: false },
})

const photoSrc = computed(() => shopPhotoSrc(props.src))
const loaded = ref(false)
const failed = ref(false)
const shown = ref(false)
const img = ref(null)
const host = ref(null)
let observer = null

function markLoaded() {
  loaded.value = true
  failed.value = false
}

function markFailed() {
  loaded.value = true
  failed.value = true
}

function stopObserve() {
  observer?.disconnect()
  observer = null
}

function scrollRoot(el) {
  let node = el?.parentElement
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node)
    const overflow = `${style.overflow} ${style.overflowX} ${style.overflowY}`
    if (/(auto|scroll|overlay)/.test(overflow)) return node
    node = node.parentElement
  }
  return null
}

function reveal() {
  shown.value = true
  stopObserve()
  nextTick(() => {
    if (img.value?.complete) {
      if (img.value.naturalWidth) markLoaded()
      else markFailed()
    }
  })
}

function observe() {
  stopObserve()
  if (!props.src) {
    shown.value = false
    return
  }
  if (props.eager) {
    shown.value = true
    return
  }
  const el = host.value
  if (!el) {
    shown.value = false
    return
  }
  if (typeof IntersectionObserver !== "function") {
    shown.value = true
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) reveal()
    },
    { root: scrollRoot(el), rootMargin: "80px" }
  )
  observer.observe(el)
}

async function sync() {
  loaded.value = false
  failed.value = false
  observe()
  await nextTick()
  if (!props.src || !shown.value) return
  if (img.value?.complete) {
    if (img.value.naturalWidth) markLoaded()
    else markFailed()
  }
}

watch(() => [props.src, props.eager], sync)
onMounted(sync)
onBeforeUnmount(stopObserve)
</script>

<template>
  <div
    ref="host"
    class="photo"
    :data-loaded="loaded ? 'true' : 'false'"
    :data-empty="!src || failed ? 'true' : 'false'"
  >
    <span v-if="!src || failed" class="matte-empty">Нет фото</span>
    <template v-else>
      <span v-if="!loaded" class="photo-wait" aria-hidden="true"><WaitIcon /></span>
      <img
        v-if="shown && fill"
        class="photo-fill"
        :src="photoSrc"
        alt=""
        aria-hidden="true"
      />
      <img
        v-if="shown"
        ref="img"
        class="photo-fit"
        :src="photoSrc"
        :alt="alt"
        :loading="eager ? 'eager' : 'lazy'"
        :fetchpriority="fetchpriority || (eager ? 'high' : undefined)"
        decoding="async"
        @load="markLoaded"
        @error="markFailed"
      />
    </template>
  </div>
</template>
