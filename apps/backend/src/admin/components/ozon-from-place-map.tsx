import { Button, Input, Text } from "@medusajs/ui"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { useEffect, useRef, useState } from "react"
import { sdk } from "../lib/sdk"

type MapPoint = {
  id: string
  name: string
  address: string
  lat: number
  lon: number
}

type MapCluster = {
  count: number
  lat: number
  lon: number
  south?: number
  west?: number
  north?: number
  east?: number
}

type PointsResponse = {
  configured?: boolean
  points?: MapPoint[]
  clusters?: MapCluster[]
  center?: { lat: number; lon: number } | null
  message?: string | null
}

function pinIcon(selected: boolean) {
  return L.divIcon({
    className: selected ? "ozon-map-pin is-on" : "ozon-map-pin",
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: '<span class="ozon-map-pin-dot"></span>',
  })
}

const PIN_ZOOM = 15
const CLUSTER_RADIUS_PX = 64

function clusterIcon(count: number) {
  const size = count > 99 ? 36 : count > 9 ? 32 : 28
  return L.divIcon({
    className: "ozon-map-cluster",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span>${count}</span>`,
  })
}

function mergeClusters(
  clusters: MapCluster[],
  map: L.Map
): MapCluster[] {
  if (clusters.length < 2) return clusters
  const items = clusters.map((cluster, index) => ({
    cluster,
    index,
    point: map.latLngToLayerPoint([cluster.lat, cluster.lon]),
  }))
  const used = new Set<number>()
  const out: MapCluster[] = []
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue
    const group = [items[i]]
    used.add(i)
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue
      const dx = items[j].point.x - items[i].point.x
      const dy = items[j].point.y - items[i].point.y
      if (Math.hypot(dx, dy) <= CLUSTER_RADIUS_PX) {
        group.push(items[j])
        used.add(j)
      }
    }
    if (group.length === 1) {
      out.push(group[0].cluster)
      continue
    }
    const count = group.reduce((sum, item) => sum + item.cluster.count, 0)
    out.push({
      count,
      lat:
        group.reduce((sum, item) => sum + item.cluster.lat * item.cluster.count, 0) /
        count,
      lon:
        group.reduce((sum, item) => sum + item.cluster.lon * item.cluster.count, 0) /
        count,
      south: Math.min(...group.map((item) => item.cluster.south ?? item.cluster.lat)),
      north: Math.max(...group.map((item) => item.cluster.north ?? item.cluster.lat)),
      west: Math.min(...group.map((item) => item.cluster.west ?? item.cluster.lon)),
      east: Math.max(...group.map((item) => item.cluster.east ?? item.cluster.lon)),
    })
  }
  return out
}

type Props = {
  selectedId: string
  onSelect: (id: string) => void
}

const OzonFromPlaceMap = ({ selectedId, onSelect }: Props) => {
  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const timerRef = useRef<number | null>(null)
  const seqRef = useRef(0)
  const selectedRef = useRef(selectedId)
  const onSelectRef = useRef(onSelect)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("\u00a0")
  const [label, setLabel] = useState("")

  selectedRef.current = selectedId
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!selectedId) {
      setLabel("")
      return
    }
    let gone = false
    sdk.client
      .fetch<{ point: MapPoint }>(
        `/admin/ozon/points/${encodeURIComponent(selectedId)}`
      )
      .then((data) => {
        if (gone || !data?.point) return
        const name = data.point.name || data.point.address || data.point.id
        setLabel([name, data.point.address].filter(Boolean).join(" · "))
        const map = mapRef.current
        if (
          map &&
          Number.isFinite(data.point.lat) &&
          Number.isFinite(data.point.lon) &&
          data.point.lat !== 0
        ) {
          map.setView([data.point.lat, data.point.lon], Math.max(map.getZoom(), 14))
        }
      })
      .catch(() => {
        if (!gone) setLabel(`Пункт ${selectedId}`)
      })
    return () => {
      gone = true
    }
  }, [selectedId])

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = L.map(mapEl.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([55.751244, 37.618423], 11)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map

    const load = () => {
      const bounds = map.getBounds()
      const seq = ++seqRef.current
      setStatus("Ищем пункты в кадре…")
      sdk.client
        .fetch<PointsResponse>("/admin/ozon/points", {
          method: "POST",
          body: {
            south: bounds.getSouth(),
            west: bounds.getWest(),
            north: bounds.getNorth(),
            east: bounds.getEast(),
            zoom: map.getZoom(),
          },
        })
        .then((data) => {
          if (seq !== seqRef.current) return
          if (data.configured === false) {
            setStatus(
              data.message ||
                "Сохраните Client ID и Client Secret, подключите кабинет, затем выберите пункт."
            )
            return
          }
          setStatus(data.message || "\u00a0")
          paint(map, data.points || [], data.clusters || [])
        })
        .catch(() => {
          if (seq !== seqRef.current) return
          setStatus("Не удалось загрузить пункты.")
        })
    }

    const schedule = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(load, 280)
    }

    map.on("moveend", schedule)
    map.whenReady(() => {
      map.invalidateSize()
      load()
    })

    const resize = new ResizeObserver(() => map.invalidateSize())
    resize.observe(mapEl.current)

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      resize.disconnect()
      map.off("moveend", schedule)
      map.remove()
      mapRef.current = null
    }
  }, [])

  function paint(map: L.Map, points: MapPoint[], clusters: MapCluster[]) {
    for (const marker of markersRef.current) marker.remove()
    markersRef.current = []
    const zoom = map.getZoom()
    const drawClusters =
      zoom >= PIN_ZOOM && points.length ? [] : mergeClusters(clusters, map)
    for (const cluster of drawClusters) {
      const marker = L.marker([cluster.lat, cluster.lon], {
        icon: clusterIcon(cluster.count),
        keyboard: true,
        zIndexOffset: 200,
      })
      marker.on("click", () => {
        if (
          Number.isFinite(cluster.south) &&
          Number.isFinite(cluster.west) &&
          Number.isFinite(cluster.north) &&
          Number.isFinite(cluster.east)
        ) {
          map.fitBounds(
            [
              [cluster.south!, cluster.west!],
              [cluster.north!, cluster.east!],
            ],
            { padding: [36, 36], maxZoom: 16 }
          )
          return
        }
        map.setView(
          [cluster.lat, cluster.lon],
          Math.min(18, (map.getZoom() || 10) + 2)
        )
      })
      marker.addTo(map)
      markersRef.current.push(marker)
    }
    for (const point of points) {
      const selected = point.id === selectedRef.current
      const marker = L.marker([point.lat, point.lon], {
        icon: pinIcon(selected),
        keyboard: true,
        zIndexOffset: selected ? 400 : 300,
      })
      marker.on("click", () => {
        onSelectRef.current(point.id)
        setLabel(
          [point.name || point.address || point.id, point.address]
            .filter(Boolean)
            .join(" · ")
        )
      })
      marker.addTo(map)
      markersRef.current.push(marker)
    }
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const bounds = map.getBounds()
    sdk.client
      .fetch<PointsResponse>("/admin/ozon/points", {
        method: "POST",
        body: {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
          zoom: map.getZoom(),
        },
      })
      .then((data) => {
        if (data.configured === false) return
        paint(map, data.points || [], data.clusters || [])
      })
      .catch(() => undefined)
  }, [selectedId])

  function search() {
    const q = query.trim()
    if (!q) return
    const map = mapRef.current
    sdk.client
      .fetch<PointsResponse>("/admin/ozon/points", {
        method: "POST",
        body: { query: q, zoom: 12 },
      })
      .then((data) => {
        if (!map || !data.center) {
          setStatus(data.message || "Не нашли это место.")
          return
        }
        map.setView([data.center.lat, data.center.lon], 12)
      })
      .catch(() => setStatus("Не нашли это место."))
  }

  return (
    <div className="flex flex-col gap-y-2">
      <style>{`
        .ozon-from-map { height: 420px; width: 100%; border: 1px solid #e5e7eb; }
        .ozon-from-map .leaflet-tile-pane { filter: grayscale(1) contrast(1.08); }
        .ozon-from-map .leaflet-container { background: #fff; font-family: inherit; }
        .ozon-from-map .leaflet-bar { box-shadow: none; border: 0; }
        .ozon-from-map .leaflet-control-zoom a {
          width: 28px; height: 28px; line-height: 28px; border-radius: 0;
          border: 1px solid #111; background: #fff; color: #111;
        }
        .ozon-map-pin, .ozon-map-cluster { background: none; border: 0; }
        .ozon-map-pin { display: grid; place-items: center; }
        .ozon-map-pin-dot {
          width: 10px; height: 10px; border: 2px solid #111; background: #fff;
          border-radius: 50%;
        }
        .ozon-map-pin.is-on .ozon-map-pin-dot { width: 12px; height: 12px; background: #111; }
        .ozon-map-cluster {
          display: grid; place-items: center; background: #fff !important; color: #111;
          border: 1px solid #111; border-radius: 50%; font-size: 12px; font-weight: 500;
        }
        .ozon-map-cluster span { display: grid; place-items: center; width: 100%; height: 100%; }
      `}</style>
      <Text size="small" leading="compact" className="font-medium">
        Пункт сдачи
      </Text>
      <Text size="small" className="text-ui-fg-subtle">
        Куда вы относите собранные заказы. На мелком зуме кружки с цифрой,
        клик приближает. Отдельный пункт выбирается нажатием.
      </Text>
      <div className="flex gap-x-2">
        <Input
          placeholder="Москва, Санкт-Петербург…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              search()
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={search}>
          Найти
        </Button>
      </div>
      <div ref={mapEl} className="ozon-from-map" />
      <Text size="small" className="text-ui-fg-subtle">
        {status}
      </Text>
      {selectedId ? (
        <div className="flex items-start justify-between gap-x-3">
          <Text size="small">
            Выбран: {label || selectedId}
          </Text>
          <Button
            type="button"
            variant="transparent"
            onClick={() => {
              onSelect("")
              setLabel("")
            }}
          >
            Сбросить
          </Button>
        </div>
      ) : (
        <Text size="small" className="text-ui-fg-subtle">
          Пункт ещё не выбран.
        </Text>
      )}
    </div>
  )
}

export default OzonFromPlaceMap
