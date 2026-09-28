<script setup>
import WaitIcon from "./WaitIcon.vue"
</script>

<template>
  <div class="page-scrim" role="status" aria-live="polite" aria-busy="true">
    <WaitIcon />
    <span class="visually-hidden">Загрузка</span>
  </div>
</template>
