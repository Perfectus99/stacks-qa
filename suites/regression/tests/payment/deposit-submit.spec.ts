import { test, expect } from '../../fixtures/index.js'

test.describe('submitting a deposit', () => {
  test('a manual deposit opens as pending and moves no money @p0 @smoke @payment', async ({
    player,
  }) => {
    const method = await player.client.payment.methods('BANK_TRANSFER')
    const deposit = await player.client.payment.submitDeposit({
      amount: 100,
      gatewayConfigId: method.gatewayConfigId,
    })

    expect(deposit).toMatchObject({
      status: 'PENDING_APPROVAL',
      flowType: 'BANK_TRANSFER',
      amount: 100,
      userId: player.userId,
    })

    // Nothing is credited on submission. A deposit that funded an account
    // before anyone approved it would make the approval decorative.
    expect(await player.client.wallet.balance()).toBe(0)
  })

  test('submitting requires a session @negative @security @payment', async ({ anonymous }) => {
    expect(
      await anonymous.status('POST', '/payment/deposits', {
        body: { amount: 100, gatewayConfigId: '00000000-0000-0000-0000-000000000000' },
      }),
    ).toBe(401)
  })

  test('a non-positive amount is refused @negative @payment', async ({ player }) => {
    const method = await player.client.payment.methods('BANK_TRANSFER')

    for (const amount of [0, -50]) {
      expect(
        await player.client.status('POST', '/payment/deposits', {
          body: { amount, gatewayConfigId: method.gatewayConfigId },
        }),
      ).toBe(400)
    }
  })

  test('an unknown gateway is refused @negative @payment', async ({ player }) => {
    expect(
      await player.client.status('POST', '/payment/deposits', {
        body: { amount: 100, gatewayConfigId: '00000000-0000-0000-0000-000000000000' },
      }),
    ).toBe(404)
  })
})
