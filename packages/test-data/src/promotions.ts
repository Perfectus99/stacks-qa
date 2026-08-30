import type { ApiClient, NewPromotion } from '@stacks/core'
import { randomBytes } from 'node:crypto'

export interface SeededPromotion {
  promotionId: string
  code: string
}

/**
 * Create a promotion that belongs to one test.
 *
 * Tests that share a promotion cannot withdraw or expire it without breaking
 * whichever other test is mid-flight, so every test that needs one makes its
 * own. The code is unique for the same reason usernames are.
 */
export async function makePromotion(
  admin: ApiClient,
  overrides: Partial<NewPromotion> = {},
): Promise<SeededPromotion> {
  const code = `P${randomBytes(5).toString('hex').toUpperCase()}`

  const created = await admin.promotion.create({
    code,
    name: 'Test promotion',
    promotionType: 'PERCENTAGE',
    bonusPercent: 50,
    minDeposit: 10,
    releaseMultiplier: 1,
    ...overrides,
  })

  return { promotionId: created.promotionId, code: created.code }
}
