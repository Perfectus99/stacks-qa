import { ApiClient } from '@stacks/core'
import { DEFAULT_PASSWORD, uniqueUsername } from './naming.js'

export interface Player {
  client: ApiClient
  username: string
  password: string
  userId: string
  currency: string
  dispose(): Promise<void>
}

/**
 * Register a fresh player and return a client already holding its session.
 *
 * Uniqueness is the factory's job, never the spec's — a test that has to think
 * about whether its username is taken is a test that will eventually fail for a
 * reason unrelated to what it asserts.
 */
export async function makePlayer(
  options: { currency?: string } = {},
): Promise<Player> {
  const currency = options.currency ?? 'USD'
  const username = uniqueUsername(currency)
  const password = DEFAULT_PASSWORD

  const anonymous = await ApiClient.anonymous()
  const registered = await anonymous.user.register({ username, password, currency })
  const session = await anonymous.user.login({ username, password })
  await anonymous.dispose()

  const client = (await ApiClient.anonymous()).authenticatedAs(session.accessToken)

  return {
    client,
    username,
    password,
    userId: registered.userId,
    currency,
    dispose: () => client.dispose(),
  }
}
