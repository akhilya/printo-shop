import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260916180000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" add column if not exists "ozon_oauth_token" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" drop column if exists "ozon_oauth_token";`);
  }

}
