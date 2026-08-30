import { test, expect } from '../../../fixtures/index.js'
import { ApiClient } from '@stacks/core'
import type { Player } from '@stacks/test-data'

async function pendingDeposit(player: Player, amount = 100): Promise<string> {
  const method = await player.client.payment.methods('BANK_TRANSFER')
  const deposit = await player.client.payment.submitDeposit({
    amount,
    gatewayConfigId: method.gatewayConfigId,
  })
  return deposit.depositId
}

test.describe('deciding a deposit', () => {
  test('approval credits the account exactly once @p0 @payment @wallet', async ({
    player,
    admin,
  }) => {
    const depositId = await pendingDeposit(player, 100)

    await admin.payment.approveDeposit(depositId)

    expect(await player.client.wallet.balance()).toBe(100)
    const transactions = await player.client.wallet.transactions()
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({ type: 'DEPOSIT', referenceId: depositId, amount: 100 })
  })

  test('approving an already-approved deposit changes nothing @p0 @negative @payment', async ({
    player,
    admin,
  }) => {
    const depositId = await pendingDeposit(player, 100)
    await admin.payment.approveDeposit(depositId)

    await expect(admin.payment.approveDeposit(depositId)).rejects.toThrow(/409/)

    expect(await player.client.wallet.balance()).toBe(100)
    expect(await player.client.wallet.transactions()).toHaveLength(1)
  })

  /**
   * The one that justifies row-level locking.
   *
   * Two administrators opening the same queue and clicking approve together is
   * ordinary, not exotic. Without a lock both read PENDING, both write APPROVED
   * and both credit — the account is funded twice for one deposit, and the
   * ledger reconciles perfectly against a balance that is simply wrong.
   *
   * Two *separate* clients, deliberately. Requests issued through one
   * APIRequestContext are serialised, so firing both from the shared `admin`
   * fixture produced a test that passed whether or not the lock existed —
   * verified by removing the lock and watching it stay green.
   */
  test('two administrators approving at once credit once @p0 @negative @payment', async ({
    player,
  }) => {
    const depositId = await pendingDeposit(player, 100)

    const [first, second] = await Promise.all([ApiClient.asAdmin(), ApiClient.asAdmin()])
    try {
      const outcomes = await Promise.allSettled([
        first.payment.approveDeposit(depositId),
        second.payment.approveDeposit(depositId),
      ])

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
      expect(await player.client.wallet.balance()).toBe(100)
      expect(await player.client.wallet.transactions()).toHaveLength(1)
    } finally {
      await Promise.all([first.dispose(), second.dispose()])
    }
  })

  test('rejection credits nothing @p0 @payment', async ({ player, admin }) => {
    const depositId = await pendingDeposit(player, 100)

    await admin.payment.rejectDeposit(depositId)

    expect(await player.client.wallet.balance()).toBe(0)
    expect(await player.client.wallet.transactions()).toHaveLength(0)
    expect((await admin.payment.viewDeposit(depositId)).status).toBe('REJECTED')
  })

  test('a rejected deposit cannot then be approved @p0 @negative @payment', async ({
    player,
    admin,
  }) => {
    const depositId = await pendingDeposit(player, 100)
    await admin.payment.rejectDeposit(depositId)

    await expect(admin.payment.approveDeposit(depositId)).rejects.toThrow(/409/)
    expect(await player.client.wallet.balance()).toBe(0)
  })

  test('deciding requires an administrator @negative @security @payment', async ({ player }) => {
    const depositId = await pendingDeposit(player, 100)

    expect(
      await player.client.status('PATCH', `/payment/admin/deposits/${depositId}`, {
        body: { status: 'APPROVED' },
      }),
    ).toBe(403)
    expect(await player.client.wallet.balance()).toBe(0)
  })
})
