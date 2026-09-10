import { model } from "@medusajs/framework/utils"

const BlockedIp = model.define("blocked_ip", {
  id: model.id().primaryKey(),
  ip: model.text().unique(),
  reason: model.text().nullable(),
})

export default BlockedIp
