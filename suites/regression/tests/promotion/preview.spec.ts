import { test, expect } from '../../fixtures/index.js'

test.describe('previewing a bonus', () => {
  test('a qualifying deposit previews the bonus and the total @p0 @smoke @promotion', async ({
    player,
    newPromotion,
  }) => {
    const promotion = await newPromotion({ bonusPercent: 50, minDeposit: 10 })

    const preview = await player.client.promotion.preview({ code: promotion.code, amount: 100 })

    expect(preview).toMatchObject({
      eligible: true,
      hasBonus: true,
      bonusAmount: 50,
      totalAmount: 150,
    })
  })

  test('a deposit below the minimum is not eligible @p0 @negative @promotion', async ({
    player,
    newPromotion,
  }) => {
    const promotion = await newPromotion({ minDeposit: 100 })

    const preview = await player.client.promotion.preview({ code: promotion.code, amount: 50 })

    expect(preview.eligible).toBe(false)
    expect(preview.bonusAmount).toBe(0)
    expect(preview.reason).toMatch(/minimum/i)
  })

  test('the bonus is capped @p0 @promotion', async ({ player, newPromotion }) => {
    const promotion = await newPromotion({ bonusPercent: 50, maxBonus: 20 })

    const preview = await player.client.promotion.preview({ code: promotion.code, amount: 1000 })

    expect(preview.bonusAmount).toBe(20)
  })

  test('an unknown code is refused @negative @promotion', async ({ player }) => {
    expect(
      await player.client.status('POST', '/promotion/preview', {
        body: { code: 'NOPE-NOT-REAL', amount: 100 },
      }),
    ).toBe(404)
  })

  /** A preview binds nobody — it must not create anything or move money. */
  test('previewing moves nothing @p0 @promotion @wallet', async ({ player, newPromotion }) => {
    const promotion = await newPromotion()

    await player.client.promotion.preview({ code: promotion.code, amount: 100 })

    expect(await player.client.wallet.balance()).toBe(0)
    expect(await player.client.wallet.transactions()).toHaveLength(0)
  })
})
