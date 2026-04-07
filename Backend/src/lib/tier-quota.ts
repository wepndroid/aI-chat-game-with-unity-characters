import { prisma } from './prisma'

/**
 * Subscription tier for quota when no explicit User.tierCode override is set.
 * Maps Patreon / entitlement codes to catalog tiers (PDF: free, basic, premium).
 */
const resolveTierFromEntitlements = async (userId: string): Promise<'free' | 'basic' | 'premium'> => {
  const now = new Date()

  const activeEntitlement = await prisma.entitlement.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      OR: [{ validUntil: null }, { validUntil: { gt: now } }]
    },
    select: { tierCode: true },
    orderBy: { updatedAt: 'desc' }
  })

  const patreonAccount = await prisma.patreonAccount.findUnique({
    where: { userId },
    select: { tierCents: true, membershipStatus: true }
  })

  const entitlementTier = activeEntitlement?.tierCode ?? null
  const patreonActive = patreonAccount?.membershipStatus === 'active_patron'
  const patreonCents = patreonActive ? (patreonAccount?.tierCents ?? 0) : 0

  if (entitlementTier === 'secretwaifu_access' || patreonCents >= 1650) {
    return 'premium'
  }

  if (entitlementTier === 'just_models' || patreonCents >= 900) {
    return 'basic'
  }

  return 'free'
}

/**
 * Message quota for chat: uses `Tier` table (PDF schema). Optional `User.tierCode` overrides Patreon-derived tier.
 */
export const resolveTierQuotaForUser = async (
  userId: string
): Promise<{ tierCode: string; limit: number; periodDays: number }> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, tierCode: true }
  })

  if (user?.role === 'ADMIN') {
    return { tierCode: 'admin', limit: 999999, periodDays: 30 }
  }

  if (user?.tierCode) {
    const override = await prisma.tier.findUnique({
      where: { code: user.tierCode }
    })
    if (override) {
      return {
        tierCode: override.code,
        limit: override.messageLimit,
        periodDays: override.periodDays
      }
    }
  }

  const effective = await resolveTierFromEntitlements(userId)
  const row = await prisma.tier.findUnique({
    where: { code: effective }
  })

  if (row) {
    return { tierCode: row.code, limit: row.messageLimit, periodDays: row.periodDays }
  }

  return {
    tierCode: effective,
    limit: effective === 'premium' ? 5000 : effective === 'basic' ? 500 : 20,
    periodDays: 30
  }
}
