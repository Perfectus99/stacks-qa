import { sql } from '../../db.js'

export interface Account {
  userId: string
  tenantId: string
  currency: string
}

/**
 * The narrow, published view of a user that other modules may read.
 *
 * Deliberately not the repository: modules see what this file chooses to
 * expose, and nothing else. Widening it should feel like a decision.
 */
export async function accountOf(userId: string): Promise<Account | undefined> {
  const [row] = await sql<{ user_id: string; tenant_id: string; currency: string }[]>`
    select user_id, tenant_id, currency from users where user_id = ${userId}
  `
  return row ? { userId: row.user_id, tenantId: row.tenant_id, currency: row.currency } : undefined
}

export async function currencyOf(userId: string): Promise<string> {
  const account = await accountOf(userId)
  if (!account) throw new Error(`No user ${userId}`)
  return account.currency
}
