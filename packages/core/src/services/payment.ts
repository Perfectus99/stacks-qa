import type { ApiClient } from '../client.js'
import * as contracts from '../contracts.js'
import { contract } from '../contracts.js'
import { z } from 'zod'

export type FlowType = 'BANK_TRANSFER' | 'QR_TRANSFER'
export type DepositStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'

export interface PaymentMethod {
  gatewayConfigId: string
  flowType: FlowType
  displayName: string
}

export interface Deposit {
  depositId: string
  status: DepositStatus
  flowType: FlowType
  amount: number
  userId: string
  hasBonus: boolean
  bonusAmount: number
  releaseRequirement: number
}

export interface DepositSummary {
  deposits: Deposit[]
  summary: { pendingCount: number; completedCount: number }
}

export class PaymentService {
  constructor(private readonly api: ApiClient) {}

  async methods(flowType: FlowType): Promise<PaymentMethod> {
    const options = contract(
      'GET /payment/methods',
      z.array(contracts.paymentMethod),
      await this.api.get('/payment/methods'),
    )
    const match = options.find((option) => option.flowType === flowType)
    if (!match) {
      throw new Error(
        `No payment method with flowType ${flowType}. Available: ${options.map((o) => o.flowType).join(', ') || 'none'}`,
      )
    }
    return match
  }

  async submitDeposit(input: {
    amount: number
    gatewayConfigId: string
    promotionCode?: string
  }): Promise<Deposit> {
    const body = await this.api.post('/payment/deposits', { body: { ...input } })
    return contract('POST /payment/deposits', contracts.deposit, body)
  }

  // ---- admin surface -------------------------------------------------------

  /**
   * Filtering by account is not a convenience. The summary counters are shared
   * across everything in the tenant, so an unfiltered before/after comparison
   * is only stable when nothing else is running — which is never true of a
   * parallel suite.
   */
  async listDeposits(filter: { userId?: string } = {}): Promise<DepositSummary> {
    const body = await this.api.get('/payment/admin/deposits', { query: filter })
    return contract('GET /payment/admin/deposits', contracts.depositSummary, body)
  }

  async viewDeposit(depositId: string): Promise<Deposit> {
    const body = await this.api.get(`/payment/admin/deposits/${depositId}`)
    return contract('GET /payment/admin/deposits/:id', contracts.deposit, body)
  }

  approveDeposit(depositId: string): Promise<{ success: boolean }> {
    return this.api.patch(`/payment/admin/deposits/${depositId}`, {
      body: { status: 'APPROVED' },
    })
  }

  rejectDeposit(depositId: string, reason = 'not verified'): Promise<{ success: boolean }> {
    return this.api.patch(`/payment/admin/deposits/${depositId}`, {
      body: { status: 'REJECTED', reason },
    })
  }
}
