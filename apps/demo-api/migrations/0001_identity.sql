-- Tenants and the people inside them.
--
-- The unique constraint is (tenant_id, username), not username alone: two
-- tenants may each have an "alice", and a platform that cannot express that is
-- not multi-tenant. It is also what makes a duplicate registration a 409
-- rather than a silently shared account.

create extension if not exists "pgcrypto";

create table if not exists tenants (
  tenant_id  uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists users (
  user_id       uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (tenant_id) on delete cascade,
  username      text not null,
  password_hash text not null,
  currency      text not null,
  role          text not null default 'PLAYER' check (role in ('PLAYER', 'ADMIN')),
  created_at    timestamptz not null default now(),
  unique (tenant_id, username)
);

create index if not exists users_tenant_idx on users (tenant_id);
