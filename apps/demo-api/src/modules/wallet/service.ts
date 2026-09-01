import { randomUUID } from 'node:crypto'
import { sql } from '../../db.js'
import { ApiError } from '../../errors.js'
import { toMajor, toMinor } from '../../money.js'
import type { Principal } from '../../plugins/auth.js'
import { accountOf } from '../user/directory.js'
import { enqueue } from '../../jobs/queue.js'
import { applySpend } from './progress.js'
import { listHolds, lockActiveHolds, lockHold, updateHold, type HoldRow } from './holds.js'
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

// ---- holds ------------------------------------------------------------------

export interface Hold {
  holdId: string
  referenceId: string
  type: string
  amount: number
  requirement: number
  progress: number
  status: string
  expiresAt: string
}

function presentHold(row: HoldRow): Hold {
  return {
    holdId: row.hold_id,
    referenceId: row.reference_id,
    type: row.type,
    amount: toMajor(row.amount_minor),
    requirement: toMajor(row.requirement_minor),
    progress: toMajor(row.progress_minor),
    status: row.status,
    expiresAt: row.expires_at.toISOString(),
  }
}

export async function holds(principal: Principal, currency: string): Promise<Hold[]> {
  const wallet = await walletFor(principal, currency)
  return (await listHolds(wallet.wallet_id)).map(presentHold)
}

/**
 * Spend from the account.
 *
 * The debit is immediate; the progress it earns towards any hold is not. The
 * recalculation is queued, so a caller reading progress straight back may still
 * see the figure from before this spend — see jobs/queue.ts for why that is
 * deliberate.
 */
export async function spend(
  principal: Principal,
  currency: string,
  input: { amount: number; reason: string },
): Promise<Transaction> {
  const amountMinor = toMinor(input.amount)
  if (amountMinor <= 0) {
    throw new ApiError(400, 'INVALID_REQUEST', 'A spend must be for a positive amount')
  }

  const wallet = await walletFor(principal, currency)

  let row
  try {
    row = await sql.begin((tx) =>
      insertLedgerEntry(tx, {
        walletId: wallet.wallet_id,
        referenceId: `spend_${randomUUID()}`,
        type: 'SPEND',
        amountMinor: -amountMinor,
      }),
    )
  } catch (error) {
    if ((error as { code?: string }).code === CHECK_VIOLATION) {
      throw new ApiError(409, 'INSUFFICIENT_FUNDS', 'That spend would overdraw the account')
    }
    throw error
  }

  enqueue('hold-progress', () => applyProgress(wallet.wallet_id, amountMinor))

  return {
    transactionId: row.entry_id,
    referenceId: row.reference_id,
    type: row.type,
    amount: toMajor(row.amount_minor),
    createdAt: row.created_at.toISOString(),
  }
}

/** The queued work: credit qualifying spend against every active hold. */
export async function applyProgress(walletId: string, spendMinor: number): Promise<void> {
  await sql.begin(async (tx) => {
    const active = await lockActiveHolds(tx, walletId)
    const now = new Date()

    for (const row of active) {
      const outcome = applySpend(
        {
          requirementMinor: Number(row.requirement_minor),
          progressMinor: Number(row.progress_minor),
          expiresAt: row.expires_at,
          status: row.status,
        },
        spendMinor,
        now,
      )

      await updateHold(tx, {
        holdId: row.hold_id,
        progressMinor: outcome.progressMinor,
        status: outcome.kind === 'UNCHANGED' ? 'ACTIVE' : outcome.kind,
      })
    }
  })
}

/** An administrator ending a hold early — the money stays, the claim on it goes. */
export async function terminateHold(principal: Principal, holdId: string): Promise<Hold> {
  return sql.begin(async (tx) => {
    const row = await lockHold(tx, principal.tenantId, holdId)
    if (!row) throw new ApiError(404, 'HOLD_NOT_FOUND', 'No such hold')
    if (row.status !== 'ACTIVE') {
      throw new ApiError(409, 'ALREADY_SETTLED', `This hold is already ${row.status.toLowerCase()}`)
    }

    await updateHold(tx, {
      holdId: row.hold_id,
      progressMinor: Number(row.progress_minor),
      status: 'FORFEITED',
    })

    return presentHold({ ...row, status: 'FORFEITED' })
  })
}
