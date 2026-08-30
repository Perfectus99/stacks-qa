import type { z } from 'zod'
import { ApiError } from './errors.js'

/**
 * Parse a request body, or refuse it with a message that names the field.
 *
 * Generic over the schema rather than its output type, so schemas using
 * `.default()` keep the right type: with `ZodType<T>` the inferred T is the
 * *input* shape, which makes every defaulted field optional downstream.
 *
 * Body schemas are `.strict()`. Zod strips unknown keys by default, which turns
 * a field the caller meant to send into a silent no-op — a promotion code was
 * dropped this way and the deposit succeeded without the bonus, looking exactly
 * like a working request. Refusing the body says so immediately.
 */
export function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ')
    throw new ApiError(400, 'INVALID_REQUEST', detail)
  }
  return result.data
}
