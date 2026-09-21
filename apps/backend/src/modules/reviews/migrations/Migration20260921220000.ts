import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260921220000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "review" add column if not exists "pinned" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "review" drop column if exists "pinned";`);
  }

}
