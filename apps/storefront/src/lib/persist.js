import { reactive, watch } from "vue"

function readJson(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode */
  }
}

export function persistObject(key, defaults) {
  const saved = readJson(key)
  const data = reactive({ ...defaults })
  if (saved && typeof saved === "object") {
    for (const name of Object.keys(defaults)) {
      const value = saved[name]
      if (typeof value === typeof defaults[name]) {
        data[name] = value
      }
    }
  }
  watch(
    data,
    () => {
      const next = {}
      for (const name of Object.keys(defaults)) {
        next[name] = data[name]
      }
      writeJson(key, next)
    },
    { deep: true }
  )
  return data
}
