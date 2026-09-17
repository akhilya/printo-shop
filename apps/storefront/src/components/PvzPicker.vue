<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import {
  mergeNearbyClusters,
  pvzMapStartView,
  showPvzClusters,
} from "../lib/pvz-cluster.js"
import { BACKEND_URL, shopError, storeHeaders } from "../lib/sdk.js"

const props = defineProps({
  phone: { type: String, default: "" },
  selectedId: { type: String, default: "" },
  selectedLat: { type: [String, Number], default: "" },
  selectedLon: { type: [String, Number], default: "" },
})

const emit = defineEmits(["select"])

const points = ref([])
const clusters = ref([])
const message = ref("")
const configured = ref(true)
const loading = ref(false)

const statusText = computed(() => {
  if (!configured.value) {
    return "Не удалось загрузить пункты выдачи."
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

function pinIcon(selected) {
  return L.divIcon({
    className: selected ? "pvz-marker is-on" : "pvz-marker",
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: '<span class="pvz-marker-dot"></span>',
  })
}

function clusterIcon(count) {
  const size = count > 99 ? 36 : count > 9 ? 32 : 28
  return L.divIcon({
    className: "pvz-cluster",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span>${count}</span>`,
  })
}

function openCluster(cluster) {
  if (!map) return
  if (
    Number.isFinite(cluster.south) &&
    Number.isFinite(cluster.west) &&
    Number.isFinite(cluster.north) &&
    Number.isFinite(cluster.east)
  ) {
    map.fitBounds(
      [
        [cluster.south, cluster.west],
        [cluster.north, cluster.east],
      ],
      { padding: [36, 36], maxZoom: 16 }
    )
    return
  }
  map.setView(
    [cluster.lat, cluster.lon],
    Math.min(18, (map.getZoom() || 10) + 2)
  )
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
  const zoom = map.getZoom()
  const drawClusters = showPvzClusters(zoom, points.value.length)
    ? mergeNearbyClusters(clusters.value, (cluster) =>
        map.latLngToLayerPoint([cluster.lat, cluster.lon])
      )
    : []
  for (const cluster of drawClusters) {
    const marker = L.marker([cluster.lat, cluster.lon], {
      icon: clusterIcon(cluster.count),
      keyboard: true,
      zIndexOffset: 200,
    })
    marker.on("click", () => openCluster(cluster))
    marker.addTo(map)
    markers.push(marker)
  }
  for (const point of points.value) {
    const selected = point.id === props.selectedId
    const marker = L.marker([point.lat, point.lon], {
      icon: pinIcon(selected),
      keyboard: true,
      zIndexOffset: selected ? 400 : 300,
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
    clusters.value = data.clusters || []
    message.value = data.message
      ? shopError(data.message, "Не удалось загрузить пункты выдачи.")
      : ""
    await nextTick()
    resizeMap()
    paintMarkers()
  } catch {
    if (seq !== requestSeq) return
    message.value = "Не удалось загрузить пункты выдачи."
    points.value = []
    clusters.value = []
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
    if (data.message) {
      message.value = shopError(
        data.message,
        "Не удалось найти это место."
      )
    }
    if (data.center) {
      map.setView([data.center.lat, data.center.lon], 12)
    }
  } catch {
    message.value = "Не удалось найти это место."
  }
}

onMounted(async () => {
  if (!mapEl.value) return
  const start = pvzMapStartView({
    lat: props.selectedLat,
    lon: props.selectedLon,
  })
  map = L.map(mapEl.value, {
    attributionControl: false,
    zoomControl: true,
  }).setView([start.lat, start.lon], start.zoom)
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
