import { randomUUID } from 'node:crypto'
import { sql } from '../../db.js'
import { ApiError } from '../../errors.js'
import { toMajor, toMinor } from '../../money.js'
import type { Principal } from '../../plugins/auth.js'
import { accountOf } from '../user/directory.js'
import {
  insertLedgerEntry,
  ledgerTotalMinor,
  listLedgerEntries,
  openWallet,
  type WalletRow,
} from './repository.js'

/** Postgres raises 23514 when a CHECK fails — here, only the non-negative one. */
const CHECK_VIOLATION = '23514'

export interface Transaction {
  transactionId: string
  referenceId: string
  type: string
  amount: number
  createdAt: string
}

async function walletFor(principal: Principal, currency: string): Promise<WalletRow> {
  return openWallet(sql, {
    userId: principal.userId,
    tenantId: principal.tenantId,
    currency,
  })
}

export async function balance(
  principal: Principal,
  currency: string,
): Promise<{ currency: string; available: number }> {
  const wallet = await walletFor(principal, currency)
  return { currency: wallet.currency, available: toMajor(wallet.balance_minor) }
}

export async function transactions(
  principal: Principal,
  currency: string,
): Promise<Transaction[]> {
  const wallet = await walletFor(principal, currency)
  const rows = await listLedgerEntries(wallet.wallet_id)

  return rows.map((row) => ({
    transactionId: row.entry_id,
    referenceId: row.reference_id,
    type: row.type,
    amount: toMajor(row.amount_minor),
    createdAt: row.created_at.toISOString(),
  }))
}

export async function reconciliation(
  principal: Principal,
  currency: string,
): Promise<{ balance: number; ledgerTotal: number; balanced: boolean }> {
  const wallet = await walletFor(principal, currency)
  const total = await ledgerTotalMinor(wallet.wallet_id)
  const recorded = Number(wallet.balance_minor)

  return {
    balance: toMajor(recorded),
    ledgerTotal: toMajor(total),
    balanced: recorded === total,
  }
}

/**
 * Credit or debit an account.
 *
 * The entry and the balance move together because the balance is maintained by
 * a trigger on the insert. A rejected debit therefore leaves nothing behind:
 * the CHECK fires inside the same statement, and the transaction takes the
 * ledger row with it.
 *
 * An adjustment counts as a first use, so it opens the wallet if there is not
 * one yet. Requiring the account holder to look at their balance before anyone
 * could fund it is an ordering nobody would design on purpose.
 *
 * The tenant is checked against the *account*, not the wallet, so a
 * cross-tenant adjustment is refused before anything is created.
 */
export async function adjust(input: {
  targetUserId: string
  tenantId: string
  amount: number
  reason: string
}): Promise<Transaction> {
  const amountMinor = toMinor(input.amount)
  if (amountMinor === 0) {
    throw new ApiError(400, 'INVALID_REQUEST', 'An adjustment of zero changes nothing')
  }

  const account = await accountOf(input.targetUserId)
  if (!account) {
    throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'No such account')
  }
  if (account.tenantId !== input.tenantId) {
    throw ApiError.forbidden('That account belongs to another tenant')
  }

  try {
    const row = await sql.begin(async (tx) => {
      const wallet = await openWallet(tx, {
        userId: account.userId,
        tenantId: account.tenantId,
        currency: account.currency,
      })

      return insertLedgerEntry(tx, {
        walletId: wallet.wallet_id,
        referenceId: `adj_${randomUUID()}`,
        type: 'ADJUSTMENT',
        amountMinor,
      })
    })

    return {
      transactionId: row.entry_id,
      referenceId: row.reference_id,
      type: row.type,
      amount: toMajor(row.amount_minor),
      createdAt: row.created_at.toISOString(),
    }
  } catch (error) {
    if ((error as { code?: string }).code === CHECK_VIOLATION) {
      throw new ApiError(409, 'INSUFFICIENT_FUNDS', 'That debit would overdraw the account')
    }
    throw error
  }
}
