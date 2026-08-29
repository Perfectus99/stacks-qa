import { test, expect } from '../../fixtures/index.js'

/**
 * The ledger is the record; the balance is a convenience. When they disagree,
 * money has been invented or destroyed, so this is asserted directly rather
 * than inferred from whether the other tests happened to pass.
 */
test.describe('reconciliation', () => {
  test('an untouched wallet reconciles @wallet', async ({ player }) => {
    const state = await player.client.wallet.reconciliation()

    expect(state).toMatchObject({ balance: 0, ledgerTotal: 0, balanced: true })
  })

  test('a wallet reconciles after a run of movements @p0 @wallet', async ({ player, admin }) => {
    for (const amount of [500, -120, 45, -25]) {
      await admin.wallet.adjust({ userId: player.userId, amount, reason: 'movement' })
    }

    const state = await player.client.wallet.reconciliation()

    expect(state.balance).toBe(400)
    expect(state.ledgerTotal).toBe(400)
    expect(state.balanced).toBe(true)
  })
})
