import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  listOzonDeliveryApiShipmentMethods,
  ozonDeliveryApiCredentialsFromRow,
} from "../../../../lib/ozon-delivery-api"
import { getShopSetting } from "../../../../lib/shop-setting"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const row = (await getShopSetting(req.scope)) as unknown as Record<
    string,
    unknown
  >
  const credentials = ozonDeliveryApiCredentialsFromRow(row)
  if (!credentials) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Сначала сохраните Client ID и Client Secret Ozon Delivery API"
    )
  }
  const shipmentMethods = await listOzonDeliveryApiShipmentMethods(credentials)
  res.json({ shipment_methods: shipmentMethods })
}
