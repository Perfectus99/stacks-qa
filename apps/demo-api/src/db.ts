import postgres from 'postgres'
import { env } from './env.js'

export const sql = postgres(env.databaseUrl, { max: 10, onnotice: () => {} })

export async function ping(): Promise<boolean> {
  try {
    await sql`select 1`
    return true
  } catch {
    return false
  }
}
