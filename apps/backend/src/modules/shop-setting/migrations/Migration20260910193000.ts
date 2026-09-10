import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260910193000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" add column if not exists "tbank_receipt" boolean not null default false, add column if not exists "tbank_taxation" text not null default 'usn_income', add column if not exists "tbank_vat" text not null default 'none';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" drop column if exists "tbank_receipt", drop column if exists "tbank_taxation", drop column if exists "tbank_vat";`);
  }

}
