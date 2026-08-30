export interface PromotionRule {
  promotionId: string
  code: string
  promotionType: 'PERCENTAGE' | 'FIXED'
  bonusPercent: number | null
  bonusFixedMinor: number | null
  minDepositMinor: number
  maxBonusMinor: number | null
  releaseMultiplier: number
  active: boolean
  startsAt: Date | null
  endsAt: Date | null
}

export interface Verdict {
  eligible: boolean
  bonusMinor: number
  releaseRequirementMinor: number
  reason?: string
}

/**
 * The single place a bonus is decided.
 *
 * Called twice for every promotional deposit — once as a preview when it is
 * submitted, once for real when it is approved — because the answer can change
 * in between. One function, so the two moments cannot drift apart; pure, so the
 * awkward cases are testable without a database or a clock.
 */
export function evaluate(rule: PromotionRule, amountMinor: number, now: Date): Verdict {
  const no = (reason: string): Verdict => ({
    eligible: false,
    bonusMinor: 0,
    releaseRequirementMinor: 0,
    reason,
  })

  if (!rule.active) return no('This promotion is no longer running')
  if (rule.startsAt && now < rule.startsAt) return no('This promotion has not started yet')
  if (rule.endsAt && now >= rule.endsAt) return no('This promotion has ended')
  if (amountMinor < rule.minDepositMinor) return no('This deposit is below the promotion minimum')

  const raw =
    rule.promotionType === 'PERCENTAGE'
      ? Math.floor((amountMinor * (rule.bonusPercent ?? 0)) / 100)
      : (rule.bonusFixedMinor ?? 0)

  const bonusMinor = rule.maxBonusMinor === null ? raw : Math.min(raw, rule.maxBonusMinor)
  if (bonusMinor <= 0) return no('This promotion awards nothing on this deposit')

  return {
    eligible: true,
    bonusMinor,
    releaseRequirementMinor: (amountMinor + bonusMinor) * rule.releaseMultiplier,
  }
}
