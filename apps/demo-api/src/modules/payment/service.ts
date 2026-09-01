import { sql } from '../../db.js'
import { ApiError } from '../../errors.js'
import { toMajor, toMinor } from '../../money.js'
import type { Principal } from '../../plugins/auth.js'
import { accountOf } from '../user/directory.js'
import { creditAccount, placeHold } from '../wallet/api.js'
import { attachPromotion, settlePromotion } from '../promotion/attachment.js'
import {
  findDeposit,
  findGateway,
  insertDeposit,
  listDeposits as listDepositRows,
  listGateways,
  lockDeposit,
  markDecided,
  type DepositRow,
} from './repository.js'

export interface Deposit {
  depositId: string
  status: string
  flowType: string
  amount: number
  userId: string
  hasBonus: boolean
  bonusAmount: number
  releaseRequirement: number
}

function present(
  row: DepositRow,
  bonus: { bonusMinor: number; releaseRequirementMinor: number } = {
    bonusMinor: 0,
    releaseRequirementMinor: 0,
  },
): Deposit {
  return {
    depositId: row.deposit_id,
    status: row.status,
    flowType: row.flow_type,
    amount: toMajor(row.amount_minor),
    userId: row.user_id,
    hasBonus: bonus.bonusMinor > 0,
    bonusAmount: toMajor(bonus.bonusMinor),
    releaseRequirement: toMajor(bonus.releaseRequirementMinor),
  }
}

export async function methods(principal: Principal): Promise<
  { gatewayConfigId: string; flowType: string; displayName: string }[]
> {
  const rows = await listGateways(principal.tenantId)
  return rows.map((row) => ({
    gatewayConfigId: row.gateway_config_id,
    flowType: row.flow_type,
    displayName: row.display_name,
  }))
}

export async function submitDeposit(
  principal: Principal,
  input: { amount: number; gatewayConfigId: string; promotionCode?: string },
): Promise<Deposit> {
  const amountMinor = toMinor(input.amount)
  if (amountMinor <= 0) {
    throw new ApiError(400, 'INVALID_REQUEST', 'A deposit must be for a positive amount')
  }

  const gateway = await findGateway(principal.tenantId, input.gatewayConfigId)
  if (!gateway) {
    throw new ApiError(404, 'GATEWAY_NOT_FOUND', 'No such payment method for this tenant')
  }

  // Nothing is credited here. The money moves when someone decides, which is
  // the whole point of a manual deposit.
  //
  // The deposit and its promotion are written together: a deposit that recorded
  // a bonus it is not attached to, or an attachment pointing at no deposit,
  // would both be worse than refusing the submission outright.
  return sql.begin(async (tx) => {
    const row = await insertDeposit(tx, {
      tenantId: principal.tenantId,
      userId: principal.userId,
      gatewayConfigId: gateway.gateway_config_id,
      flowType: gateway.flow_type,
      amountMinor,
    })

    if (!input.promotionCode) return present(row)

    const bonus = await attachPromotion(tx, {
      depositId: row.deposit_id,
      tenantId: principal.tenantId,
      code: input.promotionCode,
      amountMinor,
    })
    return present(row, bonus)
  })
}

export async function view(principal: Principal, depositId: string): Promise<Deposit> {
  const row = await findDeposit(principal.tenantId, depositId)
  if (!row) throw new ApiError(404, 'DEPOSIT_NOT_FOUND', 'No such deposit')
  return present(row)
}

export async function list(
  principal: Principal,
  filter: { userId?: string },
): Promise<{ deposits: Deposit[]; summary: { pendingCount: number; completedCount: number } }> {
  const { rows, pending, completed } = await listDepositRows({
    tenantId: principal.tenantId,
    userId: filter.userId,
  })

  return {
    deposits: rows.map((row) => present(row)),
    summary: { pendingCount: pending, completedCount: completed },
  }
}

/**
 * Approve or reject, and credit in the same transaction when approving.
 *
 * The row is locked before its status is read, so a second decision arriving
 * concurrently waits, then sees a deposit that is no longer pending and is
 * refused. The credit shares this transaction: a deposit marked approved but
 * never credited is the failure this shape exists to prevent.
 */
export async function decide(
  principal: Principal,
  input: { depositId: string; status: 'APPROVED' | 'REJECTED' },
): Promise<{ success: boolean }> {
  await sql.begin(async (tx) => {
    const row = await lockDeposit(tx, principal.tenantId, input.depositId)
    if (!row) throw new ApiError(404, 'DEPOSIT_NOT_FOUND', 'No such deposit')

    if (row.status !== 'PENDING_APPROVAL') {
      throw new ApiError(
        409,
        'ALREADY_DECIDED',
        `This deposit was already ${row.status.toLowerCase()}`,
      )
    }

    await markDecided(tx, {
      depositId: row.deposit_id,
      status: input.status,
      decidedBy: principal.userId,
    })

    if (input.status !== 'APPROVED') return

    const account = await accountOf(row.user_id)
    if (!account) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'The depositor no longer exists')

    await creditAccount(tx, {
      userId: account.userId,
      tenantId: account.tenantId,
      currency: account.currency,
      referenceId: row.deposit_id,
      type: 'DEPOSIT',
      amountMinor: Number(row.amount_minor),
    })

    // Eligibility is decided again here, not read back from the preview. The
    // deposit is approved and credited either way; only the bonus depends on
    // whether the promotion still applies at this moment.
    const bonus = await settlePromotion(tx, {
      depositId: row.deposit_id,
      amountMinor: Number(row.amount_minor),
    })

    if (bonus.grantedBonusMinor > 0) {
      await creditAccount(tx, {
        userId: account.userId,
        tenantId: account.tenantId,
        currency: account.currency,
        referenceId: row.deposit_id,
        type: 'BONUS',
        amountMinor: bonus.grantedBonusMinor,
      })

      // The bonus is in the account but not yet the account holder's. The hold
      // is written in this transaction so bonus money can never exist without
      // the claim against it.
      await placeHold(tx, {
        userId: account.userId,
        tenantId: account.tenantId,
        currency: account.currency,
        referenceId: row.deposit_id,
        amountMinor: bonus.grantedBonusMinor,
        requirementMinor: bonus.releaseRequirementMinor,
        expiresAt: new Date(Date.now() + bonus.holdDays * 24 * 60 * 60 * 1000),
      })
    }
  })

  return { success: true }
}
