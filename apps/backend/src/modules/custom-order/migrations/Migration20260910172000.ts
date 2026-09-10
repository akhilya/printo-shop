import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260910172000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "custom_order" add column if not exists "telegram" text null, add column if not exists "max_account" text null, add column if not exists "vk" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "custom_order" drop column if exists "telegram", drop column if exists "max_account", drop column if exists "vk";`);
  }

}
