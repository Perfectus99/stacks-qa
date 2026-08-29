/**
 * Money crosses the API boundary in major units and is stored in minor units.
 *
 * Both conversions live here so there is exactly one place to look when a
 * figure is out by a factor of a hundred.
 */
const MINOR_UNITS_PER_MAJOR = 100

export function toMinor(major: number): number {
  return Math.round(major * MINOR_UNITS_PER_MAJOR)
}

export function toMajor(minor: number | string): number {
  return Number(minor) / MINOR_UNITS_PER_MAJOR
}
