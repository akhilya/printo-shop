export function smtpFromAddress(from: string) {
  const angled = from.match(/<([^>]+)>/)
  const value = String(angled?.[1] || from).trim()
  return value.includes("@") ? value : null
}

export type SmtpConfig = {
  host: string
  port: number
  user: string
  password: string
  from: string
  secure: boolean
  requireTls: boolean
}

export function parseSmtpEnv(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = String(env.SMTP_HOST || "").trim()
  const user = String(env.SMTP_USER || "").trim()
  const password = String(env.SMTP_PASSWORD || "").trim()
  const from = String(env.SMTP_FROM || "").trim()
  if (!host || !user || !password || !from) return null
  const port = Number(env.SMTP_PORT)
  const resolvedPort = Number.isFinite(port) && port > 0 ? port : 587
  const implicitTls = resolvedPort === 465
  return {
    host,
    port: resolvedPort,
    user,
    password,
    from,
    secure: implicitTls,
    requireTls: !implicitTls,
  }
}

export function smtpTransportOptions(smtp: SmtpConfig) {
  return {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: smtp.requireTls,
    ignoreTLS: false,
    tls: { minVersion: "TLSv1.2" as const },
    auth: { user: smtp.user, pass: smtp.password },
  }
}

export type OutgoingMail = {
  to: string
  subject: string
  text: string
  html: string
  replyTo?: string
}

export async function sendSmtpMail(
  mail: OutgoingMail,
  env: NodeJS.ProcessEnv = process.env
) {
  const smtp = parseSmtpEnv(env)
  if (!smtp) return { skipped: true as const }
  const nodemailer = await import("nodemailer")
  const transport = nodemailer.createTransport(smtpTransportOptions(smtp))
  await transport.sendMail({
    from: smtp.from,
    to: mail.to,
    replyTo: mail.replyTo,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  })
  return { skipped: false as const }
}
