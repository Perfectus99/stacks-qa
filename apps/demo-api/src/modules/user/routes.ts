import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parse } from '../../validation.js'
import { requireAdmin, requireSession } from '../../plugins/auth.js'
import { closeAccount, login, profile, register } from './service.js'

const registerBody = z
  .object({
    username: z.string().min(3).max(64),
    password: z.string().min(8).max(128),
    currency: z.string().length(3),
  })
  .strict()

const loginBody = z
  .object({
    username: z.string().min(1),
    password: z.string().min(1),
  })
  .strict()

/**
 * Which tenant an unauthenticated request belongs to.
 *
 * A real platform reads this from the host. Defaulting keeps every existing
 * caller working; naming an unknown tenant is a 404 rather than a silent
 * fallback, because silently serving the wrong tenant is the failure this
 * whole scoping exists to prevent.
 */
function tenantSlug(request: FastifyRequest): string {
  const header = request.headers['x-tenant-slug']
  return typeof header === 'string' && header.length > 0 ? header : 'demo'
}

/** Identity: registration, sessions, profile, account closure. */
export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', async (request, reply) => {
    const input = parse(registerBody, request.body)
    return reply.status(201).send(await register(tenantSlug(request), input))
  })

  app.post('/auth/login', async (request) => {
    return login(tenantSlug(request), parse(loginBody, request.body))
  })

  app.get('/profile', async (request) => {
    return profile(requireSession(request).userId)
  })

  app.delete<{ Params: { userId: string } }>('/admin/users/:userId', async (request, reply) => {
    await closeAccount(requireAdmin(request), request.params.userId)
    return reply.status(204).send()
  })
}
