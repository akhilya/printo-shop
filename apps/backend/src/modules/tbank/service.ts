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
import {
  peekShopSetting,
  tbankOptionsFromRow,
  type TbankLiveOptions,
} from "../../lib/shop-setting"
import { SHOP_SETTING_MODULE } from "../shop-setting"
import type ShopSettingModuleService from "../shop-setting/service"
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
  [key: string]: unknown
}

class TbankPaymentProviderService extends AbstractPaymentProvider<TbankOptions> {
  static identifier = "tbank"

  protected logger_: Logger
  protected options_: TbankOptions
  protected container_: InjectedDependencies

  constructor(container: InjectedDependencies, options: TbankOptions) {
    super(container, options)
    this.container_ = container
    this.logger_ = container.logger
    this.options_ = options
  }

  private fallbackOptions(): TbankLiveOptions {
    return {
      terminalKey: this.options_.terminalKey || "",
      password: this.options_.password || "",
      apiUrl: this.options_.apiUrl || "https://securepay.tinkoff.ru/v2",
      successUrl: this.options_.successUrl,
      failUrl: this.options_.failUrl,
      notificationUrl: this.options_.notificationUrl,
      payType: this.options_.payType === "T" ? "T" : "O",
      receipt: false,
      taxation: "usn_income",
      vat: "none",
    }
  }

  private async liveOptions(): Promise<TbankLiveOptions> {
    const cached = tbankOptionsFromRow(peekShopSetting())
    if (cached) return cached
    try {
      const resolve = (
        this.container_ as { resolve?: (id: string) => unknown }
      ).resolve
      const service =
        typeof resolve === "function"
          ? (resolve(SHOP_SETTING_MODULE) as ShopSettingModuleService)
          : undefined
      if (service) {
        const rows = await service.listShopSettings(
          { key: "storefront" },
          { take: 1 }
        )
        const fromDb = tbankOptionsFromRow(
          rows[0] as unknown as Record<string, unknown>
        )
        if (fromDb) return fromDb
      }
    } catch {
      // Payment provider container may not include shop settings.
    }
    return this.fallbackOptions()
  }

  private clientFor(options: TbankLiveOptions) {
    return new TbankClient({
      terminalKey: options.terminalKey,
      password: options.password,
      apiUrl: options.apiUrl,
    })
  }

  private async bank() {
    return this.clientFor(await this.liveOptions())
  }

  static validateOptions(_options: Record<string, unknown>) {
    // Keys may be empty in local boot; initiatePayment refuses then.
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    const options = await this.liveOptions()
    if (!options.terminalKey || !options.password) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Т-Банк не настроен. Укажите ключ и пароль в админке."
      )
    }
    const sessionId =
      (input.data?.session_id as string) ||
      input.context?.idempotency_key ||
      crypto.randomUUID()
    const amountKopecks = toKopecks(input.amount)
    if (amountKopecks < 100) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Сумма заказа слишком мала для оплаты."
      )
    }
    const orderId = `p${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`.slice(0, 50)
    const result = await this.clientFor(options).init({
      orderId,
      amountKopecks,
      description: "Оплата заказа",
      notificationUrl: options.notificationUrl,
      successUrl: options.successUrl,
      failUrl: options.failUrl,
      sessionId,
      cartId:
        typeof input.data?.cart_id === "string" ? input.data.cart_id : undefined,
      customerEmail:
        input.context?.customer?.email ||
        (typeof input.data?.email === "string" ? input.data.email : undefined),
      payType: options.payType,
      receipt: options.receipt,
      taxation: options.taxation,
      vat: options.vat,
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
        await (await this.bank()).cancel(existingId as string | number)
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
        await (await this.bank()).cancel(paymentId as string | number)
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
    const state = await (await this.bank()).getState(paymentId as string | number)
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
    const state = await (await this.bank()).getState(paymentId as string | number)
    if (mapTbankStatus(state.Status) === "captured") {
      return { data: { ...input.data, ...state, id: String(paymentId) } }
    }
    const confirmed = await (await this.bank()).confirm(paymentId as string | number)
    return { data: { ...input.data, ...confirmed, id: String(paymentId) } }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const paymentId = input.data?.PaymentId ?? input.data?.id
    if (!paymentId) {
      return { data: input.data }
    }
    const result = await (await this.bank()).cancel(paymentId as string | number)
    return { data: { ...input.data, ...result, id: String(paymentId) } }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const paymentId = input.data?.PaymentId ?? input.data?.id
    if (!paymentId) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Missing T-Bank PaymentId")
    }
    const result = await (await this.bank()).cancel(
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
    const state = await (await this.bank()).getState(paymentId as string | number)
    return { data: { ...input.data, ...state, id: String(paymentId) } }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const paymentId = input.data?.PaymentId ?? input.data?.id
    if (!paymentId) {
      return { status: "pending" }
    }
    const state = await (await this.bank()).getState(paymentId as string | number)
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
    const options = await this.liveOptions()
    if (!verifyTbankToken(data, options.password)) {
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
