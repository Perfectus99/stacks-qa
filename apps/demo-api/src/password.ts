import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const KEY_LENGTH = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

/**
 * Compares in constant time, and returns false rather than throwing on a
 * malformed stored value — a corrupt row should fail the login, not the
 * request handler.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, expectedHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !expectedHex) return false

  const expected = Buffer.from(expectedHex, 'hex')
  if (expected.length !== KEY_LENGTH) return false

  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH)
  return timingSafeEqual(actual, expected)
}
