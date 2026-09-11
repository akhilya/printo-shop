<script setup>
import { onMounted, ref } from "vue"
import { cartState, clearCartId, loadCart } from "../lib/cart.js"
import { sdk } from "../lib/sdk.js"

const message = ref("Проверяем оплату…")

onMounted(async () => {
  await loadCart()
  const id = cartState.cart?.id
  if (!id) {
    message.value =
      "Спасибо. Мы получили оплату и свяжемся по контактам из заказа."
    return
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const result = await sdk.store.cart.complete(id)
      if (result.type === "order") {
        clearCartId()
        message.value =
          "Спасибо. Мы получили оплату и свяжемся по контактам из заказа."
        return
      }
    } catch {
      // T-Bank may still be confirming the payment.
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  message.value =
    "Оплата принята банком. Если заказ не появился сразу, он создастся после подтверждения."
})
</script>

<template>
  <article class="legal">
    <h1>Заказ оплачен</h1>
    <p>{{ message }}</p>
  </article>
</template>
