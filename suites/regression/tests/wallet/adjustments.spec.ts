import { test, expect } from '../../fixtures/index.js'

test.describe('administrative adjustments', () => {
  test('a credit lands and is recorded in the ledger @p0 @wallet', async ({ player, admin }) => {
    await admin.wallet.adjust({ userId: player.userId, amount: 250, reason: 'goodwill' })

    expect(await player.client.wallet.balance()).toBe(250)

    const transactions = await player.client.wallet.transactions()
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({ type: 'ADJUSTMENT', amount: 250 })
  })

  test('a debit reduces the balance @p0 @wallet', async ({ player, admin }) => {
    await admin.wallet.adjust({ userId: player.userId, amount: 250, reason: 'goodwill' })
    await admin.wallet.adjust({ userId: player.userId, amount: -100, reason: 'correction' })

    expect(await player.client.wallet.balance()).toBe(150)
    expect(await player.client.wallet.transactions()).toHaveLength(2)
  })

  test('a debit cannot push a balance below zero @p0 @negative @wallet', async ({
    player,
    admin,
  }) => {
    await admin.wallet.adjust({ userId: player.userId, amount: 100, reason: 'goodwill' })

    await expect(
      admin.wallet.adjust({ userId: player.userId, amount: -500, reason: 'too much' }),
    ).rejects.toThrow(/40[09]/)

    // The rejected debit must leave nothing behind — not a balance change, and
    // not an orphaned ledger row that would break reconciliation later.
    expect(await player.client.wallet.balance()).toBe(100)
    expect(await player.client.wallet.transactions()).toHaveLength(1)
  })

  test('a player cannot adjust their own wallet @p0 @negative @security @wallet', async ({
    player,
  }) => {
    const status = await player.client.status('POST', '/wallet/admin/adjustments', {
      body: { userId: player.userId, amount: 1000, reason: 'please' },
    })

    expect(status).toBe(403)
    expect(await player.client.wallet.balance()).toBe(0)
  })
})
