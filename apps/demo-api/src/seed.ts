import { sql } from './db.js'
import { env } from './env.js'
import { hashPassword } from './password.js'

/**
 * Brings the database to a known starting state.
 *
 * Idempotent, and run on every boot: a demo whose first command is "now go and
 * seed it" is a demo people stop running. The administrator's password is
 * updated rather than left alone so changing it in the environment actually
 * takes effect.
 */
export async function seed(): Promise<void> {
  const [tenant] = await sql<{ tenant_id: string }[]>`
    insert into tenants (slug, name)
    values ('demo', 'Demo Tenant')
    on conflict (slug) do update set name = excluded.name
    returning tenant_id
  `
  if (!tenant) throw new Error('Seeding the demo tenant returned no row')

  await sql`
    insert into users (tenant_id, username, password_hash, currency, role)
    values (${tenant.tenant_id}, ${env.admin.username},
            ${await hashPassword(env.admin.password)}, 'USD', 'ADMIN')
    on conflict (tenant_id, username)
      do update set password_hash = excluded.password_hash, role = 'ADMIN'
  `
}
