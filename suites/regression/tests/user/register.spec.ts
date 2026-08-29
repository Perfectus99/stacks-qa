import { test, expect } from '../../fixtures/index.js'
import { uniqueUsername, DEFAULT_PASSWORD } from '@stacks/test-data'

test.describe('registration', () => {
  test('a new account is created and can immediately log in @p0 @smoke @user', async ({
    anonymous,
  }) => {
    const username = uniqueUsername('USD')

    const registered = await anonymous.user.register({
      username,
      password: DEFAULT_PASSWORD,
      currency: 'USD',
    })
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
