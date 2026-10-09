import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261007140000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "custom_order"
      add column if not exists "pay_on_arrival" boolean not null default false,
      add column if not exists "buyer_ready_at" timestamptz null,
      add column if not exists "ozon_posting_status" text null;`);
    this.addSql(`update "custom_order"
      set "client_picks_pvz" = true
      where "delivery_method" = 'ozon'
        and "client_picks_pvz" = false
        and "paid_at" is null
        and "deleted_at" is null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "custom_order"
      drop column if exists "pay_on_arrival",
      drop column if exists "buyer_ready_at",
      drop column if exists "ozon_posting_status";`);
  }

}
