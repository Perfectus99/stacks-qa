import { test, expect } from '../../fixtures/index.js'
import { HttpError } from '@stacks/core'

test.describe('login', () => {
  test('valid credentials return a usable session @p0 @smoke @user', async ({ player }) => {
    const profile = await player.client.user.profile()

    expect(profile.username).toBe(player.username)
    expect(profile.currency).toBe(player.currency)
    expect(profile.tenantId).toBeTruthy()
  })

  test('a wrong password is rejected @negative @security @user', async ({
    anonymous,
    player,
  }) => {
    await expect(
      anonymous.user.login({ username: player.username, password: 'not-the-password' }),
    ).rejects.toThrow(HttpError)
  })

  test('the profile endpoint requires a session @negative @security @user', async ({
    anonymous,
  }) => {
    expect(await anonymous.status('GET', '/user/profile')).toBe(401)
  })
})
