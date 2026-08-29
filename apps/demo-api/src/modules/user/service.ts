import { ApiError } from '../../errors.js'
import { hashPassword, verifyPassword } from '../../password.js'
import { issueToken, type Principal } from '../../plugins/auth.js'
import {
  defaultTenantId,
  findById,
  findByUsername,
  insertUser,
  UNIQUE_VIOLATION,
  type UserRow,
} from './repository.js'

export async function register(input: {
  username: string
  password: string
  currency: string
}): Promise<{ userId: string; username: string }> {
  const tenantId = await defaultTenantId()

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

export async function login(input: {
  username: string
  password: string
}): Promise<{ accessToken: string; userId: string; tenantId: string }> {
  const row = await findByUsername(input.username)

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
