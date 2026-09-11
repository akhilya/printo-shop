import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260911180000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "custom_order" add column if not exists "shop_number" text null;`);
    this.addSql(`create unique index if not exists "IDX_custom_order_shop_number_unique" on "custom_order" ("shop_number") where "shop_number" is not null;`);
    this.addSql(`create table if not exists "shop_order_lookup" ("id" text not null, "number" text not null, "source" text not null, "ref_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "shop_order_lookup_pkey" primary key ("id"));`);
    this.addSql(`create unique index if not exists "IDX_shop_order_lookup_number_unique" on "shop_order_lookup" ("number") where "deleted_at" is null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "shop_order_lookup" cascade;`);
    this.addSql(`drop index if exists "IDX_custom_order_shop_number_unique";`);
    this.addSql(`alter table if exists "custom_order" drop column if exists "shop_number";`);
  }

}
