-- Wallets and the ledger behind them.
--
-- Money is stored in minor units as an integer. Storing it as a float invites
-- the rounding class of bug that is hardest to notice and worst to explain, and
-- a payments platform is the last place to accept that trade.
--
-- The balance is maintained by a trigger rather than by the application. Any
-- path that inserts a ledger entry moves the balance by exactly that amount,
-- including paths written later by someone who has not read this file. The
-- reconciliation endpoint then means something: it compares two values that
-- cannot drift through the intended route, so a mismatch is evidence of an
-- unintended one.

create table if not exists wallets (
  wallet_id    uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references users (user_id) on delete cascade,
  tenant_id    uuid not null references tenants (tenant_id) on delete cascade,
  currency     text not null,
  balance_minor bigint not null default 0 check (balance_minor >= 0),
  created_at   timestamptz not null default now()
);

create table if not exists ledger_entries (
  entry_id     uuid primary key default gen_random_uuid(),
  wallet_id    uuid not null references wallets (wallet_id) on delete cascade,
  reference_id text not null,
  type         text not null,
  amount_minor bigint not null,
  created_at   timestamptz not null default now()
);

create index if not exists ledger_entries_wallet_idx on ledger_entries (wallet_id, created_at);

create or replace function apply_ledger_entry() returns trigger
language plpgsql as $$
begin
  update wallets
     set balance_minor = balance_minor + new.amount_minor
   where wallet_id = new.wallet_id;
  return new;
end;
$$;

drop trigger if exists ledger_entries_apply on ledger_entries;
create trigger ledger_entries_apply
  after insert on ledger_entries
  for each row execute function apply_ledger_entry();
