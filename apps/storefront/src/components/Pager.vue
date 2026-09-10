<script setup>
import { computed } from "vue"
import { visiblePages } from "../lib/sdk.js"

const props = defineProps({
  page: { type: Number, required: true },
  pages: { type: Number, required: true },
  hrefFor: { type: Function, required: true },
})

const items = computed(() => visiblePages(props.page, props.pages))
</script>

<template>
  <nav v-if="pages > 1" class="pager" aria-label="Страницы">
    <router-link
      v-if="page > 1"
      class="pager-step"
      :to="hrefFor(page - 1)"
    >
      Назад
    </router-link>
    <span v-else class="pager-step muted">Назад</span>
    <ol class="pager-list">
      <li v-for="(item, i) in items" :key="`${item}-${i}`">
        <span v-if="item === '…'" class="muted">…</span>
        <router-link
          v-else
          :to="hrefFor(item)"
          :aria-current="item === page ? 'page' : undefined"
        >
          {{ item }}
        </router-link>
      </li>
    </ol>
    <router-link
      v-if="page < pages"
      class="pager-step"
      :to="hrefFor(page + 1)"
    >
      Дальше
    </router-link>
    <span v-else class="pager-step muted">Дальше</span>
  </nav>
</template>
