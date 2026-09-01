import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applySpend, type HoldState } from './progress.js'

const NOW = new Date('2026-06-15T12:00:00Z')
const LATER = new Date('2026-06-20T12:00:00Z')

function hold(overrides: Partial<HoldState> = {}): HoldState {
  return {
    requirementMinor: 100_00,
    progressMinor: 0,
    expiresAt: LATER,
    status: 'ACTIVE',
    ...overrides,
  }
}

describe('hold progress', () => {
  it('accumulates without releasing while short of the requirement', () => {
    const outcome = applySpend(hold(), 40_00, NOW)
    assert.equal(outcome.kind, 'UNCHANGED')
    assert.equal(outcome.progressMinor, 40_00)
  })

  it('releases when the requirement is met exactly', () => {
    const outcome = applySpend(hold({ progressMinor: 60_00 }), 40_00, NOW)
    assert.equal(outcome.kind, 'RELEASED')
    assert.equal(outcome.progressMinor, 100_00)
  })

  it('releases when the requirement is passed', () => {
    assert.equal(applySpend(hold(), 250_00, NOW).kind, 'RELEASED')
  })

  it('expires rather than releasing when the deadline has passed', () => {
    // Enough spend to clear the requirement, arriving too late. Releasing here
    // would pay out on activity the deadline exists to exclude.
    const outcome = applySpend(hold({ expiresAt: NOW }), 500_00, NOW)
    assert.equal(outcome.kind, 'EXPIRED')
  })

  it('treats the deadline itself as too late', () => {
    assert.equal(applySpend(hold({ expiresAt: NOW }), 100_00, NOW).kind, 'EXPIRED')
    assert.equal(
      applySpend(hold({ expiresAt: new Date(NOW.getTime() + 1) }), 100_00, NOW).kind,
      'RELEASED',
    )
  })

  it('leaves a settled hold alone', () => {
    for (const status of ['RELEASED', 'FORFEITED', 'EXPIRED'] as const) {
      assert.equal(applySpend(hold({ status }), 500_00, NOW).kind, 'UNCHANGED')
    }
  })

  it('ignores a negative spend rather than winding progress back', () => {
    const outcome = applySpend(hold({ progressMinor: 30_00 }), -50_00, NOW)
    assert.equal(outcome.progressMinor, 30_00)
  })

  it('releases immediately when nothing is required', () => {
    assert.equal(applySpend(hold({ requirementMinor: 0 }), 0, NOW).kind, 'RELEASED')
  })
})
