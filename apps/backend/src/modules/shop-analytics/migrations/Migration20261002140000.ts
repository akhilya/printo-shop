import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261002140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "shop_page_view" ("id" text not null, "path" text not null, "visitor" text not null, "kind" text not null default 'view', "source" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "shop_page_view_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_page_view_path" ON "shop_page_view" ("path") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_page_view_visitor" ON "shop_page_view" ("visitor") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_page_view_created_at" ON "shop_page_view" ("created_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_page_view_deleted_at" ON "shop_page_view" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `create table if not exists "shop_visitor" ("id" text not null, "visitor" text not null, "last_seen" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "shop_visitor_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_shop_visitor_visitor_unique" ON "shop_visitor" ("visitor") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_visitor_last_seen" ON "shop_visitor" ("last_seen") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_visitor_deleted_at" ON "shop_visitor" ("deleted_at") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "shop_page_view" cascade;`)
    this.addSql(`drop table if exists "shop_visitor" cascade;`)
  }
}
