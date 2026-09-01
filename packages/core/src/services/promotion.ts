import type { ApiClient } from '../client.js'
import * as contracts from '../contracts.js'
import { contract } from '../contracts.js'
import { z } from 'zod'

export interface PromotionSummary {
  promotionId: string
  code: string
  name: string
  promotionType: 'PERCENTAGE' | 'FIXED'
  minDeposit: number
}

export interface BonusPreview {
  code: string
  eligible: boolean
  hasBonus: boolean
  bonusAmount: number
  totalAmount: number
  releaseRequirement: number
  reason: string | null
}

export interface NewPromotion {
  code: string
  name: string
  promotionType: 'PERCENTAGE' | 'FIXED'
  bonusPercent?: number | null
  bonusAmount?: number | null
  minDeposit?: number
  maxBonus?: number | null
  releaseMultiplier?: number
  /** Days before the hold over the bonus expires. 0 opens it already expired. */
  holdDays?: number
}

export class PromotionService {
  constructor(private readonly api: ApiClient) {}

  async list(): Promise<PromotionSummary[]> {
    const body = await this.api.get('/promotion/promotions')
    return contract('GET /promotion/promotions', z.array(contracts.promotionSummary), body)
  }

  /** A preview only — it moves nothing and binds nobody. */
  async preview(input: { code: string; amount: number }): Promise<BonusPreview> {
    const body = await this.api.post('/promotion/preview', { body: { ...input } })
    return contract('POST /promotion/preview', contracts.bonusPreview, body)
  }

  // ---- admin surface -------------------------------------------------------

  async create(input: NewPromotion): Promise<{ promotionId: string; code: string }> {
    const body = await this.api.post('/promotion/admin/promotions', { body: { ...input } })
    return contract('POST /promotion/admin/promotions', contracts.createdPromotion, body)
  }

  async remove(promotionId: string): Promise<void> {
    await this.api.delete(`/promotion/admin/promotions/${promotionId}`)
  }

  setActive(promotionId: string, active: boolean): Promise<{ success: boolean }> {
    return this.api.patch(`/promotion/admin/promotions/${promotionId}`, { body: { active } })
  }
}
