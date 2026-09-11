<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { BACKEND_URL, storeHeaders } from "../lib/sdk.js"

const props = defineProps({
  phone: { type: String, default: "" },
  selectedId: { type: String, default: "" },
})

const emit = defineEmits(["select"])

const points = ref([])
const message = ref("")
const configured = ref(true)
const loading = ref(false)

const statusText = computed(() => {
  if (!configured.value) {
    return "Ozon Доставка ещё не подключена в настройках магазина."
  }
  if (loading.value) return "Ищем пункты в кадре…"
  return message.value || "\u00a0"
})
const query = ref("")
const mapEl = ref(null)
const listEl = ref(null)
let map = null
let markers = []
let timer = null
let resize = null
let requestSeq = 0

function clearMarkers() {
  for (const marker of markers) marker.remove()
  markers = []
}

function resizeMap() {
  if (!map) return
  map.invalidateSize()
}

function viewport() {
  if (!map) return null
  const bounds = map.getBounds()
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
    zoom: map.getZoom(),
  }
}

function paintMarkers() {
  if (!map) return
  clearMarkers()
  for (const point of points.value) {
    const selected = point.id === props.selectedId
    const marker = L.circleMarker([point.lat, point.lon], {
      radius: selected ? 8 : 5,
      color: "#000",
      weight: selected ? 2 : 1,
      fillColor: selected ? "#000" : "#fff",
      fillOpacity: 1,
    })
    marker.on("click", () => emit("select", point))
    marker.addTo(map)
    markers.push(marker)
  }
}

async function loadPoints() {
  if (!map) return
  const view = viewport()
  if (!view) return
  const seq = ++requestSeq
  loading.value = true
  try {
    const res = await fetch(`${BACKEND_URL}/store/ozon/points`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...storeHeaders(),
      },
      body: JSON.stringify({
        ...view,
        phone: props.phone,
      }),
    })
    const data = await res.json()
    if (seq !== requestSeq) return
    configured.value = data.configured !== false
    points.value = data.points || []
    message.value = data.message || ""
    await nextTick()
    resizeMap()
    paintMarkers()
  } catch {
    if (seq !== requestSeq) return
    message.value = "Не удалось загрузить пункты выдачи."
    points.value = []
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function scheduleLoad() {
  clearTimeout(timer)
  timer = setTimeout(loadPoints, 280)
}

async function goToQuery() {
  const text = query.value.trim()
  if (!text || !map) return
  try {
    const res = await fetch(`${BACKEND_URL}/store/ozon/points`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...storeHeaders(),
      },
      body: JSON.stringify({ query: text, phone: props.phone }),
    })
    const data = await res.json()
    configured.value = data.configured !== false
    if (data.center) {
      map.setView([data.center.lat, data.center.lon], 12)
    }
  } catch {
    message.value = "Не удалось найти это место."
  }
}

onMounted(async () => {
  if (!mapEl.value) return
  map = L.map(mapEl.value, {
    attributionControl: false,
    zoomControl: true,
  }).setView([55.751244, 37.618423], 11)
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
  }).addTo(map)
  map.on("moveend", scheduleLoad)
  resize = new ResizeObserver(() => resizeMap())
  resize.observe(mapEl.value)
  await nextTick()
  resizeMap()
  loadPoints()
})

watch(
  () => props.phone,
  () => scheduleLoad()
)

watch(
  () => props.selectedId,
  async () => {
    paintMarkers()
    await nextTick()
    const selected = listEl.value?.querySelector(".on")
    selected?.scrollIntoView({ block: "nearest" })
  }
)

onBeforeUnmount(() => {
  clearTimeout(timer)
  resize?.disconnect()
  map?.off("moveend", scheduleLoad)
  map?.remove()
  map = null
})
</script>

<template>
  <div class="pvz" :class="{ 'has-list': points.length }">
    <div class="pvz-head">
      <p class="muted">Пункт выдачи Ozon</p>
      <div class="pvz-search">
        <input
          v-model="query"
          type="search"
          placeholder="Найти на карте: Москва, Санкт-Петербург…"
          @keydown.enter.prevent="goToQuery"
        />
        <button type="button" class="btn-ghost" @click="goToQuery">
          Найти
        </button>
      </div>
    </div>
    <div class="pvz-map-wrap">
      <div ref="mapEl" class="pvz-map" />
      <p class="pvz-status" :class="{ err: !configured }">{{ statusText }}</p>
    </div>
    <ul v-if="points.length" ref="listEl" class="pvz-list">
      <li
        v-for="point in points"
        :key="point.id"
        :class="{ on: point.id === selectedId }"
      >
        <button type="button" @click="emit('select', point)">
          <strong>{{ point.name }}</strong>
          <span>{{ point.address }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
