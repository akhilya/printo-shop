import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260917191500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "shop_event" add column if not exists "detail" text null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "shop_event" drop column if exists "detail";`
    )
  }
}
