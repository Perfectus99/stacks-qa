import { test, expect } from '../../fixtures/index.js'

/**
 * The promotional deposit chain: preview, submit with the promotion attached,
 * approve, and check that both the deposit and the bonus landed.
 *
 * It is the manual chain with two steps added, which is the point — the parts
 * are the same parts.
 */
test('a deposit with a promotion credits both the deposit and the bonus @p0 @payment @promotion @wallet @journey', async ({
  player,
  admin,
  newPromotion,
}) => {
  const promotion = await test.step('Given a promotion offering 50% on deposits over 10', async () => {
    return newPromotion({ bonusPercent: 50, minDeposit: 10 })
  })

  await test.step('When the player previews a deposit of 100', async () => {
    const preview = await player.client.promotion.preview({ code: promotion.code, amount: 100 })
    expect(preview).toMatchObject({ eligible: true, hasBonus: true, bonusAmount: 50 })
  })

  const deposit = await test.step('And submits it citing the promotion', async () => {
    const method = await player.client.payment.methods('BANK_TRANSFER')
    return player.client.payment.submitDeposit({
      amount: 100,
      gatewayConfigId: method.gatewayConfigId,
      promotionCode: promotion.code,
    })
  })

  await test.step('Then it is pending with the bonus recorded, and nothing has moved', async () => {
    expect(deposit).toMatchObject({ status: 'PENDING_APPROVAL', hasBonus: true, bonusAmount: 50 })
    expect(await player.client.wallet.balance()).toBe(0)
  })

  await test.step('When the administrator approves it', async () => {
    await admin.payment.approveDeposit(deposit.depositId)
  })

  await test.step('Then the balance is the deposit plus the bonus', async () => {
    expect(await player.client.wallet.balance()).toBe(150)
  })

  await test.step('And both movements are recorded against the deposit', async () => {
    const transactions = await player.client.wallet.transactions()
    expect(transactions).toHaveLength(2)
    expect(transactions).toContainEqual(
      expect.objectContaining({ type: 'DEPOSIT', amount: 100, referenceId: deposit.depositId }),
    )
    expect(transactions).toContainEqual(
      expect.objectContaining({ type: 'BONUS', amount: 50, referenceId: deposit.depositId }),
    )
  })

  await test.step('And the ledger still reconciles', async () => {
    const state = await player.client.wallet.reconciliation()
    expect(state).toMatchObject({ balance: 150, ledgerTotal: 150, balanced: true })
  })
})

/**
 * The reason eligibility is decided twice.
 *
 * A promotion withdrawn between submission and approval must not still pay out
 * — and the deposit itself must be unaffected. Getting this wrong in either
 * direction is a real incident: paying a bonus nobody is entitled to, or
 * refusing a deposit because a promotion ended.
 */
test('a promotion withdrawn before approval pays no bonus, and the deposit still lands @p0 @negative @payment @promotion @journey', async ({
  player,
  admin,
  newPromotion,
}) => {
  const promotion = await newPromotion({ bonusPercent: 50, minDeposit: 10 })

  const deposit = await test.step('Given a pending deposit citing a live promotion', async () => {
    const method = await player.client.payment.methods('BANK_TRANSFER')
    const submitted = await player.client.payment.submitDeposit({
      amount: 100,
      gatewayConfigId: method.gatewayConfigId,
      promotionCode: promotion.code,
    })
    expect(submitted.hasBonus).toBe(true)
    return submitted
  })

  await test.step('When the promotion is withdrawn before anyone approves it', async () => {
    await admin.promotion.setActive(promotion.promotionId, false)
  })

  await test.step('And the administrator approves the deposit', async () => {
    await admin.payment.approveDeposit(deposit.depositId)
  })

  await test.step('Then the deposit lands in full', async () => {
    expect(await player.client.wallet.balance()).toBe(100)
    expect((await admin.payment.viewDeposit(deposit.depositId)).status).toBe('APPROVED')
  })

  await test.step('And no bonus is paid', async () => {
    const transactions = await player.client.wallet.transactions()
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({ type: 'DEPOSIT', amount: 100 })
  })
})

test('a deposit citing an ineligible promotion is refused @negative @payment @promotion', async ({
  player,
  admin,
  newPromotion,
}) => {
  const promotion = await newPromotion({ minDeposit: 500 })

  await test.step('When the player deposits below the promotion minimum', async () => {
    const method = await player.client.payment.methods('BANK_TRANSFER')
    const status = await player.client.status('POST', '/payment/deposits', {
      body: {
        amount: 100,
        gatewayConfigId: method.gatewayConfigId,
        promotionCode: promotion.code,
      },
    })
    expect(status).toBe(409)
  })

  await test.step('Then no deposit is left behind', async () => {
    // A refusal that still created a pending deposit would be worse than the
    // refusal itself — somebody would eventually approve it.
    const { deposits } = await admin.payment.listDeposits({ userId: player.userId })
    expect(deposits).toHaveLength(0)
  })
})
