export interface HoldState {
  requirementMinor: number
  progressMinor: number
  expiresAt: Date
  status: 'ACTIVE' | 'RELEASED' | 'FORFEITED' | 'EXPIRED'
}

export type Outcome =
  | { kind: 'UNCHANGED'; progressMinor: number }
  | { kind: 'RELEASED'; progressMinor: number }
  | { kind: 'EXPIRED'; progressMinor: number }

/**
 * What a hold becomes when qualifying spend arrives.
 *
 * Expiry is checked before release, and deliberately: spend that arrives after
 * the deadline must not rescue a hold, even if it would have been enough. A
 * rule that released first would pay out on late activity, which is the whole
 * thing a deadline exists to prevent.
 *
 * Pure, so the boundaries — exactly meeting the requirement, spend landing on
 * the deadline — are testable without a database or a clock.
 */
export function applySpend(hold: HoldState, spendMinor: number, now: Date): Outcome {
  if (hold.status !== 'ACTIVE') {
    return { kind: 'UNCHANGED', progressMinor: hold.progressMinor }
  }

  if (now >= hold.expiresAt) {
    return { kind: 'EXPIRED', progressMinor: hold.progressMinor }
  }

  const progressMinor = hold.progressMinor + Math.max(0, spendMinor)

  return progressMinor >= hold.requirementMinor
    ? { kind: 'RELEASED', progressMinor }
    : { kind: 'UNCHANGED', progressMinor }
}
