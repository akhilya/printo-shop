<script setup>
import { ChevronLeft, ChevronRight, X } from "@lucide/vue"
import { onBeforeUnmount, onMounted, watch } from "vue"

const props = defineProps({
  images: { type: Array, default: () => [] },
  index: { type: Number, default: 0 },
  alt: { type: String, default: "" },
})

const emit = defineEmits(["close", "update:index"])

function close() {
  emit("close")
}

function shift(dir) {
  const total = props.images.length
  if (total < 2) return
  const next = (props.index + dir + total) % total
  emit("update:index", next)
}

function onKey(event) {
  if (event.key === "Escape") close()
  if (event.key === "ArrowRight") shift(1)
  if (event.key === "ArrowLeft") shift(-1)
}

watch(
  () => props.images.length,
  (n) => {
    if (!n) close()
  }
)

onMounted(() => {
  document.body.style.overflow = "hidden"
  window.addEventListener("keydown", onKey)
})

onBeforeUnmount(() => {
  document.body.style.overflow = ""
  window.removeEventListener("keydown", onKey)
})
</script>

<template>
  <Teleport to="body">
    <div
      class="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Фото"
      @click.self="close"
    >
      <button
        type="button"
        class="lightbox-close"
        aria-label="Закрыть"
        @click="close"
      >
        <X :size="20" :stroke-width="1.5" />
      </button>
      <button
        v-if="images.length > 1"
        type="button"
        class="lightbox-nav lightbox-prev"
        aria-label="Предыдущее фото"
        @click="shift(-1)"
      >
        <ChevronLeft :size="24" :stroke-width="1.5" />
      </button>
      <img :src="images[index]" :alt="alt" />
      <button
        v-if="images.length > 1"
        type="button"
        class="lightbox-nav lightbox-next"
        aria-label="Следующее фото"
        @click="shift(1)"
      >
        <ChevronRight :size="24" :stroke-width="1.5" />
      </button>
    </div>
  </Teleport>
</template>
