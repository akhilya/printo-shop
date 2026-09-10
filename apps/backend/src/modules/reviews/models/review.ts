import { model } from "@medusajs/framework/utils"

const Review = model.define("review", {
  id: model.id().primaryKey(),
  product_id: model.text().index(),
  author: model.text(),
  body: model.text(),
  rating: model.number().nullable(),
  image_url: model.text().nullable(),
  image_urls: model.json().nullable(),
  enabled: model.boolean().default(true),
  status: model.text().default("moderation"),
  ip: model.text().nullable(),
})

export default Review
