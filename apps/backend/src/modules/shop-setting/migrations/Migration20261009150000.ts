import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261009150000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" add column if not exists "ozon_custom_article" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" drop column if exists "ozon_custom_article";`);
  }

}
