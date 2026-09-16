import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260916200000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" add column if not exists "ozon_quote_mode" text not null default 'fixed';`);
    this.addSql(`alter table if exists "shop_setting" add column if not exists "ozon_fixed_amount" integer not null default 350;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" drop column if exists "ozon_quote_mode";`);
    this.addSql(`alter table if exists "shop_setting" drop column if exists "ozon_fixed_amount";`);
  }

}
