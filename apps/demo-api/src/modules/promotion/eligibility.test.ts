import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { evaluate, type PromotionRule } from './eligibility.js'

const NOW = new Date('2026-06-15T12:00:00Z')

function rule(overrides: Partial<PromotionRule> = {}): PromotionRule {
  return {
    promotionId: 'p1',
    code: 'WELCOME',
    promotionType: 'PERCENTAGE',
    bonusPercent: 50,
    bonusFixedMinor: null,
    minDepositMinor: 10_00,
    maxBonusMinor: null,
    releaseMultiplier: 1,
    active: true,
    startsAt: null,
    endsAt: null,
    ...overrides,
  }
}

/**
 * The rule is pure, so the cases that are awkward to reach through the API —
 * boundaries, clocks, rounding — are cheap to cover here instead.
 */
describe('promotion eligibility', () => {
  it('awards a percentage of the deposit', () => {
    const verdict = evaluate(rule(), 100_00, NOW)
    assert.equal(verdict.eligible, true)
    assert.equal(verdict.bonusMinor, 50_00)
  })

  it('awards a fixed amount regardless of the deposit', () => {
    const verdict = evaluate(
      rule({ promotionType: 'FIXED', bonusPercent: null, bonusFixedMinor: 25_00 }),
      500_00,
      NOW,
    )
    assert.equal(verdict.bonusMinor, 25_00)
  })

  it('caps the bonus', () => {
    const verdict = evaluate(rule({ maxBonusMinor: 20_00 }), 100_00, NOW)
    assert.equal(verdict.bonusMinor, 20_00)
  })

  it('treats the minimum as inclusive', () => {
    assert.equal(evaluate(rule(), 10_00, NOW).eligible, true)
    assert.equal(evaluate(rule(), 9_99, NOW).eligible, false)
  })

  it('treats the end of the window as exclusive', () => {
    const endsAt = new Date(NOW)
    assert.equal(evaluate(rule({ endsAt }), 100_00, NOW).eligible, false)
    assert.equal(
      evaluate(rule({ endsAt: new Date(NOW.getTime() + 1) }), 100_00, NOW).eligible,
      true,
    )
  })

  it('refuses a withdrawn promotion', () => {
    const verdict = evaluate(rule({ active: false }), 100_00, NOW)
    assert.equal(verdict.eligible, false)
    assert.match(verdict.reason ?? '', /no longer running/)
  })

  it('rounds a fractional bonus down rather than inventing a fraction of a unit', () => {
    // 33% of 10.01 is 3.3033 — the extra cannot exist in minor units.
    const verdict = evaluate(rule({ bonusPercent: 33, minDepositMinor: 0 }), 10_01, NOW)
    assert.equal(verdict.bonusMinor, 330)
  })

  it('refuses a promotion that would award nothing', () => {
    const verdict = evaluate(rule({ bonusPercent: 0, minDepositMinor: 0 }), 100_00, NOW)
    assert.equal(verdict.eligible, false)
  })

  it('multiplies the release requirement by deposit plus bonus', () => {
    const verdict = evaluate(rule({ releaseMultiplier: 3 }), 100_00, NOW)
    assert.equal(verdict.releaseRequirementMinor, (100_00 + 50_00) * 3)
  })
})
