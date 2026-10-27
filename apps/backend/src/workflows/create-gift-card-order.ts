import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { CUSTOM_ORDER_MODULE } from "../modules/custom-order"
import type CustomOrderModuleService from "../modules/custom-order/service"

type CreateGiftCardOrderInput = {
  amount: number
  email: string
  token: string
  ip: string
}

const createGiftCardOrderStep = createStep(
  "create-gift-card-order",
  async (input: CreateGiftCardOrderInput, { container }) => {
    const title = `Подарочный сертификат на ${input.amount} ₽`
    const service: CustomOrderModuleService = container.resolve(
      CUSTOM_ORDER_MODULE
    )
    const created = await service.createCustomOrders({
      name: "Покупатель сертификата",
      email: input.email,
      message: title,
      product_title: title,
      status: "quoted",
      quote_amount: input.amount,
      quote_items_amount: input.amount,
      gift_card_amount: input.amount,
      checkout_token: input.token,
      ip: input.ip,
    })
    const order = Array.isArray(created) ? created[0] : created
    return new StepResponse(order)
  }
)

export const createGiftCardOrderWorkflow = createWorkflow(
  "create-gift-card-order",
  (input: CreateGiftCardOrderInput) => {
    const order = createGiftCardOrderStep(input)
    return new WorkflowResponse(order)
  }
)
