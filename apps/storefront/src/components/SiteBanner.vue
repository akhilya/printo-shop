<script setup>
import { computed } from "vue"
import { shopPhotoSrc } from "../lib/photo-url.js"
import ImgWait from "./ImgWait.vue"
import LinkArrow from "./LinkArrow.vue"

const props = defineProps({
  banner: { type: Object, required: true },
})

function isRemote(href) {
  return /^https?:\/\//i.test(href || "")
}

const isProduct = computed(
  () =>
    props.banner.slot === "product_custom" ||
    props.banner.slot === "home_custom"
)
const isOrder = computed(() => props.banner.slot === "home_order")
const ctaClass = computed(() => {
  if (isProduct.value) return "btn banner-cta banner-product-cta"
  if (isOrder.value) return "btn banner-cta banner-order-cta"
  return "btn banner-cta"
})
</script>

<template>
  <section
    class="banner"
    :class="{
      'banner-hero': banner.slot === 'home_hero',
      'banner-catalog': banner.slot === 'home_catalog',
      'banner-order': isOrder,
      'banner-product':
        banner.slot === 'product_custom' || banner.slot === 'home_custom',
    }"
  >
    <div class="banner-copy">
      <h2 class="banner-title">{{ banner.title }}</h2>
      <p class="banner-body">{{ banner.body }}</p>
      <a
        v-if="banner.cta_label && banner.cta_href && isRemote(banner.cta_href)"
        :class="ctaClass"
        :href="banner.cta_href"
      >
        {{ banner.cta_label }}
        <LinkArrow v-if="!isProduct" />
      </a>
      <router-link
        v-else-if="banner.cta_label && banner.cta_href"
        :class="ctaClass"
        :to="banner.cta_href"
      >
        {{ banner.cta_label }}
        <LinkArrow v-if="!isProduct" />
      </router-link>
    </div>
    <div v-if="banner.image_url" class="banner-media">
      <ImgWait :src="shopPhotoSrc(banner.image_url)" :alt="banner.title" />
    </div>
  </section>
</template>
