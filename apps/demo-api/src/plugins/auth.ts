import jwt from 'jsonwebtoken'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { env } from '../env.js'
import { ApiError } from '../errors.js'

export type Role = 'PLAYER' | 'ADMIN'

export interface Principal {
  userId: string
  tenantId: string
  role: Role
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated for authenticated requests; undefined otherwise. */
    principal?: Principal
  }
}

export function issueToken(principal: Principal): string {
  return jwt.sign(principal, env.jwtSecret, { expiresIn: '2h' })
}

/**
 * Reads the bearer token if present and attaches the principal.
 *
 * Deliberately does not reject on its own — a route decides whether it needs a
 * session. Rejecting here would make every public route opt out, which is the
 * wrong default to get wrong.
 */
export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) return

    try {
      request.principal = jwt.verify(header.slice(7), env.jwtSecret) as Principal
    } catch {
      throw ApiError.unauthorized('Session is invalid or has expired')
    }
  })
}

export function requireSession(request: FastifyRequest): Principal {
  if (!request.principal) throw ApiError.unauthorized()
  return request.principal
}

export function requireAdmin(request: FastifyRequest): Principal {
  const principal = requireSession(request)
  if (principal.role !== 'ADMIN') {
    throw ApiError.forbidden('This action requires an administrator')
  }
  return principal
}
