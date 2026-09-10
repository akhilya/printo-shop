import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260910165500 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "review" add column if not exists "enabled" boolean not null default true;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "review" drop column if exists "enabled";`);
  }

}
