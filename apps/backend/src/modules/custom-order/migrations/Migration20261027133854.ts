import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261027133854 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "custom_order" add column if not exists "gift_card_email_sent_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "custom_order" drop column if exists "gift_card_email_sent_at";`);
  }

}
