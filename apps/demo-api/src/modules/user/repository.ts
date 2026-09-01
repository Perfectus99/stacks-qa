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

/**
 * Scoped to a tenant, necessarily.
 *
 * Usernames are unique per tenant, so a lookup by username alone can match a
 * row in the wrong tenant — and whichever the database returned first would be
 * the account that got logged into.
 */
export async function findByUsername(
  tenantId: string,
  username: string,
): Promise<UserRow | undefined> {
  const [row] = await sql<UserRow[]>`
    select user_id, tenant_id, username, password_hash, currency, role
    from users
    where tenant_id = ${tenantId} and username = ${username}
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

export async function tenantIdBySlug(slug: string): Promise<string | undefined> {
  const [row] = await sql<{ tenant_id: string }[]>`
    select tenant_id from tenants where slug = ${slug}
  `
  return row?.tenant_id
}

/** Delete an account and everything that hangs off it. */
export async function deleteUser(tenantId: string, userId: string): Promise<boolean> {
  const rows = await sql`
    delete from users
    where user_id = ${userId} and tenant_id = ${tenantId} and role = 'PLAYER'
    returning user_id
  `
  return rows.length > 0
}
