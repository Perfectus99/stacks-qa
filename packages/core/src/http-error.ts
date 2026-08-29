/**
 * Thrown when a request returns a status the caller did not allow.
 *
 * The message carries the method, URL, status and response body, because a
 * failure that only says "expected 200, got 400" costs a debugging round-trip
 * that the body would have saved.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly url: string,
    readonly body: unknown,
  ) {
    super(`${method} ${url} → ${status}\n${JSON.stringify(body, null, 2)}`)
    this.name = 'HttpError'
  }
}
