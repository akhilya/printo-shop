<script setup>
import { computed } from "vue"
import ProductPhoto from "./ProductPhoto.vue"
import { ruFigures } from "../lib/sdk.js"

const PAGE_COUNT = 4

const props = defineProps({
  group: { type: Object, required: true },
})

const pages = computed(() => {
  const photos = (props.group.images || []).slice(0, PAGE_COUNT)
  const blanks = Math.max(0, 3 - photos.length)
  return [...photos, ...Array(blanks).fill("")]
})

const stackVars = computed(() => {
  let hash = 0
  for (const ch of String(props.group.id || "")) {
    hash = (hash * 31 + ch.charCodeAt(0)) | 0
  }
  const dir = hash % 2 === 0 ? 1 : -1
  const tilt = 1 + (Math.abs(hash) % 2)
  return {
    "--dir": String(dir),
    "--tilt": `${tilt}deg`,
  }
})
</script>

<template>
  <router-link
    class="card group-card"
    :to="group.path"
    :style="stackVars"
    :aria-label="`${group.title}, ${ruFigures(group.count)}`"
  >
    <div class="group-stack" aria-hidden="true">
      <div
        v-for="(src, i) in pages"
        :key="i"
        class="group-page"
        :class="{ 'group-page-front': i === 0 }"
        :style="{ '--i': i }"
      >
        <ProductPhoto v-if="src" :src="src" alt="" />
      </div>
    </div>
    <div class="card-copy">
      <div class="card-title">{{ group.title }}</div>
      <div class="card-meta">{{ ruFigures(group.count) }}</div>
    </div>
  </router-link>
</template>
