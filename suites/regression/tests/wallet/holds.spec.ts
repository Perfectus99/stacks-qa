import { test, expect } from '../../fixtures/index.js'
import type { ApiClient, Hold, NewPromotion } from '@stacks/core'
import type { Player, SeededPromotion } from '@stacks/test-data'

/** Deposit 100 with a 50% bonus: 150 credited, 150 required to release. */
async function fundedWithBonus(
  player: Player,
  admin: ApiClient,
  newPromotion: (o?: Partial<NewPromotion>) => Promise<SeededPromotion>,
  overrides: Partial<NewPromotion> = {},
): Promise<{ depositId: string }> {
  return test.step('Given an approved deposit of 100 carrying a 50 bonus', async () => {
  const promotion = await newPromotion({
    bonusPercent: 50,
    minDeposit: 10,
    releaseMultiplier: 1,
    ...overrides,
  })
  const method = await player.client.payment.methods('BANK_TRANSFER')
  const deposit = await player.client.payment.submitDeposit({
    amount: 100,
    gatewayConfigId: method.gatewayConfigId,
    promotionCode: promotion.code,
  })
  await admin.payment.approveDeposit(deposit.depositId)
  return { depositId: deposit.depositId }
  })
}

/**
 * Progress is applied by a background job, so every read of it polls. Reading
 * it once straight after a spend is the mistake this shape exists to avoid —
 * it would pass on a fast machine and fail on a loaded one.
 */
function holdFor(player: Player, depositId: string) {
  return expect
    .poll(async () => {
      const holds = await player.client.wallet.holds()
      return holds.find((hold) => hold.referenceId === depositId)
    })
    .toBeDefined()
}

async function currentHold(player: Player, depositId: string): Promise<Hold> {
  const holds = await player.client.wallet.holds()
  const hold = holds.find((h) => h.referenceId === depositId)
  if (!hold) throw new Error(`No hold for deposit ${depositId}`)
  return hold
}

test.describe('holds', () => {
  test('an approved bonus is held with a release requirement @p0 @wallet @promotion', async ({
    player,
    admin,
    newPromotion,
  }) => {
    const { depositId } = await fundedWithBonus(player, admin, newPromotion)
    await holdFor(player, depositId)

    const hold = await currentHold(player, depositId)
    expect(hold).toMatchObject({
      type: 'PROMOTION',
      amount: 50,
      requirement: 150,
      progress: 0,
      status: 'ACTIVE',
    })

    // The money is in the account. The claim over it is what the hold records.
    expect(await player.client.wallet.balance()).toBe(150)
  })

  test('qualifying spend releases the hold once the requirement is met @p0 @wallet', async ({
    player,
    admin,
    newPromotion,
  }) => {
    const { depositId } = await fundedWithBonus(player, admin, newPromotion)
    await holdFor(player, depositId)

    await test.step('When the player spends the full requirement of 150', async () => {
      await player.client.wallet.spend({ amount: 150, reason: 'qualifying spend' })
    })

    await test.step('Then the hold is released once the job catches up', async () => {
      await expect
        .poll(async () => (await currentHold(player, depositId)).status)
        .toBe('RELEASED')
      expect((await currentHold(player, depositId)).progress).toBe(150)
    })
  })

  test('spend short of the requirement leaves the hold in place @p0 @wallet', async ({
    player,
    admin,
    newPromotion,
  }) => {
    const { depositId } = await fundedWithBonus(player, admin, newPromotion)
    await holdFor(player, depositId)

    await test.step('When the player spends 60 of the 150 required', async () => {
      await player.client.wallet.spend({ amount: 60, reason: 'partial' })
    })

    await test.step('Then progress moves but the hold stays in place', async () => {
      await expect.poll(async () => (await currentHold(player, depositId)).progress).toBe(60)
      expect((await currentHold(player, depositId)).status).toBe('ACTIVE')
    })
  })

  /**
   * Spend arriving after the deadline must not rescue a hold, even when it
   * would otherwise have been enough. `holdDays: 0` opens the hold already past
   * its deadline, which makes the case deterministic instead of a wait.
   */
  test('a hold past its deadline expires rather than releasing @p0 @negative @wallet', async ({
    player,
    admin,
    newPromotion,
  }) => {
    const { depositId } = await fundedWithBonus(player, admin, newPromotion, { holdDays: 0 })
    await holdFor(player, depositId)

    await test.step('When enough spend arrives, but after the deadline', async () => {
      await player.client.wallet.spend({ amount: 150, reason: 'too late' })
    })

    await test.step('Then the hold expires rather than releasing', async () => {
      await expect
        .poll(async () => (await currentHold(player, depositId)).status)
        .toBe('EXPIRED')
    })
  })

  test('an administrator can end a hold early @p0 @wallet', async ({ player, admin, newPromotion }) => {
    const { depositId } = await fundedWithBonus(player, admin, newPromotion)
    await holdFor(player, depositId)
    const hold = await currentHold(player, depositId)

    const terminated = await admin.wallet.terminateHold(hold.holdId)
    expect(terminated.status).toBe('FORFEITED')

    // Ending the claim does not take the money back.
    expect(await player.client.wallet.balance()).toBe(150)
    expect((await currentHold(player, depositId)).status).toBe('FORFEITED')
  })

  test('a settled hold cannot be ended again @negative @wallet', async ({ player, admin, newPromotion }) => {
    const { depositId } = await fundedWithBonus(player, admin, newPromotion)
    await holdFor(player, depositId)
    const hold = await currentHold(player, depositId)

    await admin.wallet.terminateHold(hold.holdId)
    await expect(admin.wallet.terminateHold(hold.holdId)).rejects.toThrow(/409/)
  })

  test('a player cannot end their own hold @p0 @negative @security @wallet', async ({
    player,
    admin,
    newPromotion,
  }) => {
    const { depositId } = await fundedWithBonus(player, admin, newPromotion)
    await holdFor(player, depositId)
    const hold = await currentHold(player, depositId)

    expect(
      await player.client.status('POST', `/wallet/admin/holds/${hold.holdId}/terminate`),
    ).toBe(403)
    expect((await currentHold(player, depositId)).status).toBe('ACTIVE')
  })

  test('spending more than the balance is refused @p0 @negative @wallet', async ({ player }) => {
    expect(
      await player.client.status('POST', '/wallet/spend', {
        body: { amount: 10, reason: 'nothing there' },
      }),
    ).toBe(409)
  })

  test('spending requires a session @negative @security @wallet', async ({ anonymous }) => {
    expect(
      await anonymous.status('POST', '/wallet/spend', { body: { amount: 10, reason: 'x' } }),
    ).toBe(401)
  })
})
