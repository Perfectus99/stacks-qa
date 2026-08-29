import type { FastifyInstance } from 'fastify'
import { ApiError } from '../../errors.js'
import { requireAdmin, requireSession } from '../../plugins/auth.js'

/**
 * Deposits and their approval.
 *
 * The admin surface sits under `/admin` and is guarded by role, not by being
 * hard to guess — a player calling it directly is exactly what one of the
 * security tests does.
 */
export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/methods', async (request) => {
    requireSession(request)
    throw ApiError.notImplemented('Payment methods')
  })

  app.post('/deposits', async (request) => {
    requireSession(request)
    throw ApiError.notImplemented('Deposit submission')
  })

  app.get('/admin/deposits', async (request) => {
    requireAdmin(request)
    throw ApiError.notImplemented('Deposit list')
  })

  app.get<{ Params: { depositId: string } }>('/admin/deposits/:depositId', async (request) => {
    requireAdmin(request)
    throw ApiError.notImplemented('Deposit detail')
  })

  app.patch<{ Params: { depositId: string } }>('/admin/deposits/:depositId', async (request) => {
    requireAdmin(request)
    throw ApiError.notImplemented('Deposit approval')
  })
}
