<script setup>
import { computed } from "vue"
import { RouterLink } from "vue-router"
import ProductPhoto from "./ProductPhoto.vue"
import { productHref } from "../lib/product-href.js"

const props = defineProps({
  item: { type: Object, required: true },
})

const href = computed(() => productHref(props.item))
</script>

<template>
  <component
    :is="href ? RouterLink : 'div'"
    class="line-product"
    :class="{ 'is-link': href }"
    v-bind="href ? { to: href } : {}"
  >
    <div class="matte">
      <ProductPhoto :src="item.thumbnail || ''" :alt="item.title" />
    </div>
    <slot />
  </component>
</template>
