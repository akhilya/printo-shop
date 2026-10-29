import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createOzonOrderForMedusaOrder } from "../subscribers/order-placed-ozon"

type RetryOzonOrderCreationInput = {
  orderId: string
}

const retryOzonOrderCreationStep = createStep(
  "retry-ozon-order-creation",
  async (input: RetryOzonOrderCreationInput, { container }) => {
    const result = await createOzonOrderForMedusaOrder(
      container,
      input.orderId,
      { force: true }
    )
    return new StepResponse(result)
  }
)

export const retryOzonOrderCreationWorkflow = createWorkflow(
  "retry-ozon-order-creation",
  (input: RetryOzonOrderCreationInput) => {
    const result = retryOzonOrderCreationStep(input)
    return new WorkflowResponse(result)
  }
)
