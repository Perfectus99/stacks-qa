import Fastify, { type FastifyInstance } from 'fastify'
import { registerErrorHandler } from './errors.js'
import { registerAuth } from './plugins/auth.js'
import { userRoutes } from './modules/user/routes.js'
import { walletRoutes } from './modules/wallet/routes.js'
import { paymentRoutes } from './modules/payment/routes.js'
import { promotionRoutes } from './modules/promotion/routes.js'
import { ping } from './db.js'

/**
 * One process, one module per service, mounted under the service's prefix.
 *
 * Not four containers: the suite folds by service and the prefixes preserve
 * that, while the whole system still starts with a single command. The
 * trade-off is deliberate — modules never import each other's internals, so the
 * boundary is real even though the deployment is not.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })

  registerErrorHandler(app)
  registerAuth(app)

  app.get('/health', async (_request, reply) => {
    const database = await ping()
    return reply.status(database ? 200 : 503).send({
      status: database ? 'ok' : 'degraded',
      database: database ? 'connected' : 'unreachable',
    })
  })

  void app.register(userRoutes, { prefix: '/user' })
  void app.register(walletRoutes, { prefix: '/wallet' })
  void app.register(paymentRoutes, { prefix: '/payment' })
  void app.register(promotionRoutes, { prefix: '/promotion' })

  return app
}
