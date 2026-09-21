import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260921190000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "review" add column if not exists "external_id" text null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_review_external_id" ON "review" ("external_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_review_external_id_unique" ON "review" ("external_id") WHERE deleted_at IS NULL AND external_id IS NOT NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_review_external_id_unique";`);
    this.addSql(`drop index if exists "IDX_review_external_id";`);
    this.addSql(`alter table if exists "review" drop column if exists "external_id";`);
  }

}
