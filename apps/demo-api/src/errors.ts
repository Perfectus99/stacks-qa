import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message)
  }

  static forbidden(message = 'Not permitted'): ApiError {
    return new ApiError(403, 'FORBIDDEN', message)
  }

  static notImplemented(what: string): ApiError {
    return new ApiError(501, 'NOT_IMPLEMENTED', `${what} is not implemented yet`)
  }
}

/**
 * A single error shape for every failure.
 *
 * Without this, an unhandled throw leaves Fastify to answer with its own body
 * and a test asserting on `code` passes or fails depending on which layer threw
 * — the kind of inconsistency that costs an afternoon to track down.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
      })
    }

    request.log.error({ err: error }, 'unhandled error')
    return reply.status(500).send({ code: 'INTERNAL_ERROR', message: 'Unexpected error' })
  })
}
