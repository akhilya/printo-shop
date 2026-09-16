import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260916190000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" add column if not exists "ozon_refresh_token" text null;`);
    this.addSql(`alter table if exists "shop_setting" add column if not exists "ozon_oauth_state" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" drop column if exists "ozon_refresh_token";`);
    this.addSql(`alter table if exists "shop_setting" drop column if exists "ozon_oauth_state";`);
  }

}
