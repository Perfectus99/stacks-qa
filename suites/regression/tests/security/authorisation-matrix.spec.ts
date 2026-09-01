import { randomBytes } from 'node:crypto'
import { test, expect } from '../../fixtures/index.js'
import type { ApiClient } from '@stacks/core'

/**
 * Every endpoint, against every kind of caller.
 *
 * The scattered `@security` tests each prove one rule in the middle of a
 * scenario. This proves the whole surface at once, which is a different claim:
 * that no route was added without an access decision being made about it. A new
 * endpoint with no row here is the thing this catches.
 *
 * The assertion is the *outcome class*, not an exact status. Whether a permitted
 * call then returns 200, 201, 404 or 409 depends on the body it was given, and
 * pinning those here would make the matrix a second copy of the functional
 * tests that breaks whenever they change.
 */
type Caller = 'anonymous' | 'player' | 'admin' | 'rivalAdmin'
type Outcome = 'unauthenticated' | 'forbidden' | 'permitted'

interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  /** A function where the body must differ per run, so nothing collides. */
  body?: Record<string, unknown> | (() => Record<string, unknown>)
  /** Undo anything a permitted call actually created. */
  cleanup?: (admin: ApiClient, body: Record<string, unknown>) => Promise<void>
  expect: Partial<Record<Caller, Outcome>>
}

const ABSENT = '00000000-0000-0000-0000-000000000000'

const ROUTES: Route[] = [
  // --- identity ------------------------------------------------------------
  { method: 'GET', path: '/user/profile',
    expect: { anonymous: 'unauthenticated', player: 'permitted', admin: 'permitted' } },
  { method: 'DELETE', path: `/user/admin/users/${ABSENT}`,
    expect: { anonymous: 'unauthenticated', player: 'forbidden', admin: 'permitted' } },

  // --- wallet --------------------------------------------------------------
  { method: 'GET', path: '/wallet/balance',
    expect: { anonymous: 'unauthenticated', player: 'permitted', admin: 'permitted' } },
  { method: 'GET', path: '/wallet/transactions',
    expect: { anonymous: 'unauthenticated', player: 'permitted' } },
  { method: 'GET', path: '/wallet/reconciliation',
    expect: { anonymous: 'unauthenticated', player: 'permitted' } },
  { method: 'GET', path: '/wallet/holds',
    expect: { anonymous: 'unauthenticated', player: 'permitted' } },
  { method: 'POST', path: '/wallet/spend', body: { amount: 1, reason: 'matrix' },
    expect: { anonymous: 'unauthenticated', player: 'permitted' } },
  { method: 'POST', path: '/wallet/admin/adjustments',
    body: { userId: ABSENT, amount: 1, reason: 'matrix' },
    expect: { anonymous: 'unauthenticated', player: 'forbidden', admin: 'permitted' } },
  { method: 'POST', path: `/wallet/admin/holds/${ABSENT}/terminate`,
    expect: { anonymous: 'unauthenticated', player: 'forbidden', admin: 'permitted' } },

  // --- payment -------------------------------------------------------------
  { method: 'GET', path: '/payment/methods',
    expect: { anonymous: 'unauthenticated', player: 'permitted' } },
  { method: 'POST', path: '/payment/deposits', body: { amount: 1, gatewayConfigId: ABSENT },
    expect: { anonymous: 'unauthenticated', player: 'permitted' } },
  { method: 'GET', path: '/payment/admin/deposits',
    expect: { anonymous: 'unauthenticated', player: 'forbidden', admin: 'permitted' } },
  { method: 'GET', path: `/payment/admin/deposits/${ABSENT}`,
    expect: { anonymous: 'unauthenticated', player: 'forbidden', admin: 'permitted' } },
  { method: 'PATCH', path: `/payment/admin/deposits/${ABSENT}`, body: { status: 'APPROVED' },
    expect: { anonymous: 'unauthenticated', player: 'forbidden', admin: 'permitted' } },

  // --- promotion -----------------------------------------------------------
  { method: 'GET', path: '/promotion/promotions',
    expect: { anonymous: 'unauthenticated', player: 'permitted', admin: 'permitted' } },
  { method: 'POST', path: '/promotion/preview', body: { code: 'ABSENT', amount: 10 },
    expect: { anonymous: 'unauthenticated', player: 'permitted' } },
  { method: 'POST', path: '/promotion/admin/promotions',
    // Unique per case: a fixed code would collide on the second run and answer
    // 409, which still classifies as permitted — the matrix would keep passing
    // while quietly testing a conflict instead of an authorisation.
    body: () => ({
      code: `MX${randomBytes(4).toString('hex').toUpperCase()}`,
      name: 'matrix',
      promotionType: 'FIXED',
      bonusAmount: 1,
    }),
    cleanup: async (admin, body) => {
      const created = (await admin.promotion.list()).find((p) => p.code === body.code)
      if (created) await admin.promotion.remove(created.promotionId)
    },
    expect: { anonymous: 'unauthenticated', player: 'forbidden', admin: 'permitted' } },
  { method: 'PATCH', path: `/promotion/admin/promotions/${ABSENT}`, body: { active: false },
    expect: { anonymous: 'unauthenticated', player: 'forbidden', admin: 'permitted' } },
  { method: 'DELETE', path: `/promotion/admin/promotions/${ABSENT}`,
    expect: { anonymous: 'unauthenticated', player: 'forbidden', admin: 'permitted' } },
]

function classify(status: number): Outcome {
  if (status === 401) return 'unauthenticated'
  if (status === 403) return 'forbidden'
  return 'permitted'
}

test.describe('authorisation matrix', () => {
  for (const route of ROUTES) {
    for (const [caller, expected] of Object.entries(route.expect) as [Caller, Outcome][]) {
      test(`${route.method} ${route.path.replace(ABSENT, ':id')} · ${caller} → ${expected} @p0 @security`, async ({
        anonymous,
        player,
        admin,
        rivalAdmin,
        newPromotion,
      }) => {
        void newPromotion

        const clients: Record<Caller, ApiClient> = {
          anonymous,
          player: player.client,
          admin,
          rivalAdmin,
        }

        const body = typeof route.body === 'function' ? route.body() : route.body
        const status = await clients[caller].status(route.method, route.path, { body })

        try {
          expect(classify(status), `got ${status}`).toBe(expected)
        } finally {
          // Anything a permitted call actually created goes away with the test.
          if (route.cleanup && body && classify(status) === 'permitted') {
            await route.cleanup(admin, body).catch(() => {})
          }
        }
      })
    }
  }
})
