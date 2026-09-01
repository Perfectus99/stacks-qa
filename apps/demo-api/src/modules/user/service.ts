import { ApiError } from '../../errors.js'
import { hashPassword, verifyPassword } from '../../password.js'
import { issueToken, type Principal } from '../../plugins/auth.js'
import {
  deleteUser,
  findById,
  findByUsername,
  insertUser,
  tenantIdBySlug,
  UNIQUE_VIOLATION,
  type UserRow,
} from './repository.js'

/**
 * Which tenant a request belongs to, for the two endpoints that have no session
 * to read it from.
 *
 * A real platform resolves this from the host the request arrived on. A header
 * does the same job here without needing DNS for a demo.
 */
export async function resolveTenant(slug: string): Promise<string> {
  const tenantId = await tenantIdBySlug(slug)
  if (!tenantId) throw new ApiError(404, 'TENANT_NOT_FOUND', `No tenant "${slug}"`)
  return tenantId
}

export async function register(
  tenantSlug: string,
  input: { username: string; password: string; currency: string },
): Promise<{ userId: string; username: string }> {
  const tenantId = await resolveTenant(tenantSlug)

  try {
    const row = await insertUser({
      tenantId,
      username: input.username,
      passwordHash: await hashPassword(input.password),
      currency: input.currency,
    })
    return { userId: row.user_id, username: row.username }
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      throw new ApiError(409, 'USERNAME_TAKEN', 'That username is already registered')
    }
    throw error
  }
}

export async function login(
  tenantSlug: string,
  input: { username: string; password: string },
): Promise<{ accessToken: string; userId: string; tenantId: string }> {
  const tenantId = await resolveTenant(tenantSlug)
  const row = await findByUsername(tenantId, input.username)

  // Verify against a row that may not exist, then answer identically either
  // way. Returning early on an unknown username makes the endpoint a username
  // oracle: the timing difference alone tells an attacker who is registered.
  const stored = row?.password_hash ?? 'scrypt$00$00'
  const matches = await verifyPassword(input.password, stored)

  if (!row || !matches) {
    throw ApiError.unauthorized('Those credentials were not accepted')
  }

  const principal: Principal = {
    userId: row.user_id,
    tenantId: row.tenant_id,
    role: row.role,
  }

  return { accessToken: issueToken(principal), userId: row.user_id, tenantId: row.tenant_id }
}

export async function profile(userId: string): Promise<{
  userId: string
  username: string
  currency: string
  tenantId: string
}> {
  const row: UserRow | undefined = await findById(userId)
  if (!row) throw ApiError.unauthorized('This session refers to an account that no longer exists')

  return {
    userId: row.user_id,
    username: row.username,
    currency: row.currency,
    tenantId: row.tenant_id,
  }
}

/**
 * Close an account, taking its wallet, ledger, deposits and holds with it.
 *
 * Scoped to the administrator's own tenant, and to players: an administrator of
 * one tenant closing accounts in another, or an administrator deleting other
 * administrators, are both worse than the convenience is worth.
 */
export async function closeAccount(principal: Principal, userId: string): Promise<void> {
  const removed = await deleteUser(principal.tenantId, userId)
  if (!removed) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'No such account in this tenant')
}
