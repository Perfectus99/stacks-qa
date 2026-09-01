import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sql } from '../../db.js'
import { ApiError } from '../../errors.js'
import { parse } from '../../validation.js'
import { toMajor, toMinor } from '../../money.js'
import { requireAdmin, requireSession } from '../../plugins/auth.js'
import { evaluate } from './eligibility.js'
import { findByCode, insertPromotion, listActive, setActive } from './repository.js'

const previewBody = z.object({
  code: z.string().min(1),
  amount: z.number().finite().positive(),
}).strict()

const createBody = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  promotionType: z.enum(['PERCENTAGE', 'FIXED']),
  bonusPercent: z.number().int().min(0).max(1000).nullable().default(null),
  bonusAmount: z.number().finite().nonnegative().nullable().default(null),
  minDeposit: z.number().finite().nonnegative().default(0),
  maxBonus: z.number().finite().positive().nullable().default(null),
  releaseMultiplier: z.number().int().min(0).max(100).default(1),
  holdDays: z.number().int().min(0).max(365).default(30),
}).strict()

const activeBody = z.object({ active: z.boolean() }).strict()

export async function promotionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/promotions', async (request) => {
    const principal = requireSession(request)
    const promotions = await listActive(principal.tenantId)
    return promotions.map((promotion) => ({
      promotionId: promotion.promotionId,
      code: promotion.code,
      name: promotion.name,
      promotionType: promotion.promotionType,
      minDeposit: toMajor(promotion.minDepositMinor),
    }))
  })

  /**
   * A preview, and only a preview. It moves nothing and binds nobody — the
   * decision that counts is taken again when the deposit is approved.
   */
  app.post('/preview', async (request) => {
    const principal = requireSession(request)
    const { code, amount } = parse(previewBody, request.body)

    const promotion = await findByCode(sql, principal.tenantId, code)
    if (!promotion) throw new ApiError(404, 'PROMOTION_NOT_FOUND', 'No such promotion')

    const amountMinor = toMinor(amount)
    const verdict = evaluate(promotion, amountMinor, new Date())

    return {
      code: promotion.code,
      eligible: verdict.eligible,
      hasBonus: verdict.bonusMinor > 0,
      bonusAmount: toMajor(verdict.bonusMinor),
      totalAmount: toMajor(amountMinor + verdict.bonusMinor),
      releaseRequirement: toMajor(verdict.releaseRequirementMinor),
      reason: verdict.reason ?? null,
    }
  })

  // ---- admin surface --------------------------------------------------------

  app.post('/admin/promotions', async (request, reply) => {
    const principal = requireAdmin(request)
    const input = parse(createBody, request.body)

    const promotion = await insertPromotion({
      tenantId: principal.tenantId,
      code: input.code,
      name: input.name,
      promotionType: input.promotionType,
      bonusPercent: input.bonusPercent,
      bonusFixedMinor: input.bonusAmount === null ? null : toMinor(input.bonusAmount),
      minDepositMinor: toMinor(input.minDeposit),
      maxBonusMinor: input.maxBonus === null ? null : toMinor(input.maxBonus),
      releaseMultiplier: input.releaseMultiplier,
      holdDays: input.holdDays,
    })

    return reply.status(201).send({ promotionId: promotion.promotionId, code: promotion.code })
  })

  app.patch<{ Params: { promotionId: string } }>(
    '/admin/promotions/:promotionId',
    async (request) => {
      const principal = requireAdmin(request)
      const { active } = parse(activeBody, request.body)

      const updated = await setActive(principal.tenantId, request.params.promotionId, active)
      if (!updated) throw new ApiError(404, 'PROMOTION_NOT_FOUND', 'No such promotion')
      return { success: true }
    },
  )
}
