import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260910180000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "blocked_ip" drop constraint if exists "blocked_ip_ip_unique";`);
    this.addSql(`create table if not exists "blocked_ip" ("id" text not null, "ip" text not null, "reason" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "blocked_ip_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_blocked_ip_ip_unique" ON "blocked_ip" ("ip") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_blocked_ip_deleted_at" ON "blocked_ip" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "blocked_ip" cascade;`);
  }

}
