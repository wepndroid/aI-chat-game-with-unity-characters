import { EntitlementStatus, RevenueEventKind } from '@prisma/client'
import { decryptSecret, encryptSecret } from './crypto'
import { markPatreonConversionForUser, recordRevenueEventForUser } from '../services/landing/landing-page-attribution-service'
import { fetchPatreonIdentity, refreshPatreonAccessToken } from './patreon-client'
import type { PatreonIdentityResponse, PatreonTokenPayload } from './patreon-client'
import { appendPatreonSyncLog } from './patreon-sync-log'
import { normalizeMembershipTierCode } from './membership-tier-policy'
import { resolvePatreonRevenueEventKind } from './patreon-revenue-event-kind'
import { prisma } from './prisma'
import {
  calculateMonthlyEquivalentCents,
  parsePatreonPledgeCadenceMonths,
  resolveBillingPeriodMonths
} from './subscription-billing'
import { resolveTierQuotaForUser } from './tier-quota'
import { resetQuotaPeriodForUser, type QuotaResetReason } from '../services/chat/chat-quota-period-service'
import { resolvePatreonEntitlementDecision } from '../services/membership/patreon-entitlement-policy'

type SyncPatreonMembershipInput = {
  userId: string
  tokenPayload?: PatreonTokenPayload
  logSource?: string
  logActorUserId?: string | null
  logActorLabel?: string | null
  logTrigger?: string | null
}

type SyncedPatreonMembership = {
  linked: boolean
  patreonUserId: string | null
  tierCents: number
  tierCode: string
  membershipStatus: string
  lastCheckedAt: string
  nextChargeDate: string | null
  entitlementStatus: EntitlementStatus
  isGifted: boolean
}

type DeactivatePatreonMembershipInput = {
  userId: string
  now?: Date
  membershipStatus?: string
  logSource?: string
  logActorUserId?: string | null
  logActorLabel?: string | null
  logTrigger?: string | null
}

type PatreonMembershipSnapshot = {
  patreonUserId: string
  campaignMemberId: string | null
  campaignId: string | null
  patronStatus: string
  entitledTierIds: string[]
  entitledTiers: Array<{
    id: string
    title: string | null
    amountCents: number | null
  }>
  currentlyEntitledAmountCents: number | null
  pledgeCadenceMonths: number | null
  lastChargeStatus: string | null
  lastChargeDate: Date | null
  nextChargeDate: Date | null
  isGifted: boolean
}

type PatreonIncludedResource = NonNullable<PatreonIdentityResponse['included']>[number]

const parseDate = (value: unknown) => {
  if (!value || typeof value !== 'string') {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const parseTierIdList = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

const getConfiguredTierIdMap = () => {
  const premiumIds = parseTierIdList(
    process.env.PATREON_TIER_IDS_PREMIUM ??
      process.env.PATREON_TIER_ID_PREMIUM ??
      process.env.PATREON_TIER_IDS_SECRETWAIFU_ACCESS ??
      process.env.PATREON_TIER_ID_SECRETWAIFU_ACCESS
  )
  const basicIds = parseTierIdList(
    process.env.PATREON_TIER_IDS_BASIC ??
      process.env.PATREON_TIER_ID_BASIC ??
      process.env.PATREON_TIER_IDS_JUST_MODELS ??
      process.env.PATREON_TIER_ID_JUST_MODELS
  )

  return {
    premiumIds: new Set(premiumIds),
    basicIds: new Set(basicIds)
  }
}

const parseAmountCents = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return Math.round(value)
}

const mapTierCodeFromSnapshot = (snapshot: PatreonMembershipSnapshot) => {
  const { premiumIds, basicIds } = getConfiguredTierIdMap()

  if (snapshot.entitledTierIds.some((tierId) => premiumIds.has(tierId))) {
    return 'premium'
  }

  if (snapshot.entitledTierIds.some((tierId) => basicIds.has(tierId))) {
    return 'basic'
  }

  // Runtime product access is tier-id based. Do not guess from labels or amounts:
  // pricing can change independently from the Patreon tier identity.
  return 'inactive'
}

const resolveStoredTierCents = (snapshot: PatreonMembershipSnapshot, tierCode: string) => {
  const highestTierAmountCents = snapshot.entitledTiers.reduce((highestAmountCents, tier) => {
    return Math.max(highestAmountCents, tier.amountCents ?? 0)
  }, 0)
  const effectiveAmountCents = Math.max(highestTierAmountCents, snapshot.currentlyEntitledAmountCents ?? 0)

  if (effectiveAmountCents > 0) {
    return effectiveAmountCents
  }

  return 0
}

const resolveSyncedPatreonEntitlementDecision = (input: {
  now: Date
  membershipStatus: string
  tierCode: string
  lastChargeStatus: string | null
  nextChargeDate: Date | null
  isGifted: boolean
}) => resolvePatreonEntitlementDecision(input)

const getMembershipCampaignId = (membership: PatreonIncludedResource | undefined) =>
  (membership?.relationships?.campaign as { data?: { id?: string } } | undefined)?.data?.id ?? null

const selectMembershipForCampaign = (
  memberships: PatreonIncludedResource[],
  requiredCampaignId: string | null
) => {
  if (!requiredCampaignId) {
    return memberships[0]
  }

  return memberships.find((membership) => getMembershipCampaignId(membership) === requiredCampaignId)
}

const resolveQuotaResetReasonForRevenueEvent = (kind: RevenueEventKind): QuotaResetReason | null => {
  switch (kind) {
    case RevenueEventKind.INITIAL_PURCHASE:
      return 'patreon_initial_purchase'
    case RevenueEventKind.REACTIVATION:
      return 'patreon_reactivation'
    case RevenueEventKind.RENEWAL:
      return 'patreon_renewal'
    case RevenueEventKind.UPGRADE:
      return 'patreon_upgrade'
    case RevenueEventKind.DOWNGRADE:
      return null
  }
}

const extractMembershipSnapshot = (identity: PatreonIdentityResponse): PatreonMembershipSnapshot => {
  const memberships = (identity.included ?? []).filter((resource) => resource.type === 'member')
  const requiredCampaignId = process.env.PATREON_CAMPAIGN_ID?.trim() || null
  const selectedMembership = selectMembershipForCampaign(memberships, requiredCampaignId)
  const memberAttributes = selectedMembership?.attributes ?? {}

  const patronStatus = typeof memberAttributes.patron_status === 'string' ? memberAttributes.patron_status : 'not_connected'
  const lastChargeStatus = typeof memberAttributes.last_charge_status === 'string' ? memberAttributes.last_charge_status : null
  const lastChargeDate = parseDate(memberAttributes.last_charge_date)
  const nextChargeDate = parseDate(memberAttributes.next_charge_date)
  const isGifted = memberAttributes.is_gifted === true
  const currentlyEntitledAmountCents = parseAmountCents(memberAttributes.currently_entitled_amount_cents)
  const pledgeCadenceMonths = parsePatreonPledgeCadenceMonths(memberAttributes.pledge_cadence)
  const entitledTierIds = Array.isArray(
    (selectedMembership?.relationships?.currently_entitled_tiers as { data?: Array<{ id: string }> } | undefined)?.data
  )
    ? ((selectedMembership?.relationships?.currently_entitled_tiers as { data?: Array<{ id: string }> }).data ?? [])
        .map((tierRelation) => tierRelation.id)
        .filter(Boolean)
    : []
  const includedTierResources = (identity.included ?? []).filter((resource) => resource.type === 'tier')
  const entitledTiers = entitledTierIds.map((tierId) => {
    const matchedTier = includedTierResources.find((resource) => resource.id === tierId)
    const tierAttributes = matchedTier?.attributes ?? {}

    return {
      id: tierId,
      title: typeof tierAttributes.title === 'string' ? tierAttributes.title : null,
      amountCents: parseAmountCents(tierAttributes.amount_cents)
    }
  })

  const campaignId = getMembershipCampaignId(selectedMembership)

  return {
    patreonUserId: identity.data.id,
    campaignMemberId: selectedMembership?.id ?? null,
    campaignId,
    patronStatus,
    entitledTierIds,
    entitledTiers,
    currentlyEntitledAmountCents,
    pledgeCadenceMonths,
    lastChargeStatus,
    lastChargeDate,
    nextChargeDate,
    isGifted
  }
}

const ensureValidAccessToken = async (userId: string) => {
  const account = await prisma.patreonAccount.findUnique({
    where: {
      userId
    }
  })

  if (!account?.accessTokenEncrypted || !account.refreshTokenEncrypted) {
    return null
  }

  const now = new Date()

  if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() > now.getTime() + 60_000) {
    return {
      account,
      accessToken: decryptSecret(account.accessTokenEncrypted)
    }
  }

  const refreshedTokenPayload = await refreshPatreonAccessToken(decryptSecret(account.refreshTokenEncrypted))
  const refreshedAccessTokenEncrypted = encryptSecret(refreshedTokenPayload.access_token)
  const refreshedRefreshTokenEncrypted = encryptSecret(refreshedTokenPayload.refresh_token)
  const refreshedTokenExpiresAt = new Date(Date.now() + refreshedTokenPayload.expires_in * 1000)

  const updatedAccount = await prisma.patreonAccount.update({
    where: {
      id: account.id
    },
    data: {
      accessTokenEncrypted: refreshedAccessTokenEncrypted,
      refreshTokenEncrypted: refreshedRefreshTokenEncrypted,
      tokenExpiresAt: refreshedTokenExpiresAt
    }
  })

  return {
    account: updatedAccount,
    accessToken: refreshedTokenPayload.access_token
  }
}

const persistPatreonSnapshot = async (input: {
  userId: string
  now: Date
  snapshot: PatreonMembershipSnapshot
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: Date | null
  logSource?: string
  logActorUserId?: string | null
  logActorLabel?: string | null
  logTrigger?: string | null
  previousPatreonAccount: {
    membershipStatus: string | null
    tierCents: number | null
    pledgeCadenceMonths: number | null
    lastChargeDate: Date | null
    nextChargeDate: Date | null
  } | null
  previousPatreonEntitlement: {
    tierCode: string
    status: EntitlementStatus
    validUntil: Date | null
  } | null
}) => {
  const requiredCampaignId = process.env.PATREON_CAMPAIGN_ID?.trim() || null
  const isCampaignMatch = !requiredCampaignId || input.snapshot.campaignId === requiredCampaignId
  const effectiveMembershipStatus = isCampaignMatch ? input.snapshot.patronStatus : 'campaign_mismatch'
  const tierCode = isCampaignMatch ? mapTierCodeFromSnapshot(input.snapshot) : 'inactive'
  const canonicalTierCents = isCampaignMatch ? resolveStoredTierCents(input.snapshot, tierCode) : 0
  const billingPeriodMonths = isCampaignMatch
    ? resolveBillingPeriodMonths({
        pledgeCadenceMonths: input.snapshot.pledgeCadenceMonths,
        lastChargeDate: input.snapshot.lastChargeDate,
        nextChargeDate: input.snapshot.nextChargeDate
      })
    : 1
  const monthlyTierCents = calculateMonthlyEquivalentCents(canonicalTierCents, billingPeriodMonths)
  const entitlementDecision = resolveSyncedPatreonEntitlementDecision({
    now: input.now,
    membershipStatus: effectiveMembershipStatus,
    tierCode,
    lastChargeStatus: input.snapshot.lastChargeStatus,
    nextChargeDate: input.snapshot.nextChargeDate,
    isGifted: input.snapshot.isGifted
  })
  const entitlementStatus = entitlementDecision.status
  const entitlementValidUntil = entitlementDecision.validUntil

  const accessTokenEncrypted = encryptSecret(input.accessToken)
  const refreshTokenEncrypted = input.refreshToken ? encryptSecret(input.refreshToken) : null

  await prisma.patreonAccount.upsert({
    where: {
      userId: input.userId
    },
    update: {
      patreonUserId: input.snapshot.patreonUserId,
      campaignMemberId: input.snapshot.campaignMemberId,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenExpiresAt: input.tokenExpiresAt,
      tierCents: canonicalTierCents,
      pledgeCadenceMonths: billingPeriodMonths,
      membershipStatus: effectiveMembershipStatus,
      lastChargeStatus: input.snapshot.lastChargeStatus,
      lastChargeDate: input.snapshot.lastChargeDate,
      nextChargeDate: input.snapshot.nextChargeDate,
      lastCheckedAt: input.now
    },
    create: {
      userId: input.userId,
      patreonUserId: input.snapshot.patreonUserId,
      campaignMemberId: input.snapshot.campaignMemberId,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenExpiresAt: input.tokenExpiresAt,
      tierCents: canonicalTierCents,
      pledgeCadenceMonths: billingPeriodMonths,
      membershipStatus: effectiveMembershipStatus,
      lastChargeStatus: input.snapshot.lastChargeStatus,
      lastChargeDate: input.snapshot.lastChargeDate,
      nextChargeDate: input.snapshot.nextChargeDate,
      lastCheckedAt: input.now
    }
  })

  await prisma.entitlement.upsert({
    where: {
      id: `patreon-entitlement-${input.userId}`
    },
    update: {
      source: 'PATREON',
      tierCode,
      status: entitlementStatus,
      validFrom: input.now,
      validUntil: entitlementValidUntil,
      updatedAt: input.now
    },
    create: {
      id: `patreon-entitlement-${input.userId}`,
      userId: input.userId,
      source: 'PATREON',
      tierCode,
      status: entitlementStatus,
      validFrom: input.now,
      validUntil: entitlementValidUntil
    }
  })

  if (entitlementStatus === EntitlementStatus.ACTIVE && canonicalTierCents > 0) {
    const previousEntitlementWasActive =
      input.previousPatreonEntitlement?.status === EntitlementStatus.ACTIVE &&
      (input.previousPatreonEntitlement.validUntil === null || input.previousPatreonEntitlement.validUntil.getTime() > input.now.getTime()) &&
      normalizeMembershipTierCode(input.previousPatreonEntitlement.tierCode) !== null
    const previousAccountWasActive =
      input.previousPatreonAccount?.membershipStatus === 'active_patron' && (input.previousPatreonAccount?.tierCents ?? 0) > 0
    const previousWasActive = previousEntitlementWasActive || previousAccountWasActive
    const previousBillingPeriodMonths = resolveBillingPeriodMonths({
      pledgeCadenceMonths: input.previousPatreonAccount?.pledgeCadenceMonths,
      lastChargeDate: input.previousPatreonAccount?.lastChargeDate,
      nextChargeDate: input.previousPatreonAccount?.nextChargeDate
    })
    const chargedAt = input.snapshot.lastChargeDate ?? input.now
    const providerEventKey = input.snapshot.lastChargeDate
      ? `patreon:${input.userId}:${input.snapshot.lastChargeDate.toISOString()}:${canonicalTierCents}`
      : `patreon:${input.userId}:initial:${canonicalTierCents}`

    // Raw amountCents is revenue for the charged provider period; tierCode is
    // product access identity. The classifier compares tier rank first so
    // discounted annual renewals are not misreported as upgrades/downgrades.
    const revenueEventKind = resolvePatreonRevenueEventKind({
      currentTierCode: tierCode,
      currentAmountCents: canonicalTierCents,
      currentBillingPeriodMonths: billingPeriodMonths,
      previous: input.previousPatreonAccount
        ? {
            wasActive: previousWasActive,
            tierCode: input.previousPatreonEntitlement?.tierCode ?? null,
            amountCents: input.previousPatreonAccount.tierCents,
            billingPeriodMonths: previousBillingPeriodMonths
          }
        : null
    })

    await recordRevenueEventForUser({
      userId: input.userId,
      providerEventKey,
      kind: revenueEventKind,
      tierCode,
      amountCents: canonicalTierCents,
      billingPeriodMonths,
      chargedAt
    })

    const quotaResetReason = resolveQuotaResetReasonForRevenueEvent(revenueEventKind)
    if (quotaResetReason) {
      const tierQuota = await resolveTierQuotaForUser(input.userId)
      await resetQuotaPeriodForUser({
        userId: input.userId,
        tierCode: tierQuota.tierCode,
        periodDays: tierQuota.periodDays,
        resetReason: quotaResetReason,
        periodStart: input.now,
        periodEnd: entitlementDecision.validUntil && entitlementDecision.validUntil.getTime() > input.now.getTime()
          ? entitlementDecision.validUntil
          : undefined,
        sourceEventKey: `quota:${providerEventKey}:${quotaResetReason}`
      })
    }
  }

  await markPatreonConversionForUser(input.userId, {
    linked: true,
    active: entitlementStatus === EntitlementStatus.ACTIVE
  })

  if (input.logSource) {
    await appendPatreonSyncLog({
      userId: input.userId,
      source: input.logSource,
      eventType: 'sync_success',
      level: entitlementStatus === EntitlementStatus.ACTIVE ? 'INFO' : 'WARN',
      message:
        entitlementStatus === EntitlementStatus.ACTIVE
          ? `Patreon sync completed with active ${tierCode} entitlement.`
          : `Patreon sync completed without active entitlement (${effectiveMembershipStatus}).`,
      actorUserId: input.logActorUserId ?? null,
      actorLabel: input.logActorLabel ?? null,
      details: {
        trigger: input.logTrigger ?? null,
        configuredCampaignId: process.env.PATREON_CAMPAIGN_ID?.trim() || null,
        patreonUserId: input.snapshot.patreonUserId,
        campaignId: input.snapshot.campaignId,
        campaignMemberId: input.snapshot.campaignMemberId,
        membershipStatus: effectiveMembershipStatus,
        tierCode,
        tierCents: canonicalTierCents,
        monthlyTierCents,
        billingPeriodMonths,
        entitlementStatus,
        entitlementDecisionReason: entitlementDecision.reason,
        entitlementValidUntil: entitlementValidUntil?.toISOString() ?? null,
        entitledTierIds: input.snapshot.entitledTierIds,
        entitledTiers: input.snapshot.entitledTiers,
        currentlyEntitledAmountCents: input.snapshot.currentlyEntitledAmountCents,
        lastChargeStatus: input.snapshot.lastChargeStatus,
        lastChargeDate: input.snapshot.lastChargeDate?.toISOString() ?? null,
        nextChargeDate: input.snapshot.nextChargeDate?.toISOString() ?? null,
        isGifted: input.snapshot.isGifted
      }
    })
  }

  return {
    linked: true,
    patreonUserId: input.snapshot.patreonUserId,
    tierCents: canonicalTierCents,
    tierCode,
    membershipStatus: effectiveMembershipStatus,
    lastCheckedAt: input.now.toISOString(),
    nextChargeDate: input.snapshot.nextChargeDate ? input.snapshot.nextChargeDate.toISOString() : null,
    entitlementStatus,
    isGifted: input.snapshot.isGifted
  } satisfies SyncedPatreonMembership
}

const syncPatreonMembership = async (input: SyncPatreonMembershipInput): Promise<SyncedPatreonMembership> => {
  const now = new Date()
  const accessTokenFromOAuth = input.tokenPayload?.access_token
  const previousPatreonAccount = await prisma.patreonAccount.findUnique({
    where: {
      userId: input.userId
    },
    select: {
      refreshTokenEncrypted: true,
      tokenExpiresAt: true,
      membershipStatus: true,
      tierCents: true,
      pledgeCadenceMonths: true,
      lastChargeDate: true,
      nextChargeDate: true
    }
  })
  const previousPatreonEntitlement = await prisma.entitlement.findFirst({
    where: {
      userId: input.userId,
      source: 'PATREON'
    },
    orderBy: {
      updatedAt: 'desc'
    },
    select: {
      tierCode: true,
      status: true,
      validUntil: true
    }
  })

  let accessToken = accessTokenFromOAuth
  let refreshToken = input.tokenPayload?.refresh_token ?? null
  let tokenExpiresAt = input.tokenPayload ? new Date(Date.now() + input.tokenPayload.expires_in * 1000) : null

  if (!accessToken) {
    const persistedTokenResult = await ensureValidAccessToken(input.userId)

    if (!persistedTokenResult) {
      throw new Error('Patreon account is not linked for this user.')
    }

    accessToken = persistedTokenResult.accessToken
  }

  if (!refreshToken || !tokenExpiresAt) {
    if (previousPatreonAccount?.refreshTokenEncrypted) {
      refreshToken = decryptSecret(previousPatreonAccount.refreshTokenEncrypted)
    }

    tokenExpiresAt = previousPatreonAccount?.tokenExpiresAt ?? null
  }

  const identity = await fetchPatreonIdentity(accessToken)
  const snapshot = extractMembershipSnapshot(identity)

  return persistPatreonSnapshot({
    userId: input.userId,
    now,
    snapshot,
    accessToken,
    refreshToken,
    tokenExpiresAt,
    logSource: input.logSource,
    logActorUserId: input.logActorUserId,
    logActorLabel: input.logActorLabel,
    logTrigger: input.logTrigger,
    previousPatreonAccount,
    previousPatreonEntitlement
  })
}

const deactivatePatreonMembership = async (input: DeactivatePatreonMembershipInput) => {
  const now = input.now ?? new Date()

  await prisma.$transaction([
    prisma.patreonAccount.updateMany({
      where: {
        userId: input.userId
      },
      data: {
        tierCents: 0,
        membershipStatus: input.membershipStatus ?? 'former_patron',
        nextChargeDate: null,
        lastCheckedAt: now
      }
    }),
    prisma.entitlement.updateMany({
      where: {
        userId: input.userId,
        source: 'PATREON'
      },
      data: {
        tierCode: 'inactive',
        status: EntitlementStatus.INACTIVE,
        validUntil: now,
        updatedAt: now
      }
    })
  ])

  if (input.logSource) {
    await appendPatreonSyncLog({
      userId: input.userId,
      source: input.logSource,
      eventType: 'sync_deactivated',
      level: 'WARN',
      message: `Patreon entitlement was deactivated (${input.membershipStatus ?? 'former_patron'}).`,
      actorUserId: input.logActorUserId ?? null,
      actorLabel: input.logActorLabel ?? null,
      details: {
        trigger: input.logTrigger ?? null,
        membershipStatus: input.membershipStatus ?? 'former_patron',
        at: now.toISOString()
      }
    })
  }

  return {
    userId: input.userId,
    tierCode: 'inactive',
    entitlementStatus: EntitlementStatus.INACTIVE
  } as const
}

export { deactivatePatreonMembership, extractMembershipSnapshot, resolveSyncedPatreonEntitlementDecision, syncPatreonMembership }
export type { SyncedPatreonMembership }
