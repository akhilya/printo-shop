export function isOrderWritePath(method: string, url: string) {
  if (method !== "POST") return false
  const path = String(url || "").split("?")[0]
  return (
    /\/store\/carts\/[^/]+\/complete\/?$/.test(path) ||
    /\/store\/payment-collections/.test(path) ||
    /\/store\/custom-orders\/?$/.test(path)
  )
}
