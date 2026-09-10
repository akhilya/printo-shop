import { model } from "@medusajs/framework/utils"

const Banner = model.define("banner", {
  id: model.id().primaryKey(),
  slot: model.text().unique(),
  title: model.text(),
  body: model.text(),
  cta_label: model.text().nullable(),
  cta_href: model.text().nullable(),
  image_url: model.text().nullable(),
  enabled: model.boolean().default(true),
})

export default Banner
