/**
 * Test data is named, never reused.
 *
 * Every run gets fresh identifiers so tests never depend on each other's
 * leftovers and a failed run leaves nothing that breaks the next one. The
 * prefix keeps seeded data recognisable when looking at the database by hand.
 */

let counter = 0

export function uniqueUsername(currency: string): string {
  counter += 1
  const stamp = Date.now().toString(36)
  return `t_${currency.toLowerCase()}_${stamp}_${counter}`
}

export const DEFAULT_PASSWORD = 'Test-Password-1'
