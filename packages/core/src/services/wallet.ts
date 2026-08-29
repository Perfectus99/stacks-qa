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
}
