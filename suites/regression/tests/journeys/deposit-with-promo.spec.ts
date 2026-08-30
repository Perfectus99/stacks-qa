import { test, expect } from '../../fixtures/index.js'
import { makePromotion } from '@stacks/test-data'

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
}) => {
  const promotion = await makePromotion(admin, { bonusPercent: 50, minDeposit: 10 })

  const preview = await player.client.promotion.preview({ code: promotion.code, amount: 100 })
  expect(preview).toMatchObject({ eligible: true, hasBonus: true, bonusAmount: 50 })

  const method = await player.client.payment.methods('BANK_TRANSFER')
  const deposit = await player.client.payment.submitDeposit({
    amount: 100,
    gatewayConfigId: method.gatewayConfigId,
    promotionCode: promotion.code,
  })

  expect(deposit).toMatchObject({ status: 'PENDING_APPROVAL', hasBonus: true, bonusAmount: 50 })
  expect(await player.client.wallet.balance()).toBe(0)

  await admin.payment.approveDeposit(deposit.depositId)

  expect(await player.client.wallet.balance()).toBe(150)

  const transactions = await player.client.wallet.transactions()
  expect(transactions).toHaveLength(2)
  expect(transactions).toContainEqual(
    expect.objectContaining({ type: 'DEPOSIT', amount: 100, referenceId: deposit.depositId }),
  )
  expect(transactions).toContainEqual(
    expect.objectContaining({ type: 'BONUS', amount: 50, referenceId: deposit.depositId }),
  )

  const state = await player.client.wallet.reconciliation()
  expect(state).toMatchObject({ balance: 150, ledgerTotal: 150, balanced: true })
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
}) => {
  const promotion = await makePromotion(admin, { bonusPercent: 50, minDeposit: 10 })

  const method = await player.client.payment.methods('BANK_TRANSFER')
  const deposit = await player.client.payment.submitDeposit({
    amount: 100,
    gatewayConfigId: method.gatewayConfigId,
    promotionCode: promotion.code,
  })
  expect(deposit.hasBonus).toBe(true)

  await admin.promotion.setActive(promotion.promotionId, false)

  await admin.payment.approveDeposit(deposit.depositId)

  expect(await player.client.wallet.balance()).toBe(100)
  const transactions = await player.client.wallet.transactions()
  expect(transactions).toHaveLength(1)
  expect(transactions[0]).toMatchObject({ type: 'DEPOSIT', amount: 100 })

  expect((await admin.payment.viewDeposit(deposit.depositId)).status).toBe('APPROVED')
})

test('a deposit citing an ineligible promotion is refused @negative @payment @promotion', async ({
  player,
  admin,
}) => {
  const promotion = await makePromotion(admin, { minDeposit: 500 })
  const method = await player.client.payment.methods('BANK_TRANSFER')

  const status = await player.client.status('POST', '/payment/deposits', {
    body: { amount: 100, gatewayConfigId: method.gatewayConfigId, promotionCode: promotion.code },
  })

  expect(status).toBe(409)
  // The refusal must leave no deposit behind, not a pending one nobody asked for.
  const { deposits } = await admin.payment.listDeposits({ userId: player.userId })
  expect(deposits).toHaveLength(0)
})
