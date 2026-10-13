import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261013190000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" add column if not exists "custom_order_telegram" boolean not null default true, add column if not exists "custom_order_max" boolean not null default true;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" drop column if exists "custom_order_telegram", drop column if exists "custom_order_max";`);
  }

}
