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
  customerEmail?: string
  customerPhone?: string
  payType?: "O" | "T"
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

export class TbankClient {
  constructor(private readonly options: TbankClientOptions) {}

  init(input: TbankInitInput) {
    const body: Record<string, unknown> = {
      TerminalKey: this.options.terminalKey,
      Amount: input.amountKopecks,
      OrderId: input.orderId,
      Description: input.description ?? "Заказ",
      Language: "ru",
      PayType: input.payType ?? "O",
    }
    if (input.notificationUrl) {
      body.NotificationURL = input.notificationUrl
    }
    if (input.successUrl) {
      body.SuccessURL = input.successUrl
    }
    if (input.failUrl) {
      body.FailURL = input.failUrl
    }
    const data: Record<string, string> = {}
    if (input.sessionId) {
      data.session_id = input.sessionId.slice(0, 100)
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
    return this.request("Init", body)
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

  cancel(paymentId: string | number, amountKopecks?: number) {
    const body: Record<string, unknown> = {
      TerminalKey: this.options.terminalKey,
      PaymentId: paymentId,
    }
    if (amountKopecks != null) {
      body.Amount = amountKopecks
    }
    return this.request("Cancel", body)
  }

  private async request(
    method: string,
    payload: Record<string, unknown>
  ): Promise<TbankApiResponse> {
    const Token = signTbankPayload(payload, this.options.password)
    const fetchImpl = this.options.fetchImpl ?? fetch
    const response = await fetchImpl(
      `${this.options.apiUrl.replace(/\/$/, "")}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, Token }),
      }
    )
    const json = (await response.json()) as TbankApiResponse
    if (!response.ok || json.Success === false) {
      throw new Error(
        json.Message || json.Details || `T-Bank ${method} failed (${json.ErrorCode})`
      )
    }
    return json
  }
}
