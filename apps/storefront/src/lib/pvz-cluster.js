export const PVZ_PIN_ZOOM = 15
export const PVZ_CLUSTER_RADIUS_PX = 64
export const DEFAULT_PVZ_VIEW = {
  lat: 55.751244,
  lon: 37.618423,
  zoom: 11,
}

export function pvzMapStartView(selected) {
  const lat = Number(selected?.lat)
  const lon = Number(selected?.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return DEFAULT_PVZ_VIEW
  }
  if (lat === 0 && lon === 0) return DEFAULT_PVZ_VIEW
  return { lat, lon, zoom: PVZ_PIN_ZOOM }
}

export function showPvzClusters(zoom, pointCount = 0) {
  if (Number.isFinite(zoom) && zoom >= PVZ_PIN_ZOOM && pointCount > 0) {
    return false
  }
  return true
}

export function mergeNearbyClusters(
  clusters,
  project,
  radiusPx = PVZ_CLUSTER_RADIUS_PX
) {
  if (!Array.isArray(clusters) || clusters.length < 2) {
    return clusters || []
  }
  const items = clusters.map((cluster, index) => ({
    cluster,
    index,
    point: project(cluster),
  }))
  const used = new Set()
  const out = []
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue
    const group = [items[i]]
    used.add(i)
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue
      const dx = items[j].point.x - items[i].point.x
      const dy = items[j].point.y - items[i].point.y
      if (Math.hypot(dx, dy) <= radiusPx) {
        group.push(items[j])
        used.add(j)
      }
    }
    if (group.length === 1) {
      out.push(group[0].cluster)
      continue
    }
    const count = group.reduce((sum, item) => sum + Number(item.cluster.count || 0), 0)
    const weight = Math.max(count, group.length)
    out.push({
      count,
      lat:
        group.reduce(
          (sum, item) => sum + item.cluster.lat * Number(item.cluster.count || 1),
          0
        ) / weight,
      lon:
        group.reduce(
          (sum, item) => sum + item.cluster.lon * Number(item.cluster.count || 1),
          0
        ) / weight,
      south: Math.min(
        ...group.map((item) => item.cluster.south ?? item.cluster.lat)
      ),
      north: Math.max(
        ...group.map((item) => item.cluster.north ?? item.cluster.lat)
      ),
      west: Math.min(
        ...group.map((item) => item.cluster.west ?? item.cluster.lon)
      ),
      east: Math.max(
        ...group.map((item) => item.cluster.east ?? item.cluster.lon)
      ),
    })
  }
  return out
}
