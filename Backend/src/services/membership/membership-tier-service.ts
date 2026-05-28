import type { Prisma, UserRole } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import {
  normalizeMembershipTierCode,
  resolveHighestMembershipTierCode,
  type EffectiveMembershipTierCode,
  type MembershipTierCode
} from '../../lib/membership-tier-policy'
import { buildActiveEntitlementWhere } from './active-patreon-entitlement-projection'

type MembershipTierUserRow = {
  role: UserRole | string
  tierCode: string | null
  entitlementGrants: Array<{
    tierCode: string
  }>
}

type MembershipTierDatabase = Pick<Prisma.TransactionClient, 'user'>

const resolveEffectiveMembershipTierFromUserRow = (user: MembershipTierUserRow | null): EffectiveMembershipTierCode => {
  if (!user) {
    return 'free'
  }

  if (user.role === 'ADMIN') {
    return 'admin'
  }

  const explicitTierCode = normalizeMembershipTierCode(user.tierCode)
  if (explicitTierCode) {
    return explicitTierCode
  }

  return resolveHighestMembershipTierCode(user.entitlementGrants.map((entitlement) => entitlement.tierCode))
}

const resolveEffectiveMembershipTierForUser = async (
  userId: string,
  input: {
    db?: MembershipTierDatabase
    now?: Date
  } = {}
): Promise<EffectiveMembershipTierCode> => {
  const db = input.db ?? prisma
  const now = input.now ?? new Date()

  const user = await db.user.findUnique({
    where: {
      id: userId
    },
    select: {
      role: true,
      tierCode: true,
      entitlementGrants: {
        where: buildActiveEntitlementWhere(now),
        select: {
          tierCode: true
        }
      }
    }
  })

  return resolveEffectiveMembershipTierFromUserRow(user)
}

const resolveUserBillingTierCents = async (
  userId: string,
  input: {
    db?: Pick<Prisma.TransactionClient, 'patreonAccount'>
  } = {}
) => {
  const db = input.db ?? prisma
  const patreonAccount = await db.patreonAccount.findUnique({
    where: {
      userId
    },
    select: {
      tierCents: true
    }
  })

  return patreonAccount?.tierCents ?? null
}

export { resolveEffectiveMembershipTierForUser, resolveEffectiveMembershipTierFromUserRow, resolveUserBillingTierCents }
export type { EffectiveMembershipTierCode, MembershipTierCode, MembershipTierUserRow }
