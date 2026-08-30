import { test, expect } from '../../fixtures/index.js'
import { makePromotion } from '@stacks/test-data'

test.describe('the promotion catalogue', () => {
  test('lists a running promotion @p0 @smoke @promotion', async ({ player, admin }) => {
    const promotion = await makePromotion(admin, { name: 'Half back' })

    const listed = await player.client.promotion.list()

    expect(listed).toContainEqual(
      expect.objectContaining({ code: promotion.code, name: 'Half back' }),
    )
  })

  test('omits a withdrawn promotion @p0 @promotion', async ({ player, admin }) => {
    const promotion = await makePromotion(admin)
    await admin.promotion.setActive(promotion.promotionId, false)

    const codes = (await player.client.promotion.list()).map((p) => p.code)

    expect(codes).not.toContain(promotion.code)
  })

  test('the catalogue requires a session @negative @security @promotion', async ({
    anonymous,
  }) => {
    expect(await anonymous.status('GET', '/promotion/promotions')).toBe(401)
  })

  test('creating a promotion requires an administrator @negative @security @promotion', async ({
    player,
  }) => {
    expect(
      await player.client.status('POST', '/promotion/admin/promotions', {
        body: { code: 'MINE', name: 'Mine', promotionType: 'FIXED', bonusAmount: 1000 },
      }),
    ).toBe(403)
  })
})
