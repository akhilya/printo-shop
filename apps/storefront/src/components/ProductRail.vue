<script setup>
import { ChevronLeft, ChevronRight } from "@lucide/vue"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import LinkArrow from "./LinkArrow.vue"
import ProductCell from "./ProductCell.vue"
import { sortInStockFirst } from "../lib/product-stock.js"

const AUTO_MS = 4500

const props = defineProps({
  title: { type: String, default: "Ещё в коллекции" },
  to: { type: String, default: "" },
  products: { type: Array, default: () => [] },
})

const listed = computed(() => sortInStockFirst(props.products))
const track = ref(null)
const paused = ref(false)
const canPrev = ref(false)
const canNext = ref(false)
let observer = null
let timer = 0
let handed = false
let scrollToken = 0

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

function moveTo(left) {
  const el = track.value
  if (!el) return
  const token = ++scrollToken
  el.scrollTo({
    left,
    behavior: reducedMotion() ? "auto" : "smooth",
  })
  const finish = () => {
    if (token !== scrollToken) return
    scrollToken = 0
  }
  el.addEventListener("scrollend", finish, { once: true })
  window.setTimeout(finish, 900)
  scheduleMeasure()
}

function scrollByDir(dir) {
  const el = track.value
  const step = stepSize()
  if (!el || !step) return
  const max = maxScroll()
  const target = Math.min(max, Math.max(0, el.scrollLeft + dir * step))
  moveTo(target)
}

function handOff() {
  if (handed) return
  handed = true
  stopAuto()
  const el = track.value
  const moving = scrollToken !== 0
  scrollToken += 1
  if (!el || !moving) return
  el.scrollTo({ left: el.scrollLeft, behavior: "auto" })
}

function onWheel(event) {
  if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || !event.deltaX) return
  handOff()
}

function onScroll() {
  measure()
  if (handed || scrollToken) return
  handOff()
}

function advance() {
  const el = track.value
  if (!el || handed || paused.value) return
  measure()
  if (!canNext.value) {
    moveTo(0)
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
  if (handed || reducedMotion()) return
  timer = window.setInterval(advance, AUTO_MS)
}

function onUserNav(dir) {
  handOff()
  scrollByDir(dir)
}

onMounted(() => {
  measure()
  const el = track.value
  el?.addEventListener("scroll", onScroll, { passive: true })
  el?.addEventListener("scrollend", measure)
  el?.addEventListener("pointerdown", handOff)
  el?.addEventListener("wheel", onWheel, { passive: true })
  observer = new ResizeObserver(measure)
  if (el) observer.observe(el)
  startAuto()
})

watch(listed, () => {
  nextTick(() => {
    measure()
    startAuto()
  })
})

onBeforeUnmount(() => {
  stopAuto()
  track.value?.removeEventListener("scroll", onScroll)
  track.value?.removeEventListener("scrollend", measure)
  track.value?.removeEventListener("pointerdown", handOff)
  track.value?.removeEventListener("wheel", onWheel)
  observer?.disconnect()
})
</script>

<template>
  <section
    v-if="listed.length"
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
      <ProductCell v-for="p in listed" :key="p.id" :product="p" />
    </div>
  </section>
</template>

