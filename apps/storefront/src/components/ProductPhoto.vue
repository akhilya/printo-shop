<script setup>
import { nextTick, ref, watch } from "vue"

const props = defineProps({
  src: { type: String, default: "" },
  alt: { type: String, default: "" },
  eager: { type: Boolean, default: false },
  fetchpriority: { type: String, default: "" },
})

const loaded = ref(false)
const failed = ref(false)
const img = ref(null)

function markLoaded() {
  loaded.value = true
  failed.value = false
}

function markFailed() {
  loaded.value = true
  failed.value = true
}

async function sync() {
  loaded.value = false
  failed.value = false
  await nextTick()
  if (!props.src) return
  if (img.value?.complete) {
    if (img.value.naturalWidth) markLoaded()
    else markFailed()
  }
}

watch(() => props.src, sync, { immediate: true })
</script>

<template>
  <div
    class="photo"
    :data-loaded="loaded ? 'true' : 'false'"
    :data-empty="!src || failed ? 'true' : 'false'"
  >
    <span v-if="!src || failed" class="matte-empty">Нет фото</span>
    <template v-else>
      <span v-if="!loaded" class="photo-wait" aria-hidden="true" />
      <img
        ref="img"
        class="photo-fit"
        :src="src"
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
