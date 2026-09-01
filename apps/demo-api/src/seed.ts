import { sql } from './db.js'
import { env } from './env.js'
import { hashPassword } from './password.js'

/**
 * Two tenants, not one.
 *
 * A single-tenant seed makes tenant isolation impossible to test: every query is
 * scoped to a tenant that is also the only tenant, so a handler ignoring the
 * scope entirely would pass every assertion. The second tenant exists so the
 * isolation tests are capable of failing.
 */
const TENANTS = [
  { slug: 'demo', name: 'Demo Tenant' },
  { slug: 'rival', name: 'Rival Tenant' },
] as const

/**
 * Brings the database to a known starting state.
 *
 * Idempotent, and run on every boot: a demo whose first instruction is "now go
 * and seed it" is a demo people stop running. Each tenant gets its own
 * administrator, under the same name — an administrator is only ever an
 * administrator of one tenant.
 */
export async function seed(): Promise<void> {
  for (const { slug, name } of TENANTS) {
    await seedTenant(slug, name)
  }
}

async function seedTenant(slug: string, name: string): Promise<void> {
  const [tenant] = await sql<{ tenant_id: string }[]>`
    insert into tenants (slug, name)
    values (${slug}, ${name})
    on conflict (slug) do update set name = excluded.name
    returning tenant_id
  `
  if (!tenant) throw new Error(`Seeding tenant ${slug} returned no row`)

  for (const [flowType, displayName] of [
    ['BANK_TRANSFER', 'Bank transfer'],
    ['QR_TRANSFER', 'QR transfer'],
  ] as const) {
    await sql`
      insert into gateway_configs (tenant_id, flow_type, display_name)
      values (${tenant.tenant_id}, ${flowType}, ${displayName})
      on conflict (tenant_id, flow_type) do update set display_name = excluded.display_name
    `
  }

  await sql`
    insert into users (tenant_id, username, password_hash, currency, role)
    values (${tenant.tenant_id}, ${env.admin.username},
            ${await hashPassword(env.admin.password)}, 'USD', 'ADMIN')
    on conflict (tenant_id, username)
      do update set password_hash = excluded.password_hash, role = 'ADMIN'
  `
}
