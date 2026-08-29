import { randomBytes } from 'node:crypto'

/**
 * Test data is named, never reused.
 *
 * Every run gets fresh identifiers so tests never depend on each other's
 * leftovers and a failed run leaves nothing that breaks the next one. The
 * prefix keeps seeded data recognisable when looking at the database by hand.
 *
 * The random suffix is not decoration. A timestamp and a per-process counter
 * are not unique across workers: Playwright runs several processes, each with
 * its own counter starting at one, and two of them entering the same
 * millisecond produce the same name. That failed as a duplicate registration in
 * whichever test lost, passed on every serial re-run, and looked like flake.
 */
export function uniqueUsername(currency: string): string {
  const stamp = Date.now().toString(36)
  const nonce = randomBytes(4).toString('hex')
  return `t_${currency.toLowerCase()}_${stamp}_${nonce}`
}

export const DEFAULT_PASSWORD = 'Test-Password-1'
