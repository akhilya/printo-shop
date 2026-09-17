<script setup>
import { onBeforeUnmount, onMounted } from "vue"

const props = defineProps({
  title: { type: String, required: true },
  confirmLabel: { type: String, required: true },
  busy: { type: Boolean, default: false },
  busyLabel: { type: String, default: "" },
})

const emit = defineEmits(["close", "confirm"])

function close() {
  if (props.busy) return
  emit("close")
}

function onKey(event) {
  if (event.key === "Escape") close()
}

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
      class="confirm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      @click.self="close"
    >
      <div class="confirm-panel">
        <h2 id="confirm-title" class="confirm-head">{{ title }}</h2>
        <div class="confirm-body">
          <slot />
        </div>
        <div class="confirm-foot">
          <button
            class="btn"
            type="button"
            :disabled="busy"
            @click="emit('confirm')"
          >
            {{ busy && busyLabel ? busyLabel : confirmLabel }}
          </button>
          <button
            class="btn btn-ghost"
            type="button"
            :disabled="busy"
            @click="close"
          >
            Назад
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
