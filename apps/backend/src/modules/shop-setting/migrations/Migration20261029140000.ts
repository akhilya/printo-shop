import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261029140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting"
      add column if not exists "ozon_delivery_client_id" text null,
      add column if not exists "ozon_delivery_client_secret" text null,
      add column if not exists "ozon_delivery_shipment_method_id" text null,
      add column if not exists "ozon_delivery_weight_g" text null,
      add column if not exists "ozon_delivery_length_mm" text null,
      add column if not exists "ozon_delivery_width_mm" text null,
      add column if not exists "ozon_delivery_height_mm" text null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting"
      drop column if exists "ozon_delivery_client_id",
      drop column if exists "ozon_delivery_client_secret",
      drop column if exists "ozon_delivery_shipment_method_id",
      drop column if exists "ozon_delivery_weight_g",
      drop column if exists "ozon_delivery_length_mm",
      drop column if exists "ozon_delivery_width_mm",
      drop column if exists "ozon_delivery_height_mm";`)
  }
}
