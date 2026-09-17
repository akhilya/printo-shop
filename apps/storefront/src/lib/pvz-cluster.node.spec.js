import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  mergeNearbyClusters,
  pvzMapStartView,
  showPvzClusters,
} from "./pvz-cluster.js"

describe("showPvzClusters", () => {
  it("hides numbered bubbles once street-level points exist", () => {
    assert.equal(showPvzClusters(12, 0), true)
    assert.equal(showPvzClusters(15, 8), false)
    assert.equal(showPvzClusters(16, 0), true)
  })
})

describe("pvzMapStartView", () => {
  it("starts over Moscow when nothing is saved", () => {
    const view = pvzMapStartView({})
    assert.equal(view.lat, 55.751244)
    assert.equal(view.lon, 37.618423)
    assert.equal(view.zoom, 11)
  })

  it("zooms to a saved pickup point", () => {
    const view = pvzMapStartView({ lat: "56.838", lon: "60.597" })
    assert.equal(view.lat, 56.838)
    assert.equal(view.lon, 60.597)
    assert.equal(view.zoom, 15)
  })
})

describe("mergeNearbyClusters", () => {
  it("keeps far-apart bubbles", () => {
    const merged = mergeNearbyClusters(
      [
        { count: 4, lat: 0, lon: 0 },
        { count: 5, lat: 1, lon: 1 },
      ],
      (item) => ({ x: item.lon * 1000, y: item.lat * 1000 }),
      40
    )
    assert.equal(merged.length, 2)
  })

  it("joins bubbles that sit on top of each other", () => {
    const merged = mergeNearbyClusters(
      [
        { count: 4, lat: 55.75, lon: 37.61, south: 55.74, north: 55.76, west: 37.6, east: 37.62 },
        { count: 6, lat: 55.751, lon: 37.611, south: 55.74, north: 55.76, west: 37.6, east: 37.62 },
      ],
      (item) => ({ x: item.lon * 20000, y: item.lat * 20000 }),
      80
    )
    assert.equal(merged.length, 1)
    assert.equal(merged[0].count, 10)
  })
})
