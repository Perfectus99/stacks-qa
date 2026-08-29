/**
 * Environment resolution. Every value the suite needs from outside the
 * repository is read here and nowhere else, so a missing variable fails once,
 * loudly, with a message that says what to set.
 */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env and fill it in.`,
    )
  }
  return value
}

export const env = {
  /** Base URL of the system under test. */
  get baseUrl(): string {
    return required('BASE_URL', 'http://localhost:3100').replace(/\/$/, '')
  },

  /** Credentials for the seeded administrator. */
  get admin(): { username: string; password: string } {
    return {
      username: required('ADMIN_USERNAME', 'admin'),
      password: required('ADMIN_PASSWORD', 'admin-password'),
    }
  },
} as const
