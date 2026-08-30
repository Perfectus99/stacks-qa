import type { TransactionSql } from 'postgres'
import { ApiError } from '../../errors.js'
import { evaluate } from './eligibility.js'
import { attach, findAttachment, findById, findByCode, settleAttachment } from './repository.js'

/**
 * The narrow, published surface the payment module may use.
 *
 * Payment owns the deposit; promotion owns whether a bonus applies. Neither
 * reaches into the other's tables.
 */

/** Preview a bonus and record it against a deposit being submitted. */
export async function attachPromotion(
  tx: TransactionSql,
  input: { depositId: string; tenantId: string; code: string; amountMinor: number },
): Promise<{ bonusMinor: number; releaseRequirementMinor: number }> {
  const promotion = await findByCode(tx, input.tenantId, input.code)
  if (!promotion) {
    throw new ApiError(404, 'PROMOTION_NOT_FOUND', 'No such promotion')
  }

  const verdict = evaluate(promotion, input.amountMinor, new Date())
  if (!verdict.eligible) {
    throw new ApiError(409, 'PROMOTION_NOT_ELIGIBLE', verdict.reason ?? 'Not eligible')
  }

  await attach(tx, {
    depositId: input.depositId,
    promotionId: promotion.promotionId,
    previewedBonusMinor: verdict.bonusMinor,
    releaseRequirementMinor: verdict.releaseRequirementMinor,
  })

  return { bonusMinor: verdict.bonusMinor, releaseRequirementMinor: verdict.releaseRequirementMinor }
}

/**
 * Decide the bonus for a deposit being approved.
 *
 * Eligibility is evaluated again rather than trusting the preview. A promotion
 * withdrawn or expired between submission and approval must not still pay out,
 * and the deposit itself is unaffected either way — it is approved and credited
 * whatever the bonus turns out to be.
 */
export async function settlePromotion(
  tx: TransactionSql,
  input: { depositId: string; amountMinor: number },
): Promise<{ grantedBonusMinor: number; releaseRequirementMinor: number; declined?: string }> {
  const attachment = await findAttachment(tx, input.depositId)
  if (!attachment) return { grantedBonusMinor: 0, releaseRequirementMinor: 0 }

  const promotion = await findById(tx, attachment.promotion_id)
  if (!promotion) {
    await settleAttachment(tx, {
      depositId: input.depositId,
      status: 'DECLINED',
      grantedBonusMinor: 0,
      releaseRequirementMinor: 0,
      declinedReason: 'The promotion no longer exists',
    })
    return { grantedBonusMinor: 0, releaseRequirementMinor: 0, declined: 'Promotion removed' }
  }

  const verdict = evaluate(promotion, input.amountMinor, new Date())

  if (!verdict.eligible) {
    await settleAttachment(tx, {
      depositId: input.depositId,
      status: 'DECLINED',
      grantedBonusMinor: 0,
      releaseRequirementMinor: 0,
      declinedReason: verdict.reason,
    })
    return { grantedBonusMinor: 0, releaseRequirementMinor: 0, declined: verdict.reason }
  }

  await settleAttachment(tx, {
    depositId: input.depositId,
    status: 'GRANTED',
    grantedBonusMinor: verdict.bonusMinor,
    releaseRequirementMinor: verdict.releaseRequirementMinor,
  })

  return {
    grantedBonusMinor: verdict.bonusMinor,
    releaseRequirementMinor: verdict.releaseRequirementMinor,
  }
}
