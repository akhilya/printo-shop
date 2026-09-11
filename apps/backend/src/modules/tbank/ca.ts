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

export function tbankPostJson(
  url: string,
  body: string
): Promise<{ ok: boolean; json: unknown }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const agent = tbankHttpsAgent()
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        agent,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString("utf8"))
            resolve({
              ok: (res.statusCode || 500) < 400,
              json,
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
