import type { TransactionSql } from 'postgres'
import { insertHold } from './holds.js'
import { insertLedgerEntry, openWallet } from './repository.js'

/**
 * The narrow, published surface other modules may use.
 *
 * Both functions take the caller's transaction rather than opening their own,
 * so what they write commits with whatever the caller is doing — a deposit
 * marked approved but never credited, or a bonus paid with no hold against it,
 * are the failures this shape prevents.
 *
 * Callers get these two functions. The repository stays private to the module.
 */

export async function creditAccount(
  tx: TransactionSql,
  input: {
    userId: string
    tenantId: string
    currency: string
    referenceId: string
    type: string
    amountMinor: number
  },
): Promise<void> {
  const wallet = await openWallet(tx, {
    userId: input.userId,
    tenantId: input.tenantId,
    currency: input.currency,
  })

  await insertLedgerEntry(tx, {
    walletId: wallet.wallet_id,
    referenceId: input.referenceId,
    type: input.type,
    amountMinor: input.amountMinor,
  })
}

/** Place a hold over bonus money that is in the account but not yet earned. */
export async function placeHold(
  tx: TransactionSql,
  input: {
    userId: string
    tenantId: string
    currency: string
    referenceId: string
    amountMinor: number
    requirementMinor: number
    expiresAt: Date
  },
): Promise<void> {
  const wallet = await openWallet(tx, {
    userId: input.userId,
    tenantId: input.tenantId,
    currency: input.currency,
  })

  await insertHold(tx, {
    walletId: wallet.wallet_id,
    tenantId: input.tenantId,
    referenceId: input.referenceId,
    amountMinor: input.amountMinor,
    requirementMinor: input.requirementMinor,
    expiresAt: input.expiresAt,
  })
}
