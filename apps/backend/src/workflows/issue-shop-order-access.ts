import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { issueShopOrderAccessToken } from "../lib/shop-order-access"

type IssueShopOrderAccessInput = {
  number: string
  contact: string
}

const issueShopOrderAccessStep = createStep(
  "issue-shop-order-access",
  async (input: IssueShopOrderAccessInput, { container }) => {
    const token = await issueShopOrderAccessToken(
      container,
      input.number,
      input.contact
    )
    return new StepResponse(token)
  }
)

export const issueShopOrderAccessWorkflow = createWorkflow(
  "issue-shop-order-access",
  (input: IssueShopOrderAccessInput) => {
    const token = issueShopOrderAccessStep(input)
    return new WorkflowResponse(token)
  }
)
