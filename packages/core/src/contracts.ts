import { z } from 'zod'

/**
 * What each endpoint promises to return.
 *
 * Every response is parsed against its schema before a test sees it, so a
 * renamed or dropped field fails immediately, in the call that caused it, with
 * a message naming the field. Without this the field arrives as `undefined` and
 * surfaces later as a confusing assertion — or worse, does not surface at all
 * because nothing happened to read it.
 *
 * This is the layer most suites skip. Status assertions sail straight past a
 * contract change; business assertions only catch the fields they happen to
 * touch.
 */

export class ContractError extends Error {
  constructor(what: string, issues: string) {
    super(`${what} did not match its contract:\n${issues}`)
    this.name = 'ContractError'
  }
}

export function contract<S extends z.ZodTypeAny>(what: string, schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new ContractError(what, issues)
  }
  return result.data
}

const money = z.number()
const id = z.string().uuid()

export const registeredUser = z.object({ userId: id, username: z.string() })

export const session = z.object({
  accessToken: z.string().min(1),
  userId: id,
  tenantId: id,
})

export const profile = z.object({
  userId: id,
  username: z.string(),
  currency: z.string().length(3),
  tenantId: id,
})

export const balance = z.object({ currency: z.string().length(3), available: money })

export const transaction = z.object({
  transactionId: id,
  referenceId: z.string(),
  type: z.string(),
  amount: money,
  createdAt: z.string(),
})

export const reconciliation = z.object({
  balance: money,
  ledgerTotal: money,
  balanced: z.boolean(),
})

export const hold = z.object({
  holdId: id,
  referenceId: z.string(),
  type: z.string(),
  amount: money,
  requirement: money,
  progress: money,
  status: z.enum(['ACTIVE', 'RELEASED', 'FORFEITED', 'EXPIRED']),
  expiresAt: z.string(),
})

export const paymentMethod = z.object({
  gatewayConfigId: id,
  flowType: z.enum(['BANK_TRANSFER', 'QR_TRANSFER']),
  displayName: z.string(),
})

export const deposit = z.object({
  depositId: id,
  status: z.enum(['PENDING_APPROVAL', 'APPROVED', 'REJECTED']),
  flowType: z.enum(['BANK_TRANSFER', 'QR_TRANSFER']),
  amount: money,
  userId: id,
  hasBonus: z.boolean(),
  bonusAmount: money,
  releaseRequirement: money,
})

export const depositSummary = z.object({
  deposits: z.array(deposit),
  summary: z.object({ pendingCount: z.number(), completedCount: z.number() }),
})

export const promotionSummary = z.object({
  promotionId: id,
  code: z.string(),
  name: z.string(),
  promotionType: z.enum(['PERCENTAGE', 'FIXED']),
  minDeposit: money,
})

export const bonusPreview = z.object({
  code: z.string(),
  eligible: z.boolean(),
  hasBonus: z.boolean(),
  bonusAmount: money,
  totalAmount: money,
  releaseRequirement: money,
  reason: z.string().nullable(),
})

/**
 * Every failure answers in this shape.
 *
 * Checked on the way out of the client, so a handler that escapes the error
 * handler and returns the framework's own body is caught here rather than
 * surfacing as a test asserting on a `code` that is suddenly absent.
 */
export const apiError = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
})

export const success = z.object({ success: z.boolean() })
export const createdPromotion = z.object({ promotionId: id, code: z.string() })
