import type { ApiClient } from '../client.js'

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
    const { available } = await this.api.get<Balance>('/wallet/balance')
    return available
  }

  transactions(): Promise<Transaction[]> {
    return this.api.get<Transaction[]>('/wallet/transactions')
  }

  reconciliation(): Promise<Reconciliation> {
    return this.api.get<Reconciliation>('/wallet/reconciliation')
  }

  holds(): Promise<Hold[]> {
    return this.api.get<Hold[]>('/wallet/holds')
  }

  /**
   * Spend from the account.
   *
   * The debit is immediate. The progress it earns towards a hold is applied by
   * a background job, so read progress with `expect.poll`, never straight back.
   */
  spend(input: { amount: number; reason: string }): Promise<Transaction> {
    return this.api.post<Transaction>('/wallet/spend', { body: { ...input } })
  }

  // ---- admin surface -------------------------------------------------------

  /** Credit (positive) or debit (negative) an account. Administrators only. */
  adjust(input: { userId: string; amount: number; reason: string }): Promise<Transaction> {
    return this.api.post<Transaction>('/wallet/admin/adjustments', { body: { ...input } })
  }

  terminateHold(holdId: string): Promise<Hold> {
    return this.api.post<Hold>(`/wallet/admin/holds/${holdId}/terminate`)
  }
}
