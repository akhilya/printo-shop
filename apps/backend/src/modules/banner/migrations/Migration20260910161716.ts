import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260910161716 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "banner" drop constraint if exists "banner_slot_unique";`);
    this.addSql(`create table if not exists "banner" ("id" text not null, "slot" text not null, "title" text not null, "body" text not null, "cta_label" text null, "cta_href" text null, "image_url" text null, "enabled" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "banner_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_banner_slot_unique" ON "banner" ("slot") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_banner_deleted_at" ON "banner" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "banner" cascade;`);
  }

}
