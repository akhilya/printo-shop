import { Module } from "@medusajs/framework/utils"
import LegalPageModuleService from "./service"

export const LEGAL_PAGE_MODULE = "legalPageModule"

export default Module(LEGAL_PAGE_MODULE, {
  service: LegalPageModuleService,
})
