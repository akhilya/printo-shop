import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { getProductsBatch } from "../lib/delegat-bridge/service"

type DelegatReadProductsBatchInput = {
  ids: string[]
}

const delegatReadProductsBatchStep = createStep(
  "delegat-read-products-batch",
  async (input: DelegatReadProductsBatchInput, { container }) => {
    const payload = await getProductsBatch(container, input.ids)
    return new StepResponse(payload)
  }
)

export const delegatReadProductsBatchWorkflow = createWorkflow(
  "delegat-read-products-batch",
  (input: DelegatReadProductsBatchInput) => {
    const payload = delegatReadProductsBatchStep(input)
    return new WorkflowResponse(payload)
  }
)
