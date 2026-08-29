import { test, expect } from '../../fixtures/index.js'
import { makePlayer } from '@stacks/test-data'

test.describe('balance', () => {
  test('a new wallet opens at zero in the account currency @p0 @smoke @wallet', async ({
    player,
  }) => {
    expect(await player.client.wallet.balance()).toBe(0)
  })

  test('reading a balance requires a session @negative @security @wallet', async ({
    anonymous,
  }) => {
    expect(await anonymous.status('GET', '/wallet/balance')).toBe(401)
  })

  test('a balance is scoped to its own account @negative @security @wallet', async ({
    player,
    admin,
  }) => {
    const other = await makePlayer()
    await admin.wallet.adjust({ userId: other.userId, amount: 500, reason: 'seeding the other account' })

    // The endpoint takes no account parameter, so the only account a player can
    // ever read is their own. The assertion is that funding someone else moved
    // nothing here — the failure this guards against is a handler that reads a
    // user id from anywhere other than the session.
    expect(await player.client.wallet.balance()).toBe(0)
    expect(await other.client.wallet.balance()).toBe(500)

    await other.dispose()
  })
})
