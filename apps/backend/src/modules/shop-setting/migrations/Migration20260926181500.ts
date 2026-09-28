import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260926181500 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" add column if not exists "redirect_path" text null;`);
    this.addSql(`alter table if exists "shop_setting" add column if not exists "redirect_target" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "shop_setting" drop column if exists "redirect_path";`);
    this.addSql(`alter table if exists "shop_setting" drop column if exists "redirect_target";`);
  }

}
