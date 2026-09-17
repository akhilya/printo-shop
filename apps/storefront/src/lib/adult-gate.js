import { ref } from "vue"
import { persistObject } from "./persist.js"

export { isAdultProduct } from "./product-specs.js"

export const adultState = persistObject("shop_adult", { confirmed: false })
export const adultPrompt = ref(false)

let waiters = []

export function isAdultConfirmed() {
  return adultState.confirmed === true
}

export function requestAdultConfirm() {
  if (isAdultConfirmed()) return Promise.resolve(true)
  adultPrompt.value = true
  return new Promise((resolve) => {
    waiters.push(resolve)
  })
}

function settle(ok) {
  adultPrompt.value = false
  const list = waiters
  waiters = []
  for (const resolve of list) resolve(ok)
}

export function acceptAdult() {
  adultState.confirmed = true
  settle(true)
}

export function declineAdult() {
  settle(false)
}
