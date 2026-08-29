import type { FastifyInstance } from 'fastify'
import { ApiError } from '../../errors.js'
import { requireSession } from '../../plugins/auth.js'

/** Balances, the ledger, and the reconciliation the ledger has to satisfy. */
export async function walletRoutes(app: FastifyInstance): Promise<void> {
  app.get('/balance', async (request) => {
    requireSession(request)
    throw ApiError.notImplemented('Balance')
  })

  app.get('/transactions', async (request) => {
    requireSession(request)
    throw ApiError.notImplemented('Transaction history')
  })

  app.get('/reconciliation', async (request) => {
    requireSession(request)
    throw ApiError.notImplemented('Reconciliation')
  })
}
