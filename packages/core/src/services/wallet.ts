import type { ApiClient } from '../client.js'
import * as contracts from '../contracts.js'
import { contract } from '../contracts.js'
import { z } from 'zod'

export interface Balance {
  currency: string
  available: number
}

export interface Transaction {
  transactionId: string
  referenceId: string
  type: string
  amount: number
  createdAt: string
}

export interface Hold {
  holdId: string
  referenceId: string
  type: string
  amount: number
  requirement: number
  progress: number
  status: 'ACTIVE' | 'RELEASED' | 'FORFEITED' | 'EXPIRED'
  expiresAt: string
}

/** Ledger total vs recorded balance. A mismatch is a bug by definition. */
export interface Reconciliation {
  balance: number
  ledgerTotal: number
  balanced: boolean
}

export class WalletService {
  constructor(private readonly api: ApiClient) {}

  async balance(): Promise<number> {
    const body = await this.api.get('/wallet/balance')
    return contract('GET /wallet/balance', contracts.balance, body).available
  }

  async transactions(): Promise<Transaction[]> {
    const body = await this.api.get('/wallet/transactions')
    return contract('GET /wallet/transactions', z.array(contracts.transaction), body)
  }

  async reconciliation(): Promise<Reconciliation> {
    const body = await this.api.get('/wallet/reconciliation')
    return contract('GET /wallet/reconciliation', contracts.reconciliation, body)
  }

  async holds(): Promise<Hold[]> {
    const body = await this.api.get('/wallet/holds')
    return contract('GET /wallet/holds', z.array(contracts.hold), body)
  }

  /**
   * Spend from the account.
   *
   * The debit is immediate. The progress it earns towards a hold is applied by
   * a background job, so read progress with `expect.poll`, never straight back.
   */
  async spend(input: { amount: number; reason: string }): Promise<Transaction> {
    const body = await this.api.post('/wallet/spend', { body: { ...input } })
    return contract('POST /wallet/spend', contracts.transaction, body)
  }

  // ---- admin surface -------------------------------------------------------

  /** Credit (positive) or debit (negative) an account. Administrators only. */
  async adjust(input: { userId: string; amount: number; reason: string }): Promise<Transaction> {
    const body = await this.api.post('/wallet/admin/adjustments', { body: { ...input } })
    return contract('POST /wallet/admin/adjustments', contracts.transaction, body)
  }

  async terminateHold(holdId: string): Promise<Hold> {
    const body = await this.api.post(`/wallet/admin/holds/${holdId}/terminate`)
    return contract('POST /wallet/admin/holds/:id/terminate', contracts.hold, body)
  }
}
