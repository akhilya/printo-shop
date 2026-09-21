import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260921213000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "review" add column if not exists "source_url" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "review" drop column if exists "source_url";`);
  }

}
