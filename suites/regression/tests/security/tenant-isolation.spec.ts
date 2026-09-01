import { test, expect } from '../../fixtures/index.js'
import { ApiClient } from '@stacks/core'
import { DEFAULT_PASSWORD, uniqueUsername } from '@stacks/test-data'

/**
 * The property the whole platform rests on: a tenant sees its own data and
 * nothing else.
 *
 * These tests need two tenants to mean anything. With one seeded tenant a
 * handler that ignored tenant scoping entirely would pass every assertion in
 * the rest of the suite, because every row it could possibly return would
 * belong to the right tenant by accident.
 */
test.describe('tenant isolation', () => {
  test('the same username can exist in two tenants @p0 @security @user', async ({
    makeTenantPlayer,
  }) => {
    const username = uniqueUsername('USD')

    const inDemo = await makeTenantPlayer('demo', { username })
    const inRival = await makeTenantPlayer('rival', { username })

    expect(inDemo.username).toBe(username)
    expect(inRival.username).toBe(username)
    expect(inDemo.userId).not.toBe(inRival.userId)

    // Within one tenant the same name is still a conflict.
    const anonymous = await ApiClient.anonymous('demo')
    const status = await anonymous.status('POST', '/user/auth/register', {
      body: { username, password: DEFAULT_PASSWORD, currency: 'USD' },
    })
    expect(status).toBe(409)
    await anonymous.dispose()
  })

  test('credentials do not work against the wrong tenant @p0 @security @user', async ({
    player,
  }) => {
    const rival = await ApiClient.anonymous('rival')

    // The account exists — in the other tenant. Logging in here must fail as
    // though it did not exist at all.
    await expect(
      rival.user.login({ username: player.username, password: player.password }),
    ).rejects.toThrow(/401/)

    await rival.dispose()
  })

  test("an administrator cannot read another tenant's deposit @p0 @security @payment", async ({
    player,
    admin,
    rivalAdmin,
  }) => {
    const method = await player.client.payment.methods('BANK_TRANSFER')
    const deposit = await player.client.payment.submitDeposit({
      amount: 100,
      gatewayConfigId: method.gatewayConfigId,
    })

    // The owning administrator sees it.
    expect((await admin.payment.viewDeposit(deposit.depositId)).depositId).toBe(deposit.depositId)

    // The other tenant's administrator does not — and gets "no such deposit"
    // rather than "not allowed", which would confirm it exists.
    expect(
      await rivalAdmin.status('GET', `/payment/admin/deposits/${deposit.depositId}`),
    ).toBe(404)
  })

  test("an administrator cannot approve another tenant's deposit @p0 @security @payment", async ({
    player,
    rivalAdmin,
  }) => {
    const method = await player.client.payment.methods('BANK_TRANSFER')
    const deposit = await player.client.payment.submitDeposit({
      amount: 100,
      gatewayConfigId: method.gatewayConfigId,
    })

    expect(
      await rivalAdmin.status('PATCH', `/payment/admin/deposits/${deposit.depositId}`, {
        body: { status: 'APPROVED' },
      }),
    ).toBe(404)

    expect(await player.client.wallet.balance()).toBe(0)
  })

  test("an administrator cannot adjust another tenant's wallet @p0 @security @wallet", async ({
    player,
    rivalAdmin,
  }) => {
    expect(
      await rivalAdmin.status('POST', '/wallet/admin/adjustments', {
        body: { userId: player.userId, amount: 1000, reason: 'not mine to give' },
      }),
    ).toBe(403)

    expect(await player.client.wallet.balance()).toBe(0)
  })

  test("a deposit list is scoped to its own tenant @p0 @security @payment", async ({
    player,
    rivalAdmin,
  }) => {
    const method = await player.client.payment.methods('BANK_TRANSFER')
    const deposit = await player.client.payment.submitDeposit({
      amount: 100,
      gatewayConfigId: method.gatewayConfigId,
    })

    const { deposits } = await rivalAdmin.payment.listDeposits()
    expect(deposits.map((d) => d.depositId)).not.toContain(deposit.depositId)
  })

  test("a promotion is not offered to another tenant @p0 @security @promotion", async ({
    newPromotion,
    makeTenantPlayer,
  }) => {
    const promotion = await newPromotion()
    const rivalPlayer = await makeTenantPlayer('rival')

    const codes = (await rivalPlayer.client.promotion.list()).map((p) => p.code)
    expect(codes).not.toContain(promotion.code)

    expect(
      await rivalPlayer.client.status('POST', '/promotion/preview', {
        body: { code: promotion.code, amount: 100 },
      }),
    ).toBe(404)
  })

  test('an unknown tenant is refused rather than silently defaulted @negative @security', async () => {
    const nowhere = await ApiClient.anonymous('no-such-tenant')

    expect(
      await nowhere.status('POST', '/user/auth/login', {
        body: { username: 'admin', password: 'admin-password' },
      }),
    ).toBe(404)

    await nowhere.dispose()
  })
})
