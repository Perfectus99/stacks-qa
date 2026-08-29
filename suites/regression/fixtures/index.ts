import { test as base } from '@playwright/test'
import { ApiClient } from '@stacks/core'
import { makePlayer, type Player } from '@stacks/test-data'

interface Actors {
  /** A freshly registered player, unique to this test, cleaned up after it. */
  player: Player
  /** An unauthenticated client — registration and login paths. */
  anonymous: ApiClient
}

interface SharedActors {
  /** The seeded administrator. One login per worker. */
  admin: ApiClient
}

/**
 * Every spec imports `test` from here, never from `@playwright/test`.
 *
 * The scopes are the point. `admin` is worker-scoped because admin state is
 * read-mostly and logging in once per worker is cheap; `player` is test-scoped
 * and unique, because two tests sharing a wallet would couple their balances
 * and fail in whichever order was unlucky.
 */
export const test = base.extend<Actors, SharedActors>({
  admin: [
    async ({}, use) => {
      const client = await ApiClient.asAdmin()
      await use(client)
      await client.dispose()
    },
    { scope: 'worker' },
  ],

  anonymous: async ({}, use) => {
    const client = await ApiClient.anonymous()
    await use(client)
    await client.dispose()
  },

  player: async ({}, use) => {
    const player = await makePlayer()
    await use(player)
    await player.dispose()
  },
})

export { expect } from '@playwright/test'
