import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260911140000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" add column if not exists "ozon_client_id" text null, add column if not exists "ozon_api_key" text null, add column if not exists "ozon_from_place_id" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" drop column if exists "ozon_client_id", drop column if exists "ozon_api_key", drop column if exists "ozon_from_place_id";`);
  }

}
