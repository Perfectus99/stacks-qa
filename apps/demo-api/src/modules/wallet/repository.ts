import { sql } from '../../db.js'
import type { Sql, TransactionSql } from 'postgres'

export interface WalletRow {
  wallet_id: string
  user_id: string
  tenant_id: string
  currency: string
  balance_minor: string
}

export interface LedgerRow {
  entry_id: string
  reference_id: string
  type: string
  amount_minor: string
  created_at: Date
}

type Db = Sql | TransactionSql

/**
 * Wallets are opened on first use rather than at registration.
 *
 * The alternative is the user module reaching into wallet's tables, which is
 * the boundary this layout exists to keep. `on conflict do nothing` makes two
 * concurrent first-uses safe.
 */
export async function openWallet(
  db: Db,
  input: { userId: string; tenantId: string; currency: string },
): Promise<WalletRow> {
  await db`
    insert into wallets (user_id, tenant_id, currency)
    values (${input.userId}, ${input.tenantId}, ${input.currency})
    on conflict (user_id) do nothing
  `
  const [row] = await db<WalletRow[]>`
    select wallet_id, user_id, tenant_id, currency, balance_minor
    from wallets where user_id = ${input.userId}
  `
  if (!row) throw new Error('Wallet missing immediately after opening it')
  return row
}

export async function insertLedgerEntry(
  db: Db,
  input: { walletId: string; referenceId: string; type: string; amountMinor: number },
): Promise<LedgerRow> {
  const [row] = await db<LedgerRow[]>`
    insert into ledger_entries (wallet_id, reference_id, type, amount_minor)
    values (${input.walletId}, ${input.referenceId}, ${input.type}, ${input.amountMinor})
    returning entry_id, reference_id, type, amount_minor, created_at
  `
  if (!row) throw new Error('Ledger insert returned no row')
  return row
}

export async function listLedgerEntries(walletId: string): Promise<LedgerRow[]> {
  return sql<LedgerRow[]>`
    select entry_id, reference_id, type, amount_minor, created_at
    from ledger_entries
    where wallet_id = ${walletId}
    order by created_at asc, entry_id asc
  `
}

export async function ledgerTotalMinor(walletId: string): Promise<number> {
  const [row] = await sql<{ total: string }[]>`
    select coalesce(sum(amount_minor), 0)::text as total
    from ledger_entries where wallet_id = ${walletId}
  `
  return Number(row?.total ?? 0)
}
