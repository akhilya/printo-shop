import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260911170000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "custom_order"
      add column if not exists "quote_amount" integer null,
      add column if not exists "quote_note" text null,
      add column if not exists "delivery_method" text null,
      add column if not exists "client_picks_pvz" boolean not null default false,
      add column if not exists "checkout_token" text null,
      add column if not exists "tbank_payment_id" text null,
      add column if not exists "tbank_order_id" text null,
      add column if not exists "paid_at" timestamptz null,
      add column if not exists "ozon_point_id" text null,
      add column if not exists "ozon_point_name" text null,
      add column if not exists "ozon_point_address" text null,
      add column if not exists "ozon_order_number" text null,
      add column if not exists "ozon_posting_number" text null,
      add column if not exists "ozon_tracking" text null;`);
    this.addSql(`create unique index if not exists "IDX_custom_order_checkout_token_unique" on "custom_order" ("checkout_token") where "checkout_token" is not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_custom_order_checkout_token_unique";`);
    this.addSql(`alter table if exists "custom_order"
      drop column if exists "quote_amount",
      drop column if exists "quote_note",
      drop column if exists "delivery_method",
      drop column if exists "client_picks_pvz",
      drop column if exists "checkout_token",
      drop column if exists "tbank_payment_id",
      drop column if exists "tbank_order_id",
      drop column if exists "paid_at",
      drop column if exists "ozon_point_id",
      drop column if exists "ozon_point_name",
      drop column if exists "ozon_point_address",
      drop column if exists "ozon_order_number",
      drop column if exists "ozon_posting_number",
      drop column if exists "ozon_tracking";`);
  }

}
