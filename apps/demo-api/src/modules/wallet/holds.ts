import { sql } from '../../db.js'
import type { TransactionSql } from 'postgres'

export interface HoldRow {
  hold_id: string
  wallet_id: string
  reference_id: string
  type: string
  amount_minor: string
  requirement_minor: string
  progress_minor: string
  status: 'ACTIVE' | 'RELEASED' | 'FORFEITED' | 'EXPIRED'
  expires_at: Date
}

const columns = sql`
  hold_id, wallet_id, reference_id, type, amount_minor,
  requirement_minor, progress_minor, status, expires_at
`

export async function insertHold(
  tx: TransactionSql,
  input: {
    walletId: string
    tenantId: string
    referenceId: string
    amountMinor: number
    requirementMinor: number
    expiresAt: Date
  },
): Promise<HoldRow> {
  const [row] = await tx<HoldRow[]>`
    insert into holds (wallet_id, tenant_id, reference_id, type, amount_minor,
                       requirement_minor, expires_at)
    values (${input.walletId}, ${input.tenantId}, ${input.referenceId}, 'PROMOTION',
            ${input.amountMinor}, ${input.requirementMinor}, ${input.expiresAt})
    returning ${columns}
  `
  if (!row) throw new Error('Hold insert returned no row')
  return row
}

export async function listHolds(walletId: string): Promise<HoldRow[]> {
  return sql<HoldRow[]>`
    select ${columns} from holds where wallet_id = ${walletId} order by created_at desc
  `
}

/** Locked, because the worker and an administrator can settle the same hold. */
export async function lockActiveHolds(
  tx: TransactionSql,
  walletId: string,
): Promise<HoldRow[]> {
  return tx<HoldRow[]>`
    select ${columns} from holds
    where wallet_id = ${walletId} and status = 'ACTIVE'
    order by created_at asc
    for update
  `
}

export async function lockHold(
  tx: TransactionSql,
  tenantId: string,
  holdId: string,
): Promise<HoldRow | undefined> {
  const [row] = await tx<HoldRow[]>`
    select ${columns} from holds
    where hold_id = ${holdId} and tenant_id = ${tenantId}
    for update
  `
  return row
}

export async function updateHold(
  tx: TransactionSql,
  input: {
    holdId: string
    progressMinor: number
    status: 'ACTIVE' | 'RELEASED' | 'FORFEITED' | 'EXPIRED'
  },
): Promise<void> {
  await tx`
    update holds
       set progress_minor = ${input.progressMinor},
           status = ${input.status},
           settled_at = ${input.status === 'ACTIVE' ? null : sql`now()`}
     where hold_id = ${input.holdId}
  `
}
