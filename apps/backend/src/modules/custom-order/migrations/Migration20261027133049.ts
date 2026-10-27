import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261027133049 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "custom_order" add column if not exists "gift_card_amount" integer null, add column if not exists "gift_card_code" text null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "custom_order" drop column if exists "gift_card_amount", drop column if exists "gift_card_code";`)
  }

}
