import { tbankPostJson, tbankPublicError } from "./ca"
import { signTbankPayload } from "./token"

export type TbankClientOptions = {
  terminalKey: string
  password: string
  apiUrl: string
  fetchImpl?: typeof fetch
}

export type TbankInitInput = {
  orderId: string
  amountKopecks: number
  description?: string
  notificationUrl?: string
  successUrl?: string
  failUrl?: string
  sessionId?: string
  cartId?: string
  customerEmail?: string
  customerPhone?: string
  payType?: "O" | "T"
  receipt?: boolean
  taxation?: string
  vat?: string
  items?: Array<{
    name: string
    quantity: number
    priceKopecks: number
    amountKopecks: number
  }>
}

export type TbankApiResponse = {
  Success: boolean
  ErrorCode: string
  Message?: string
  Details?: string
  TerminalKey?: string
  Status?: string
  PaymentId?: number | string
  OrderId?: string
  Amount?: number
  PaymentURL?: string
  [key: string]: unknown
}

export function isPublicHttpUrl(url?: string) {
  if (!url) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false
    }
    const host = parsed.hostname.toLowerCase()
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local")
    ) {
      return false
    }
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) {
      return false
    }
    return true
  } catch {
    return false
  }
}

function tbankVat(vat?: string) {
  if (vat === "vat20") return "vat22"
  return vat || "none"
}

function tbankTaxation(taxation?: string) {
  if (taxation === "envd") return "usn_income"
  return taxation || "usn_income"
}

export class TbankClient {
  constructor(private readonly options: TbankClientOptions) {}

  init(input: TbankInitInput) {
    const body: Record<string, unknown> = {
      TerminalKey: this.options.terminalKey,
      Amount: input.amountKopecks,
      OrderId: input.orderId,
      Description: (input.description ?? "Заказ").slice(0, 140),
      Language: "ru",
      PayType: input.payType ?? "O",
    }
    if (isPublicHttpUrl(input.notificationUrl)) {
      body.NotificationURL = input.notificationUrl
    }
    if (isPublicHttpUrl(input.successUrl)) {
      body.SuccessURL = input.successUrl
    }
    if (isPublicHttpUrl(input.failUrl)) {
      body.FailURL = input.failUrl
    }
    const data: Record<string, string> = {}
    if (input.sessionId) {
      data.session_id = input.sessionId.slice(0, 100)
    }
    if (input.cartId) {
      data.cart_id = String(input.cartId).slice(0, 100)
    }
    if (input.customerEmail) {
      data.Email = input.customerEmail.slice(0, 100)
    }
    if (input.customerPhone) {
      data.Phone = input.customerPhone.slice(0, 100)
    }
    if (Object.keys(data).length) {
      body.DATA = data
    }
    body.Receipt = this.receiptPayload(input)
    return this.request("Init", body)
  }

  receiptPayload(input: {
    amountKopecks: number
    description?: string
    customerEmail?: string
    customerPhone?: string
    taxation?: string
    vat?: string
    items?: Array<{
      name: string
      quantity: number
      priceKopecks: number
      amountKopecks: number
    }>
  }) {
    const email =
      input.customerEmail?.trim().slice(0, 64) || "order@printo.studio"
    const phone = input.customerPhone?.replace(/[^\d+]/g, "").slice(0, 19)
    const tax = tbankVat(input.vat)
    const source =
      input.items && input.items.length
        ? input.items
        : [
            {
              name: (input.description || "Заказ").slice(0, 128),
              quantity: 1,
              priceKopecks: input.amountKopecks,
              amountKopecks: input.amountKopecks,
            },
          ]
    const receipt: Record<string, unknown> = {
      Taxation: tbankTaxation(input.taxation),
      Email: email,
      Items: source.map((line) => ({
        Name: line.name.slice(0, 128),
        Price: line.priceKopecks,
        Quantity: line.quantity,
        Amount: line.amountKopecks,
        Tax: tax,
        PaymentMethod: "full_payment",
        PaymentObject: line.name === "Доставка" ? "service" : "commodity",
      })),
    }
    if (phone) receipt.Phone = phone
    return receipt
  }

  getState(paymentId: string | number) {
    return this.request("GetState", {
      TerminalKey: this.options.terminalKey,
      PaymentId: paymentId,
    })
  }

  confirm(paymentId: string | number, amountKopecks?: number) {
    const body: Record<string, unknown> = {
      TerminalKey: this.options.terminalKey,
      PaymentId: paymentId,
    }
    if (amountKopecks != null) {
      body.Amount = amountKopecks
    }
    return this.request("Confirm", body)
  }

  cancel(
    paymentId: string | number,
    amountKopecks?: number,
    receipt?: Record<string, unknown>
  ) {
    const body: Record<string, unknown> = {
      TerminalKey: this.options.terminalKey,
      PaymentId: paymentId,
    }
    if (amountKopecks != null) {
      body.Amount = amountKopecks
    }
    if (receipt && amountKopecks != null) {
      body.Receipt = receipt
    }
    return this.request("Cancel", body)
  }

  private async request(
    method: string,
    payload: Record<string, unknown>
  ): Promise<TbankApiResponse> {
    const Token = signTbankPayload(payload, this.options.password)
    const url = `${this.options.apiUrl.replace(/\/$/, "")}/${method}`
    const body = JSON.stringify({ ...payload, Token })
    let ok = true
    let json: TbankApiResponse
    try {
      if (this.options.fetchImpl) {
        const response = await this.options.fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
        ok = response.ok
        json = (await response.json()) as TbankApiResponse
      } else {
        const result = await tbankPostJson(url, body)
        ok = result.ok
        json = result.json as TbankApiResponse
      }
    } catch (error) {
      throw new Error(tbankPublicError(error))
    }
    if (!ok || json.Success === false) {
      const detail = [json.Message, json.Details, json.ErrorCode]
        .filter(Boolean)
        .join(" — ")
      throw new Error(detail || `T-Bank ${method} failed`)
    }
    return json
  }
}
