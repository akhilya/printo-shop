<script setup>
import { computed } from "vue"
import ProductPhoto from "./ProductPhoto.vue"
import { productImage } from "../lib/sdk.js"
import { productSalePrice } from "../lib/sales.js"
import { OUT_OF_STOCK_LABEL, productInStock } from "../lib/product-stock.js"

const props = defineProps({
  product: { type: Object, required: true },
})

const price = computed(() => productSalePrice(props.product))
const inStock = computed(() => productInStock(props.product))
</script>

<template>
  <router-link
    class="card"
    :class="{ 'is-oos': !inStock }"
    :to="`/p/${product.handle}`"
  >
    <div class="matte">
      <ProductPhoto :src="productImage(product)" :alt="product.title" />
    </div>
    <div class="card-copy">
      <div class="card-title">{{ product.title }}</div>
      <div class="card-meta price-row">
        <span v-if="price.onSale" class="price-was">{{ price.original }}</span>
        <span>{{ price.current }}</span>
      </div>
      <div v-if="!inStock" class="card-meta">{{ OUT_OF_STOCK_LABEL }}</div>
    </div>
  </router-link>
</template>
