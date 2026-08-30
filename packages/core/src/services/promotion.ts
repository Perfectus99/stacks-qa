import type { ApiClient } from '../client.js'

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
}

export class PromotionService {
  constructor(private readonly api: ApiClient) {}

  list(): Promise<PromotionSummary[]> {
    return this.api.get<PromotionSummary[]>('/promotion/promotions')
  }

  /** A preview only — it moves nothing and binds nobody. */
  preview(input: { code: string; amount: number }): Promise<BonusPreview> {
    return this.api.post<BonusPreview>('/promotion/preview', { body: { ...input } })
  }

  // ---- admin surface -------------------------------------------------------

  create(input: NewPromotion): Promise<{ promotionId: string; code: string }> {
    return this.api.post('/promotion/admin/promotions', { body: { ...input } })
  }

  setActive(promotionId: string, active: boolean): Promise<{ success: boolean }> {
    return this.api.patch(`/promotion/admin/promotions/${promotionId}`, { body: { active } })
  }
}
