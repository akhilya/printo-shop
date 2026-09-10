import {
  AbstractPaymentProvider,
  BigNumber,
  MedusaError,
  PaymentActions,
} from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { TbankClient } from "./client"
import { fromKopecks, mapTbankStatus, toKopecks } from "./status"
import { verifyTbankToken } from "./token"

export type TbankOptions = {
  terminalKey: string
  password: string
  apiUrl?: string
  successUrl?: string
  failUrl?: string
  notificationUrl?: string
  payType?: "O" | "T"
}

type InjectedDependencies = {
  logger: Logger
}

class TbankPaymentProviderService extends AbstractPaymentProvider<TbankOptions> {
  static identifier = "tbank"

  protected logger_: Logger
  protected options_: TbankOptions
  protected client: TbankClient

  constructor(container: InjectedDependencies, options: TbankOptions) {
    super(container, options)
    this.logger_ = container.logger
    this.options_ = options
    this.client = new TbankClient({
      terminalKey: options.terminalKey,
      password: options.password,
      apiUrl: options.apiUrl || "https://securepay.tinkoff.ru/v2",
    })
  }

  static validateOptions(_options: Record<string, unknown>) {
    // Keys may be empty in local boot; initiatePayment refuses then.
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    if (!this.options_.terminalKey || !this.options_.password) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "T-Bank terminalKey and password are not configured"
      )
    }
    const sessionId =
      (input.data?.session_id as string) ||
      input.context?.idempotency_key ||
      crypto.randomUUID()
    const result = await this.client.init({
      orderId: String(sessionId).slice(0, 50),
      amountKopecks: toKopecks(input.amount),
      description: "Оплата заказа",
      notificationUrl: this.options_.notificationUrl,
      successUrl: this.options_.successUrl,
      failUrl: this.options_.failUrl,
      sessionId,
      customerEmail: input.context?.customer?.email,
      payType: this.options_.payType ?? "O",
    })

    return {
      id: String(result.PaymentId),
      data: {
        id: String(result.PaymentId),
        PaymentId: result.PaymentId,
        PaymentURL: result.PaymentURL,
        OrderId: result.OrderId,
        Status: result.Status,
        session_id: sessionId,
      },
    }
  }

  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
    const existingId = input.data?.PaymentId ?? input.data?.id
    if (existingId) {
      try {
        await this.client.cancel(existingId as string | number)
      } catch (error) {
        this.logger_?.warn(`T-Bank cancel before update failed: ${String(error)}`)
      }
    }
    return this.initiatePayment(input)
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    const paymentId = input.data?.PaymentId ?? input.data?.id
    if (paymentId) {
      try {
        await this.client.cancel(paymentId as string | number)
      } catch {
        // Session may already be unused.
      }
    }
    return { data: input.data }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const paymentId = input.data?.PaymentId ?? input.data?.id
    if (!paymentId) {
      return { data: input.data, status: "pending" }
    }
    const state = await this.client.getState(paymentId as string | number)
    const mapped = mapTbankStatus(state.Status)
    const data = { ...input.data, ...state, id: String(state.PaymentId ?? paymentId) }
    if (mapped === "captured") {
      return { data, status: "captured" }
    }
    if (mapped === "authorized") {
      return { data, status: "authorized" }
    }
    if (mapped === "failed" || mapped === "canceled") {
      return { data, status: "error" }
    }
    return { data, status: "pending" }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    const paymentId = input.data?.PaymentId ?? input.data?.id
    if (!paymentId) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Missing T-Bank PaymentId")
    }
    const state = await this.client.getState(paymentId as string | number)
    if (mapTbankStatus(state.Status) === "captured") {
      return { data: { ...input.data, ...state, id: String(paymentId) } }
    }
    const confirmed = await this.client.confirm(paymentId as string | number)
    return { data: { ...input.data, ...confirmed, id: String(paymentId) } }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const paymentId = input.data?.PaymentId ?? input.data?.id
    if (!paymentId) {
      return { data: input.data }
    }
    const result = await this.client.cancel(paymentId as string | number)
    return { data: { ...input.data, ...result, id: String(paymentId) } }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const paymentId = input.data?.PaymentId ?? input.data?.id
    if (!paymentId) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Missing T-Bank PaymentId")
    }
    const result = await this.client.cancel(
      paymentId as string | number,
      toKopecks(input.amount)
    )
    return { data: { ...input.data, ...result, id: String(paymentId) } }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    const paymentId = input.data?.PaymentId ?? input.data?.id
    if (!paymentId) {
      return { data: input.data ?? {} }
    }
    const state = await this.client.getState(paymentId as string | number)
    return { data: { ...input.data, ...state, id: String(paymentId) } }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const paymentId = input.data?.PaymentId ?? input.data?.id
    if (!paymentId) {
      return { status: "pending" }
    }
    const state = await this.client.getState(paymentId as string | number)
    const mapped = mapTbankStatus(state.Status)
    if (mapped === "failed") {
      return { status: "error", data: state }
    }
    return { status: mapped, data: state }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const data = (payload.data ?? {}) as Record<string, unknown>
    if (!verifyTbankToken(data, this.options_.password)) {
      this.logger_?.error("Invalid T-Bank notification token")
      return {
        action: PaymentActions.FAILED,
        data: { session_id: "", amount: new BigNumber(0) },
      }
    }

    const nested = (data.DATA ?? {}) as Record<string, unknown>
    const sessionId = String(
      nested.session_id || data.OrderId || ""
    )
    const amount = new BigNumber(fromKopecks(data.Amount))
    const mapped = mapTbankStatus(String(data.Status ?? ""))

    if (!sessionId) {
      return {
        action: PaymentActions.NOT_SUPPORTED,
        data: { session_id: "", amount },
      }
    }

    if (mapped === "captured") {
      return {
        action: PaymentActions.SUCCESSFUL,
        data: { session_id: sessionId, amount },
      }
    }
    if (mapped === "authorized") {
      return {
        action: PaymentActions.AUTHORIZED,
        data: { session_id: sessionId, amount },
      }
    }
    if (mapped === "failed") {
      return {
        action: PaymentActions.FAILED,
        data: { session_id: sessionId, amount },
      }
    }
    return {
      action: PaymentActions.NOT_SUPPORTED,
      data: { session_id: sessionId, amount },
    }
  }
}

export default TbankPaymentProviderService
