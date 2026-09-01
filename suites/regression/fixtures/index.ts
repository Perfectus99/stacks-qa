import { test as base } from '@playwright/test'
import { ApiClient } from '@stacks/core'
import { makePlayer, makePromotion, type Player, type SeededPromotion } from '@stacks/test-data'
import type { NewPromotion } from '@stacks/core'

/**
 * Work to undo once the test is over.
 *
 * Order matters and is the reason this is one registry rather than cleanup
 * scattered through each fixture: closing an account cascades its deposits, and
 * a promotion cannot be removed while a deposit still cites it. Accounts first,
 * promotions second.
 */
interface Cleanup {
  accounts: Array<() => Promise<void>>
  promotions: Array<() => Promise<void>>
}

interface Fixtures {
  cleanup: Cleanup
  /** A freshly registered player in the default tenant, removed afterwards. */
  player: Player
  /** Register a player in any tenant; removal is handled either way. */
  makeTenantPlayer: (tenantSlug: string, options?: { username?: string }) => Promise<Player>
  /** Create a promotion belonging to this test, removed afterwards. */
  newPromotion: (overrides?: Partial<NewPromotion>) => Promise<SeededPromotion>
  /** An unauthenticated client — registration and login paths. */
  anonymous: ApiClient
}

interface SharedFixtures {
  /** The default tenant's administrator. One login per worker. */
  admin: ApiClient
  /** A second tenant's administrator — the other side of every isolation test. */
  rivalAdmin: ApiClient
}

/**
 * Every spec imports `test` from here, never from `@playwright/test`.
 *
 * The scopes are the point. Administrators are worker-scoped because their
 * state is read-mostly and logging in once per worker is cheap; players are
 * test-scoped and unique, because two tests sharing a wallet would couple their
 * balances and fail in whichever order was unlucky.
 */
export const test = base.extend<Fixtures, SharedFixtures>({
  admin: [
    async ({}, use) => {
      const client = await ApiClient.asAdmin('demo')
      await use(client)
      await client.dispose()
    },
    { scope: 'worker' },
  ],

  rivalAdmin: [
    async ({}, use) => {
      const client = await ApiClient.asAdmin('rival')
      await use(client)
      await client.dispose()
    },
    { scope: 'worker' },
  ],

  // Automatic, so it is set up before anything that registers with it and torn
  // down after everything that does.
  cleanup: [
    async ({}, use) => {
      const registry: Cleanup = { accounts: [], promotions: [] }
      await use(registry)

      for (const remove of [...registry.accounts, ...registry.promotions]) {
        // A failure here must not fail the test that already passed. It leaves
        // a row behind, which is worth a warning and nothing more.
        await remove().catch((error: unknown) => {
          console.warn('[cleanup]', error instanceof Error ? error.message : error)
        })
      }
    },
    { auto: true },
  ],

  anonymous: async ({}, use) => {
    const client = await ApiClient.anonymous()
    await use(client)
    await client.dispose()
  },

  player: async ({ cleanup, admin }, use) => {
    const player = await makePlayer()
    cleanup.accounts.push(() => admin.user.closeAccount(player.userId))
    await use(player)
    await player.dispose()
  },

  makeTenantPlayer: async ({ cleanup, admin, rivalAdmin }, use) => {
    const opened: Player[] = []

    await use(async (tenantSlug: string, options: { username?: string } = {}) => {
      const player = await makePlayer({ tenantSlug, username: options.username })
      opened.push(player)
      const owner = tenantSlug === 'rival' ? rivalAdmin : admin
      cleanup.accounts.push(() => owner.user.closeAccount(player.userId))
      return player
    })

    await Promise.all(opened.map((player) => player.dispose()))
  },

  newPromotion: async ({ cleanup, admin }, use) => {
    await use(async (overrides: Partial<NewPromotion> = {}) => {
      const promotion = await makePromotion(admin, overrides)
      cleanup.promotions.push(() => admin.promotion.remove(promotion.promotionId))
      return promotion
    })
  },
})

export { expect } from '@playwright/test'
