import { model } from "@medusajs/framework/utils"

const LegalPage = model.define("legal_page", {
  id: model.id().primaryKey(),
  slug: model.text().unique(),
  title: model.text(),
  body: model.text(),
  enabled: model.boolean().default(true),
})

export default LegalPage
