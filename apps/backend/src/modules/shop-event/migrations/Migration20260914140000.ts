import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260914140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "shop_event" ("id" text not null, "kind" text not null, "level" text not null default 'info', "title" text not null, "message" text not null, "order_id" text null, "shop_number" text null, "posting_number" text null, "from_status" text null, "to_status" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "shop_event_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_event_kind" ON "shop_event" ("kind") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_event_order_id" ON "shop_event" ("order_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_event_deleted_at" ON "shop_event" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_event_created_at" ON "shop_event" ("created_at") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "shop_event" cascade;`)
  }
}
