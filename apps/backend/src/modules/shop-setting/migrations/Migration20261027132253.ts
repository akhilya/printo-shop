import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261027132253 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" add column if not exists "gift_card_denominations" text not null default '[]';`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" drop column if exists "gift_card_denominations";`)
  }

}
