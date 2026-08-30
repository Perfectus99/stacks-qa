-- Promotions, and the record of one attached to a deposit.
--
-- A bonus is previewed when the deposit is submitted and decided when it is
-- approved, so the attachment carries a status of its own. The two moments can
-- disagree — a promotion may be withdrawn or expire in between — and a schema
-- that stored only the previewed figure would have nowhere to record that the
-- bonus was never actually granted.

create table if not exists promotions (
  promotion_id       uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants (tenant_id) on delete cascade,
  code               text not null,
  name               text not null,
  promotion_type     text not null check (promotion_type in ('PERCENTAGE', 'FIXED')),
  bonus_percent      integer,
  bonus_fixed_minor  bigint,
  min_deposit_minor  bigint not null default 0,
  max_bonus_minor    bigint,
  release_multiplier integer not null default 1,
  active             boolean not null default true,
  starts_at          timestamptz,
  ends_at            timestamptz,
  created_at         timestamptz not null default now(),
  unique (tenant_id, code),

  -- A percentage promotion without a percentage, or a fixed one without an
  -- amount, is not a promotion anybody can evaluate.
  constraint promotions_shape check (
    (promotion_type = 'PERCENTAGE' and bonus_percent is not null)
    or (promotion_type = 'FIXED' and bonus_fixed_minor is not null)
  )
);

create table if not exists deposit_promotions (
  deposit_id                uuid primary key references deposits (deposit_id) on delete cascade,
  promotion_id              uuid not null references promotions (promotion_id),
  previewed_bonus_minor     bigint not null,
  granted_bonus_minor       bigint,
  release_requirement_minor bigint not null default 0,
  status                    text not null default 'PREVIEWED'
                            check (status in ('PREVIEWED', 'GRANTED', 'DECLINED')),
  declined_reason           text
);
