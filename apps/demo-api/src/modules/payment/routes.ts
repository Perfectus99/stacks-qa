import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ApiError } from '../../errors.js'
import { parse } from '../../validation.js'
import { requireAdmin, requireSession } from '../../plugins/auth.js'
import { decide, list, methods, submitDeposit, view } from './service.js'

const submitBody = z.object({
  amount: z.number().finite(),
  gatewayConfigId: z.string().uuid(),
  promotionCode: z.string().min(1).max(40).optional(),
}).strict()

const decisionBody = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().max(200).optional(),
}).strict()

/**
 * Deposits and their approval.
 *
 * The admin surface sits under `/admin` and is guarded by role, not by being
 * hard to guess — a player calling it directly is exactly what one of the
 * security tests does.
 */
export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/methods', async (request) => methods(requireSession(request)))

  app.post('/deposits', async (request, reply) => {
    const principal = requireSession(request)
    return reply.status(201).send(await submitDeposit(principal, parse(submitBody, request.body)))
  })

  app.get<{ Querystring: { userId?: string } }>('/admin/deposits', async (request) => {
    return list(requireAdmin(request), { userId: request.query.userId })
  })

  app.get<{ Params: { depositId: string } }>('/admin/deposits/:depositId', async (request) => {
    return view(requireAdmin(request), request.params.depositId)
  })

  app.patch<{ Params: { depositId: string } }>('/admin/deposits/:depositId', async (request) => {
    const principal = requireAdmin(request)
    const { status } = parse(decisionBody, request.body)
    return decide(principal, { depositId: request.params.depositId, status })
  })
}
