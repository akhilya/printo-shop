import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261029143000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "custom_order"
      add column if not exists "ozon_delivery_idempotency_key" text null,
      add column if not exists "ozon_provider" text null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "custom_order"
      drop column if exists "ozon_delivery_idempotency_key",
      drop column if exists "ozon_provider";`)
  }
}
