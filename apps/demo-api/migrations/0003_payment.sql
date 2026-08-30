-- Deposits and the gateways they arrive through.
--
-- A deposit is a state machine with two terminal states. The CHECK enumerates
-- them so an unknown status cannot be written at all, and `decided_at` is set
-- with the transition rather than inferred from an audit table nobody reads.

create table if not exists gateway_configs (
  gateway_config_id uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants (tenant_id) on delete cascade,
  flow_type         text not null check (flow_type in ('BANK_TRANSFER', 'QR_TRANSFER')),
  display_name      text not null,
  active            boolean not null default true,
  unique (tenant_id, flow_type)
);

create table if not exists deposits (
  deposit_id        uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants (tenant_id) on delete cascade,
  user_id           uuid not null references users (user_id) on delete cascade,
  gateway_config_id uuid not null references gateway_configs (gateway_config_id),
  flow_type         text not null,
  amount_minor      bigint not null check (amount_minor > 0),
  status            text not null default 'PENDING_APPROVAL'
                    check (status in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  decided_by        uuid references users (user_id),
  decided_at        timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists deposits_tenant_status_idx on deposits (tenant_id, status);
create index if not exists deposits_user_idx on deposits (user_id, created_at desc);
