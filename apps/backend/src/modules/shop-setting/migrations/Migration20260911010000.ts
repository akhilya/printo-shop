import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260911010000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" add column if not exists "orders_closed" boolean not null default false, add column if not exists "orders_message" text not null default 'Заказы временно недоступны.';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" drop column if exists "orders_closed", drop column if exists "orders_message";`);
  }

}
