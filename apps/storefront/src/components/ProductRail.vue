<script setup>
import { ChevronLeft, ChevronRight } from "@lucide/vue"
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import LinkArrow from "./LinkArrow.vue"
import ProductCell from "./ProductCell.vue"

const AUTO_MS = 4500

const props = defineProps({
  title: { type: String, default: "Ещё в коллекции" },
  to: { type: String, default: "" },
  products: { type: Array, default: () => [] },
})

const track = ref(null)
const paused = ref(false)
const canPrev = ref(false)
const canNext = ref(false)
let observer = null
let timer = 0

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function maxScroll() {
  const el = track.value
  if (!el) return 0
  return Math.max(0, el.scrollWidth - el.clientWidth)
}

function measure() {
  const el = track.value
  if (!el) {
    canPrev.value = false
    canNext.value = false
    return
  }
  const max = maxScroll()
  if (max <= 1) {
    canPrev.value = false
    canNext.value = false
    return
  }
  canPrev.value = el.scrollLeft > 1
  canNext.value = el.scrollLeft < max - 1
}

function scheduleMeasure() {
  measure()
  requestAnimationFrame(() => {
    measure()
    requestAnimationFrame(measure)
  })
  window.setTimeout(measure, 80)
  window.setTimeout(measure, 360)
}

function stepSize() {
  const el = track.value
  const cell = el?.querySelector(".card")
  if (!el || !cell) return 0
  const styles = getComputedStyle(el)
  const gap = Number.parseFloat(styles.columnGap || styles.gap) || 16
  return cell.getBoundingClientRect().width + gap
}

function scrollByDir(dir) {
  const el = track.value
  const step = stepSize()
  if (!el || !step) return
  const max = maxScroll()
  const target = Math.min(max, Math.max(0, el.scrollLeft + dir * step))
  el.scrollTo({
    left: target,
    behavior: reducedMotion() ? "auto" : "smooth",
  })
  scheduleMeasure()
}

function advance() {
  const el = track.value
  if (!el || paused.value) return
  measure()
  if (!canNext.value) {
    el.scrollTo({
      left: 0,
      behavior: reducedMotion() ? "auto" : "smooth",
    })
    return
  }
  scrollByDir(1)
}

function stopAuto() {
  if (timer) {
    window.clearInterval(timer)
    timer = 0
  }
}

function startAuto() {
  stopAuto()
  if (reducedMotion()) return
  timer = window.setInterval(advance, AUTO_MS)
}

function onUserNav(dir) {
  scrollByDir(dir)
  startAuto()
}

onMounted(() => {
  measure()
  const el = track.value
  el?.addEventListener("scroll", measure, { passive: true })
  el?.addEventListener("scrollend", measure)
  observer = new ResizeObserver(measure)
  if (el) observer.observe(el)
  startAuto()
})

watch(
  () => props.products,
  () => {
    nextTick(() => {
      measure()
      startAuto()
    })
  }
)

onBeforeUnmount(() => {
  stopAuto()
  track.value?.removeEventListener("scroll", measure)
  track.value?.removeEventListener("scrollend", measure)
  observer?.disconnect()
})
</script>

<template>
  <section
    v-if="products.length"
    class="section rail"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
  >
    <div class="section-head">
      <h2 class="section-title">
        <router-link v-if="to" class="section-more" :to="to">{{ title }}<LinkArrow /></router-link>
        <template v-else>{{ title }}</template>
      </h2>
      <div v-if="canPrev || canNext" class="rail-nav">
        <button
          type="button"
          :disabled="!canPrev"
          aria-label="Назад"
          @click="onUserNav(-1)"
        >
          <ChevronLeft :size="24" :stroke-width="2.25" />
        </button>
        <button
          type="button"
          :disabled="!canNext"
          aria-label="Дальше"
          @click="onUserNav(1)"
        >
          <ChevronRight :size="24" :stroke-width="2.25" />
        </button>
      </div>
    </div>
    <div ref="track" class="rail-track">
      <ProductCell v-for="p in products" :key="p.id" :product="p" />
    </div>
  </section>
</template>

