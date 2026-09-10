import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260910145425 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "review" add column if not exists "rating" integer null, add column if not exists "image_urls" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "review" drop column if exists "rating", drop column if exists "image_urls";`);
  }

}
