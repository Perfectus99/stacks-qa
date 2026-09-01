import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ApiError } from '../../errors.js'
import { parse } from '../../validation.js'
import { requireAdmin, requireSession, type Principal } from '../../plugins/auth.js'
import { currencyOf } from '../user/directory.js'
import { adjust, balance, holds, reconciliation, spend, terminateHold, transactions } from './service.js'

const spendBody = z.object({
  amount: z.number().finite(),
  reason: z.string().min(1).max(200),
}).strict()

const adjustmentBody = z.object({
  userId: z.string().uuid(),
  amount: z.number().finite(),
  reason: z.string().min(1).max(200),
}).strict()

/**
 * A wallet's currency comes from the account, not the request. A caller able to
 * name their own currency could open a second wallet just by asking for one.
 */
function currencyFor(principal: Principal): Promise<string> {
  return currencyOf(principal.userId)
}

/**
 * Balances, the ledger, and the reconciliation the ledger has to satisfy.
 *
 * No read takes an account parameter. The only account a session can see is its
 * own, which removes the whole class of bug where a handler trusts an id from
 * the query string.
 */
export async function walletRoutes(app: FastifyInstance): Promise<void> {
  app.get('/balance', async (request) => {
    const principal = requireSession(request)
    return balance(principal, await currencyFor(principal))
  })

  app.get('/transactions', async (request) => {
    const principal = requireSession(request)
    return transactions(principal, await currencyFor(principal))
  })

  app.get('/reconciliation', async (request) => {
    const principal = requireSession(request)
    return reconciliation(principal, await currencyFor(principal))
  })

  app.get('/holds', async (request) => {
    const principal = requireSession(request)
    return holds(principal, await currencyFor(principal))
  })

  app.post('/spend', async (request, reply) => {
    const principal = requireSession(request)
    return reply
      .status(201)
      .send(await spend(principal, await currencyFor(principal), parse(spendBody, request.body)))
  })

  app.post<{ Params: { holdId: string } }>('/admin/holds/:holdId/terminate', async (request) => {
    return terminateHold(requireAdmin(request), request.params.holdId)
  })

  app.post('/admin/adjustments', async (request, reply) => {
    const principal = requireAdmin(request)

    const parsed = adjustmentBody.safeParse(request.body)
    if (!parsed.success) {
      throw new ApiError(400, 'INVALID_REQUEST', parsed.error.issues[0]?.message ?? 'Invalid body')
    }

    return reply.status(201).send(
      await adjust({
        targetUserId: parsed.data.userId,
        tenantId: principal.tenantId,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
      }),
    )
  })
}
