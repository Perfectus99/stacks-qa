import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from './db.js'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

/**
 * Applies every migration that has not run yet, in filename order.
 *
 * Applied names are recorded rather than counted, so a migration inserted out
 * of order is noticed instead of silently skipped.
 */
export async function migrate(): Promise<string[]> {
  await sql`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `

  const applied = new Set(
    (await sql<{ name: string }[]>`select name from schema_migrations`).map((row) => row.name),
  )

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()
  const ran: string[] = []

  for (const file of files) {
    if (applied.has(file)) continue
    const statements = await readFile(join(migrationsDir, file), 'utf8')
    await sql.begin(async (tx) => {
      await tx.unsafe(statements)
      await tx`insert into schema_migrations ${tx({ name: file })}`
    })
    ran.push(file)
  }

  return ran
}
