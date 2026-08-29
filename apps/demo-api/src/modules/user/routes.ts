import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ApiError } from '../../errors.js'
import { requireSession } from '../../plugins/auth.js'
import { login, profile, register } from './service.js'

const registerBody = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(128),
  currency: z.string().length(3),
})

const loginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ')
    throw new ApiError(400, 'INVALID_REQUEST', detail)
  }
  return result.data
}

/** Identity: registration, sessions, profile. */
export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', async (request, reply) => {
    const input = parse(registerBody, request.body)
    return reply.status(201).send(await register(input))
  })

  app.post('/auth/login', async (request) => {
    return login(parse(loginBody, request.body))
  })

  app.get('/profile', async (request) => {
    return profile(requireSession(request).userId)
  })
}
