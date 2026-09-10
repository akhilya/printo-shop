import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260910180110 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "custom_order" add column if not exists "ip" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "custom_order" drop column if exists "ip";`);
  }

}
