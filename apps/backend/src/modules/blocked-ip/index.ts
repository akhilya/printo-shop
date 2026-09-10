import { Module } from "@medusajs/framework/utils"
import BlockedIpModuleService from "./service"

export const BLOCKED_IP_MODULE = "blockedIpModule"

export default Module(BLOCKED_IP_MODULE, {
  service: BlockedIpModuleService,
})
