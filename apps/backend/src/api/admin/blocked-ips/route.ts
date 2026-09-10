import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { parseBlockedIpInput, presentBlockedIp } from "../../../lib/ip-block"
import { BLOCKED_IP_MODULE } from "../../../modules/blocked-ip"
import type BlockedIpModuleService from "../../../modules/blocked-ip/service"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const q = String(req.query.q || "").trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const filters: Record<string, unknown> = {}
  if (q) {
    filters.$or = [
      { ip: { $ilike: `%${q}%` } },
      { reason: { $ilike: `%${q}%` } },
    ]
  }
  const service: BlockedIpModuleService = req.scope.resolve(BLOCKED_IP_MODULE)
  const [rows, count] = await service.listAndCountBlockedIps(filters, {
    order: { created_at: "DESC" },
    take: limit,
    skip: offset,
  })
  res.json({
    blocked_ips: rows.map((row) =>
      presentBlockedIp(row as unknown as Record<string, unknown>)
    ),
    count,
    limit,
    offset,
  })
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const parsed = parseBlockedIpInput(req.body)
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error })
    return
  }
  const service: BlockedIpModuleService = req.scope.resolve(BLOCKED_IP_MODULE)
  const existing = await service.listBlockedIps({ ip: parsed.ip }, { take: 1 })
  if (existing.length) {
    res.json({
      blocked_ip: presentBlockedIp(
        existing[0] as unknown as Record<string, unknown>
      ),
    })
    return
  }
  const created = await service.createBlockedIps(parsed)
  res.status(201).json({
    blocked_ip: presentBlockedIp(created as unknown as Record<string, unknown>),
  })
}
