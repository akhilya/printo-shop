import fs from "node:fs"
import https from "node:https"
import path from "node:path"
import tls from "node:tls"
import { URL } from "node:url"

function certDirs() {
  return [
    process.env.TBANK_CA_DIR,
    "/app/certs",
    path.resolve(process.cwd(), "../../docker/certs"),
    path.resolve(process.cwd(), "docker/certs"),
    path.resolve(__dirname, "../../../../../docker/certs"),
    path.resolve(__dirname, "../../../../docker/certs"),
  ].filter(Boolean) as string[]
}

export function tbankCaPem() {
  for (const dir of certDirs()) {
    const bundle = path.join(dir, "russian-trusted-ca-bundle.pem")
    if (fs.existsSync(bundle)) {
      return fs.readFileSync(bundle, "utf8")
    }
    const parts = [
      path.join(dir, "russian_trusted_root_ca.crt"),
      path.join(dir, "russian_trusted_sub_ca.crt"),
    ]
      .filter((file) => fs.existsSync(file))
      .map((file) => fs.readFileSync(file, "utf8").trim())
    if (parts.length) {
      return parts.join("\n") + "\n"
    }
  }
  return ""
}

export function tbankHttpsAgent() {
  const pem = tbankCaPem()
  if (!pem) return undefined
  return new https.Agent({
    ca: [...tls.rootCertificates, pem],
  })
}

const TBANK_LIVE_ORIGIN = "https://securepay.tinkoff.ru"

export function tbankPublicError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "")
  if (/HTTP 403|403 Forbidden/i.test(message)) {
    return "Т-Банк отклонил запрос (403). rest-api-test.tinkoff.ru требует белый список IP сервера. Для DEMO и обычного терминала нужен https://securepay.tinkoff.ru/v2."
  }
  if (/<!DOCTYPE|<html|nginx/i.test(message)) {
    return "Т-Банк вернул ошибку шлюза вместо ответа API. Проверьте URL и ключ терминала."
  }
  const stripped = message.replace(/^T-Bank [^:]+:\s*/i, "").trim()
  return stripped.slice(0, 280) || "Не удалось обратиться к Т-Банку"
}

function isJsonBody(text: string) {
  const trimmed = text.trim()
  return trimmed.startsWith("{") || trimmed.startsWith("[")
}

function rewriteTestApiUrl(url: string) {
  return url.replace(/https:\/\/rest-api-test\.tinkoff\.ru/i, TBANK_LIVE_ORIGIN)
}

function tbankPostOnce(
  url: string,
  body: string
): Promise<{ ok: boolean; json?: unknown; status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const agent = tbankHttpsAgent()
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Host: parsed.host,
          "User-Agent": "printo-shop/1.0",
        },
        agent,
        servername: parsed.hostname,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8")
          const status = res.statusCode || 500
          if (!isJsonBody(text)) {
            resolve({ ok: false, status, text })
            return
          }
          try {
            resolve({
              ok: status < 400,
              json: JSON.parse(text.trim()),
              status,
              text,
            })
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

function gatewayError(url: string, status: number, text: string) {
  const parsed = new URL(url)
  return new Error(
    `T-Bank ${parsed.hostname}${parsed.pathname} HTTP ${status}: ${text.slice(0, 180).replace(/\s+/g, " ")}`
  )
}

export async function tbankPostJson(
  url: string,
  body: string
): Promise<{ ok: boolean; json: unknown }> {
  let result = await tbankPostOnce(url, body)
  const fallback = rewriteTestApiUrl(url)
  if (!result.json && fallback !== url) {
    result = await tbankPostOnce(fallback, body)
  }
  if (!result.json) {
    throw gatewayError(url, result.status, result.text)
  }
  return { ok: result.ok, json: result.json }
}
