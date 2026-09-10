<script setup>
import { ChevronDown } from "@lucide/vue"
</script>

<template>
  <span class="select-field">
    <slot />
    <ChevronDown class="select-caret" :size="24" :stroke-width="2.25" aria-hidden="true" />
  </span>
</template>
