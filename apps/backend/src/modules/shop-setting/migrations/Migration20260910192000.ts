import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260910192000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" add column if not exists "tbank_terminal_key" text null, add column if not exists "tbank_password" text null, add column if not exists "tbank_api_url" text null, add column if not exists "tbank_success_url" text null, add column if not exists "tbank_fail_url" text null, add column if not exists "tbank_notification_url" text null, add column if not exists "tbank_pay_type" text not null default 'O';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" drop column if exists "tbank_terminal_key", drop column if exists "tbank_password", drop column if exists "tbank_api_url", drop column if exists "tbank_success_url", drop column if exists "tbank_fail_url", drop column if exists "tbank_notification_url", drop column if exists "tbank_pay_type";`);
  }

}
