import { sql } from '../../db.js'
import type { TransactionSql } from 'postgres'

export interface GatewayRow {
  gateway_config_id: string
  tenant_id: string
  flow_type: string
  display_name: string
}

export interface DepositRow {
  deposit_id: string
  tenant_id: string
  user_id: string
  flow_type: string
  amount_minor: string
  status: string
}

export async function listGateways(tenantId: string): Promise<GatewayRow[]> {
  return sql<GatewayRow[]>`
    select gateway_config_id, tenant_id, flow_type, display_name
    from gateway_configs
    where tenant_id = ${tenantId} and active
    order by flow_type
  `
}

export async function findGateway(
  tenantId: string,
  gatewayConfigId: string,
): Promise<GatewayRow | undefined> {
  const [row] = await sql<GatewayRow[]>`
    select gateway_config_id, tenant_id, flow_type, display_name
    from gateway_configs
    where gateway_config_id = ${gatewayConfigId} and tenant_id = ${tenantId} and active
  `
  return row
}

export async function insertDeposit(
  db: TransactionSql,
  input: {
    tenantId: string
    userId: string
    gatewayConfigId: string
    flowType: string
    amountMinor: number
  },
): Promise<DepositRow> {
  const [row] = await db<DepositRow[]>`
    insert into deposits (tenant_id, user_id, gateway_config_id, flow_type, amount_minor)
    values (${input.tenantId}, ${input.userId}, ${input.gatewayConfigId},
            ${input.flowType}, ${input.amountMinor})
    returning deposit_id, tenant_id, user_id, flow_type, amount_minor, status
  `
  if (!row) throw new Error('Deposit insert returned no row')
  return row
}

export async function findDeposit(
  tenantId: string,
  depositId: string,
): Promise<DepositRow | undefined> {
  const [row] = await sql<DepositRow[]>`
    select deposit_id, tenant_id, user_id, flow_type, amount_minor, status
    from deposits
    where deposit_id = ${depositId} and tenant_id = ${tenantId}
  `
  return row
}

/**
 * Reads the row and holds it until the transaction ends.
 *
 * Without the lock, two approvals both read PENDING_APPROVAL, both write
 * APPROVED and both credit — one deposit, two credits, and a ledger that
 * reconciles perfectly against a balance that is wrong.
 */
export async function lockDeposit(
  tx: TransactionSql,
  tenantId: string,
  depositId: string,
): Promise<DepositRow | undefined> {
  const [row] = await tx<DepositRow[]>`
    select deposit_id, tenant_id, user_id, flow_type, amount_minor, status
    from deposits
    where deposit_id = ${depositId} and tenant_id = ${tenantId}
    for update
  `
  return row
}

export async function markDecided(
  tx: TransactionSql,
  input: { depositId: string; status: 'APPROVED' | 'REJECTED'; decidedBy: string },
): Promise<void> {
  await tx`
    update deposits
       set status = ${input.status}, decided_by = ${input.decidedBy}, decided_at = now()
     where deposit_id = ${input.depositId}
  `
}

export async function listDeposits(input: {
  tenantId: string
  userId?: string
}): Promise<{ rows: DepositRow[]; pending: number; completed: number }> {
  const rows = await sql<DepositRow[]>`
    select deposit_id, tenant_id, user_id, flow_type, amount_minor, status
    from deposits
    where tenant_id = ${input.tenantId}
      ${input.userId ? sql`and user_id = ${input.userId}` : sql``}
    order by created_at desc
    limit 200
  `

  return {
    rows,
    pending: rows.filter((row) => row.status === 'PENDING_APPROVAL').length,
    completed: rows.filter((row) => row.status === 'APPROVED').length,
  }
}
