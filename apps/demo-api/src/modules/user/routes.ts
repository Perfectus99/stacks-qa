import type { FastifyInstance } from 'fastify'
import { ApiError } from '../../errors.js'
import { requireSession } from '../../plugins/auth.js'

/**
 * Identity: registration, sessions, profile.
 *
 * Routes exist because a test asks for them. Bodies land in the next session.
 */
export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', async () => {
    throw ApiError.notImplemented('Registration')
  })

  app.post('/auth/login', async () => {
    throw ApiError.notImplemented('Login')
  })

  app.get('/profile', async (request) => {
    requireSession(request)
    throw ApiError.notImplemented('Profile')
  })
}
