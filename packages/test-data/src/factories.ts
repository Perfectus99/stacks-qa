import { ApiClient } from '@stacks/core'
import { DEFAULT_PASSWORD, uniqueUsername } from './naming.js'

export interface Player {
  client: ApiClient
  username: string
  password: string
  userId: string
  currency: string
  tenantSlug: string
  /** Close the HTTP context. Account removal is the cleanup registry's job. */
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
  options: { currency?: string; tenantSlug?: string; username?: string } = {},
): Promise<Player> {
  const currency = options.currency ?? 'USD'
  const tenantSlug = options.tenantSlug ?? 'demo'
  // A caller may name the account — the isolation tests need the same username
  // in two tenants — but it still goes through here, so it is still cleaned up.
  const username = options.username ?? uniqueUsername(currency)
  const password = DEFAULT_PASSWORD

  const anonymous = await ApiClient.anonymous(tenantSlug)
  const registered = await anonymous.user.register({ username, password, currency })
  const session = await anonymous.user.login({ username, password })
  await anonymous.dispose()

  const client = (await ApiClient.anonymous(tenantSlug)).authenticatedAs(session.accessToken)

  return {
    client,
    username,
    password,
    userId: registered.userId,
    currency,
    tenantSlug,
    dispose: () => client.dispose(),
  }
}
