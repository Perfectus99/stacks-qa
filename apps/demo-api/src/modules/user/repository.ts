import { sql } from '../../db.js'
import type { Role } from '../../plugins/auth.js'

export interface UserRow {
  user_id: string
  tenant_id: string
  username: string
  password_hash: string
  currency: string
  role: Role
}

/** Postgres raises 23505 on a unique violation; nothing else here does. */
export const UNIQUE_VIOLATION = '23505'

export async function insertUser(input: {
  tenantId: string
  username: string
  passwordHash: string
  currency: string
  role?: Role
}): Promise<UserRow> {
  const [row] = await sql<UserRow[]>`
    insert into users (tenant_id, username, password_hash, currency, role)
    values (${input.tenantId}, ${input.username}, ${input.passwordHash},
            ${input.currency}, ${input.role ?? 'PLAYER'})
    returning user_id, tenant_id, username, password_hash, currency, role
  `
  if (!row) throw new Error('Insert returned no row')
  return row
}

export async function findByUsername(username: string): Promise<UserRow | undefined> {
  const [row] = await sql<UserRow[]>`
    select user_id, tenant_id, username, password_hash, currency, role
    from users
    where username = ${username}
    limit 1
  `
  return row
}

export async function findById(userId: string): Promise<UserRow | undefined> {
  const [row] = await sql<UserRow[]>`
    select user_id, tenant_id, username, password_hash, currency, role
    from users
    where user_id = ${userId}
    limit 1
  `
  return row
}

export async function defaultTenantId(): Promise<string> {
  const [row] = await sql<{ tenant_id: string }[]>`
    select tenant_id from tenants where slug = 'demo' limit 1
  `
  if (!row) throw new Error('The demo tenant is missing — run the seed')
  return row.tenant_id
}
