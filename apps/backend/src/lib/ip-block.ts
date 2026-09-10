import { MedusaContainer } from "@medusajs/framework"
import { isBlockableIp } from "./client-ip"
import { BLOCKED_IP_MODULE } from "../modules/blocked-ip"
import type BlockedIpModuleService from "../modules/blocked-ip/service"

export const BLOCKED_MESSAGE = "Доступ ограничен"

export async function isIpBlocked(
  container: MedusaContainer,
  ip: string
): Promise<boolean> {
  if (!isBlockableIp(ip)) return false
  const service: BlockedIpModuleService = container.resolve(BLOCKED_IP_MODULE)
  const rows = await service.listBlockedIps({ ip }, { take: 1 })
  return rows.length > 0
}

export function presentBlockedIp(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    ip: String(row.ip || ""),
    reason: row.reason ? String(row.reason) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
  }
}

export function parseBlockedIpInput(body: unknown): { ip: string; reason: string | null } | { error: string } {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const ip = String(rec.ip || "").trim()
  if (!isBlockableIp(ip)) {
    return { error: "Укажите IP-адрес" }
  }
  const reason = String(rec.reason || "").trim().slice(0, 200)
  return { ip, reason: reason || null }
}
