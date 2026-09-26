<script setup>
import { nextTick, ref, watch } from "vue"

const props = defineProps({
  src: { type: String, default: "" },
  alt: { type: String, default: "" },
  imgClass: { type: String, default: "" },
})

const loaded = ref(false)
const img = ref(null)

function settle() {
  const node = img.value
  if (!node?.complete) return
  loaded.value = true
}

async function sync() {
  loaded.value = false
  await nextTick()
  settle()
}

watch(() => props.src, sync, { immediate: true })
</script>

<template>
  <span class="img-wait" :data-loaded="loaded ? 'true' : 'false'">
    <span v-if="!loaded" class="photo-wait" aria-hidden="true" />
    <img
      ref="img"
      :class="imgClass"
      :src="src"
      :alt="alt"
      @load="loaded = true"
      @error="loaded = true"
    />
  </span>
</template>
