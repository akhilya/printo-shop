import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260911190000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "custom_order"
      add column if not exists "quote_items_amount" integer null,
      add column if not exists "quote_discount_amount" integer null,
      add column if not exists "quote_shipping_amount" integer null,
      add column if not exists "quote_other_amount" integer null,
      add column if not exists "promo_code" text null,
      add column if not exists "promo_discount" integer null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "custom_order"
      drop column if exists "quote_items_amount",
      drop column if exists "quote_discount_amount",
      drop column if exists "quote_shipping_amount",
      drop column if exists "quote_other_amount",
      drop column if exists "promo_code",
      drop column if exists "promo_discount";`);
  }

}
