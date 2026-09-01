import type { TransactionSql } from 'postgres'
import { insertLedgerEntry, openWallet } from './repository.js'

/**
 * The narrow, published way for another module to move money.
 *
 * It takes the caller's transaction rather than opening its own, so the ledger
 * entry commits with whatever the caller is doing — a deposit that is marked
 * approved but never credited is the failure this shape exists to prevent.
 *
 * Callers get this function and nothing else. The repository stays private to
 * the wallet module.
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
