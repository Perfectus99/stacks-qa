-- Holds: bonus money that is in the account but not yet the account holder's.
--
-- A hold carries a requirement, progress towards it, and a deadline. Progress
-- accrues from qualifying spend and is applied asynchronously, because that is
-- how it behaves in the systems this is modelled on — a figure that is correct
-- eventually rather than immediately. Anything that reads it has to be written
-- for that, and a suite that never sees the delay never proves it was.

alter table promotions add column if not exists hold_days integer not null default 30;

create table if not exists holds (
  hold_id        uuid primary key default gen_random_uuid(),
  wallet_id      uuid not null references wallets (wallet_id) on delete cascade,
  tenant_id      uuid not null references tenants (tenant_id) on delete cascade,
  reference_id   text not null,
  type           text not null check (type in ('PROMOTION')),
  amount_minor   bigint not null check (amount_minor > 0),
  requirement_minor bigint not null check (requirement_minor >= 0),
  progress_minor bigint not null default 0 check (progress_minor >= 0),
  status         text not null default 'ACTIVE'
                 check (status in ('ACTIVE', 'RELEASED', 'FORFEITED', 'EXPIRED')),
  expires_at     timestamptz not null,
  settled_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists holds_wallet_status_idx on holds (wallet_id, status);
