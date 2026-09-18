import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260918180000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "shop_order_lookup"
      add column if not exists "access_token" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "shop_order_lookup"
      drop column if exists "access_token";`);
  }

}
