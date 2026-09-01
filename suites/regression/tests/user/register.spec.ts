import { test, expect } from '../../fixtures/index.js'
import { uniqueUsername, DEFAULT_PASSWORD } from '@stacks/test-data'

test.describe('registration', () => {
  test('a new account is created and can immediately log in @p0 @smoke @user', async ({
    anonymous,
    admin,
    cleanup,
  }) => {
    const username = uniqueUsername('USD')

    // Registered directly rather than through the factory, because registering
    // is what this test is about. It still has to clean up after itself.
    const registered = await anonymous.user.register({
      username,
      password: DEFAULT_PASSWORD,
      currency: 'USD',
    })
    cleanup.accounts.push(() => admin.user.closeAccount(registered.userId))
    expect(registered.userId).toBeTruthy()

    const session = await anonymous.user.login({ username, password: DEFAULT_PASSWORD })
    expect(session.accessToken).toBeTruthy()
    expect(session.userId).toBe(registered.userId)
  })

  test('a new account starts with a zero balance @p0 @user @wallet', async ({ player }) => {
    expect(await player.client.wallet.balance()).toBe(0)
  })

  test('a duplicate username is rejected with 409 @negative @user', async ({
    anonymous,
    player,
  }) => {
    const status = await anonymous.user.registerStatus({
      username: player.username,
      password: DEFAULT_PASSWORD,
      currency: player.currency,
    })

    expect(status).toBe(409)
  })
})
