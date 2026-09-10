import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260910180100 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "review" add column if not exists "status" text not null default 'moderation', add column if not exists "ip" text null;`);
    this.addSql(`update "review" set "status" = 'published' where "enabled" = true;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "review" drop column if exists "status", drop column if exists "ip";`);
  }

}
