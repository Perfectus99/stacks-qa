function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

export const env = {
  port: Number(required('PORT', '3000')),
  host: required('HOST', '0.0.0.0'),
  databaseUrl: required('DATABASE_URL', 'postgres://stacks:stacks@localhost:5432/stacks'),
  jwtSecret: required('JWT_SECRET', 'development-only-secret'),
  /**
   * How long release progress takes to be applied. Small, and never zero —
   * see jobs/queue.ts.
   */
  progressDelayMs: Number(required('PROGRESS_DELAY_MS', '250')),
  admin: {
    username: required('ADMIN_USERNAME', 'admin'),
    password: required('ADMIN_PASSWORD', 'admin-password'),
  },
} as const
