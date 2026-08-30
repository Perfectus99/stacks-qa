import { sql } from '../../db.js'
import type { Sql, TransactionSql } from 'postgres'
import type { PromotionRule } from './eligibility.js'

type Db = Sql | TransactionSql

interface PromotionRow {
  promotion_id: string
  code: string
  name: string
  promotion_type: 'PERCENTAGE' | 'FIXED'
  bonus_percent: number | null
  bonus_fixed_minor: string | null
  min_deposit_minor: string
  max_bonus_minor: string | null
  release_multiplier: number
  active: boolean
  starts_at: Date | null
  ends_at: Date | null
}

export interface Promotion extends PromotionRule {
  name: string
}

function toRule(row: PromotionRow): Promotion {
  return {
    promotionId: row.promotion_id,
    code: row.code,
    name: row.name,
    promotionType: row.promotion_type,
    bonusPercent: row.bonus_percent,
    bonusFixedMinor: row.bonus_fixed_minor === null ? null : Number(row.bonus_fixed_minor),
    minDepositMinor: Number(row.min_deposit_minor),
    maxBonusMinor: row.max_bonus_minor === null ? null : Number(row.max_bonus_minor),
    releaseMultiplier: row.release_multiplier,
    active: row.active,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }
}

const columns = sql`
  promotion_id, code, name, promotion_type, bonus_percent, bonus_fixed_minor,
  min_deposit_minor, max_bonus_minor, release_multiplier, active, starts_at, ends_at
`

export async function listActive(tenantId: string): Promise<Promotion[]> {
  const rows = await sql<PromotionRow[]>`
    select ${columns} from promotions
    where tenant_id = ${tenantId}
      and active
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now())
    order by code
  `
  return rows.map(toRule)
}

export async function findByCode(
  db: Db,
  tenantId: string,
  code: string,
): Promise<Promotion | undefined> {
  const [row] = await db<PromotionRow[]>`
    select ${columns} from promotions
    where tenant_id = ${tenantId} and code = ${code}
  `
  return row ? toRule(row) : undefined
}

export async function findById(db: Db, promotionId: string): Promise<Promotion | undefined> {
  const [row] = await db<PromotionRow[]>`
    select ${columns} from promotions where promotion_id = ${promotionId}
  `
  return row ? toRule(row) : undefined
}

export async function insertPromotion(input: {
  tenantId: string
  code: string
  name: string
  promotionType: 'PERCENTAGE' | 'FIXED'
  bonusPercent: number | null
  bonusFixedMinor: number | null
  minDepositMinor: number
  maxBonusMinor: number | null
  releaseMultiplier: number
}): Promise<Promotion> {
  const [row] = await sql<PromotionRow[]>`
    insert into promotions (tenant_id, code, name, promotion_type, bonus_percent,
                            bonus_fixed_minor, min_deposit_minor, max_bonus_minor,
                            release_multiplier)
    values (${input.tenantId}, ${input.code}, ${input.name}, ${input.promotionType},
            ${input.bonusPercent}, ${input.bonusFixedMinor}, ${input.minDepositMinor},
            ${input.maxBonusMinor}, ${input.releaseMultiplier})
    returning ${columns}
  `
  if (!row) throw new Error('Promotion insert returned no row')
  return toRule(row)
}

export async function setActive(
  tenantId: string,
  promotionId: string,
  active: boolean,
): Promise<boolean> {
  const rows = await sql`
    update promotions set active = ${active}
    where promotion_id = ${promotionId} and tenant_id = ${tenantId}
    returning promotion_id
  `
  return rows.length > 0
}

// ---- attachment to a deposit ------------------------------------------------

export interface Attachment {
  deposit_id: string
  promotion_id: string
  previewed_bonus_minor: string
  release_requirement_minor: string
  status: string
}

export async function attach(
  tx: TransactionSql,
  input: {
    depositId: string
    promotionId: string
    previewedBonusMinor: number
    releaseRequirementMinor: number
  },
): Promise<void> {
  await tx`
    insert into deposit_promotions (deposit_id, promotion_id, previewed_bonus_minor,
                                    release_requirement_minor)
    values (${input.depositId}, ${input.promotionId}, ${input.previewedBonusMinor},
            ${input.releaseRequirementMinor})
  `
}

export async function findAttachment(
  tx: TransactionSql,
  depositId: string,
): Promise<Attachment | undefined> {
  const [row] = await tx<Attachment[]>`
    select deposit_id, promotion_id, previewed_bonus_minor, release_requirement_minor, status
    from deposit_promotions where deposit_id = ${depositId}
  `
  return row
}

export async function settleAttachment(
  tx: TransactionSql,
  input: {
    depositId: string
    status: 'GRANTED' | 'DECLINED'
    grantedBonusMinor: number
    releaseRequirementMinor: number
    declinedReason?: string
  },
): Promise<void> {
  await tx`
    update deposit_promotions
       set status = ${input.status},
           granted_bonus_minor = ${input.grantedBonusMinor},
           release_requirement_minor = ${input.releaseRequirementMinor},
           declined_reason = ${input.declinedReason ?? null}
     where deposit_id = ${input.depositId}
  `
}
