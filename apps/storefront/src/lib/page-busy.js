import { onScopeDispose, ref, watch } from "vue"

export const pageBusy = ref(false)

let holds = 0

function syncScroll() {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("is-page-busy", pageBusy.value)
}

export function holdPage() {
  holds += 1
  pageBusy.value = true
  syncScroll()
  let released = false
  return () => {
    if (released) return
    released = true
    holds = Math.max(0, holds - 1)
    pageBusy.value = holds > 0
    syncScroll()
  }
}

export function bindPageBusy(isBusy) {
  let release = null
  function sync(busy) {
    if (busy && !release) release = holdPage()
    if (!busy && release) {
      release()
      release = null
    }
  }
  watch(isBusy, sync, { immediate: true })
  onScopeDispose(() => {
    release?.()
    release = null
  })
}
