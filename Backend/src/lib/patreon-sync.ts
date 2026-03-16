import { EntitlementStatus } from '@prisma/client'
import { decryptSecret, encryptSecret } from './crypto'
import { fetchPatreonIdentity, refreshPatreonAccessToken } from './patreon-client'
import type { PatreonIdentityResponse, PatreonTokenPayload } from './patreon-client'
import { prisma } from './prisma'

type SyncPatreonMembershipInput = {
  userId: string
  tokenPayload?: PatreonTokenPayload
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
}

const parseDate = (value: unknown) => {
  if (!value || typeof value !== 'string') {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const mapTierCodeFromCents = (tierCents: number) => {
  if (tierCents >= 1650) {
    return 'secretwaifu_access'
  }

  if (tierCents >= 900) {
    return 'just_models'
  }

  return 'inactive'
}

const mapCanonicalTierCentsFromCode = (tierCode: string) => {
  if (tierCode === 'secretwaifu_access') {
    return 1650
  }

  if (tierCode === 'just_models') {
    return 900
  }

  return 0
}

const extractMembershipSnapshot = (identity: PatreonIdentityResponse) => {
  const memberships = (identity.included ?? []).filter((resource) => resource.type === 'member')
  const tiers = (identity.included ?? []).filter((resource) => resource.type === 'tier')
  const selectedMembership = memberships[0]

  const memberAttributes = selectedMembership?.attributes ?? {}
  const patronStatus = typeof memberAttributes.patron_status === 'string' ? memberAttributes.patron_status : 'not_connected'
  const lastChargeStatus = typeof memberAttributes.last_charge_status === 'string' ? memberAttributes.last_charge_status : null
  const lastChargeDate = parseDate(memberAttributes.last_charge_date)
  const nextChargeDate = parseDate(memberAttributes.next_charge_date)

  const entitledTierIds = Array.isArray(
    (selectedMembership?.relationships?.currently_entitled_tiers as { data?: Array<{ id: string }> } | undefined)?.data
  )
    ? ((selectedMembership?.relationships?.currently_entitled_tiers as { data?: Array<{ id: string }> }).data ?? [])
        .map((tierRelation) => tierRelation.id)
        .filter(Boolean)
    : []

  const entitledTierAmounts = tiers
    .filter((tier) => entitledTierIds.includes(tier.id))
    .map((tier) => (typeof tier.attributes?.amount_cents === 'number' ? tier.attributes.amount_cents : 0))

  const maxTierAmount = entitledTierAmounts.length > 0 ? Math.max(...entitledTierAmounts) : 0
  const entitledAmountFromMember =
    typeof memberAttributes.currently_entitled_amount_cents === 'number' ? memberAttributes.currently_entitled_amount_cents : 0
  const tierCents = Math.max(maxTierAmount, entitledAmountFromMember)
  const campaignId =
    (selectedMembership?.relationships?.campaign as { data?: { id?: string } } | undefined)?.data?.id ?? null

  return {
    patreonUserId: identity.data.id,
    campaignMemberId: selectedMembership?.id ?? null,
    campaignId,
    patronStatus,
    tierCents,
    lastChargeStatus,
    lastChargeDate,
    nextChargeDate
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

const syncPatreonMembership = async (input: SyncPatreonMembershipInput): Promise<SyncedPatreonMembership> => {
  const now = new Date()
  const accessTokenFromOAuth = input.tokenPayload?.access_token

  let accessToken = accessTokenFromOAuth
  let refreshToken = input.tokenPayload?.refresh_token
  let tokenExpiresAt = input.tokenPayload ? new Date(Date.now() + input.tokenPayload.expires_in * 1000) : null

  if (!accessToken) {
    const persistedTokenResult = await ensureValidAccessToken(input.userId)

    if (!persistedTokenResult) {
      throw new Error('Patreon account is not linked for this user.')
    }

    accessToken = persistedTokenResult.accessToken
  }

  const identity = await fetchPatreonIdentity(accessToken)
  const snapshot = extractMembershipSnapshot(identity)
  const requiredCampaignId = process.env.PATREON_CAMPAIGN_ID?.trim() || null
  const isCampaignMatch = !requiredCampaignId || snapshot.campaignId === requiredCampaignId
  const effectiveTierCents = isCampaignMatch ? snapshot.tierCents : 0
  const effectiveMembershipStatus = isCampaignMatch ? snapshot.patronStatus : 'campaign_mismatch'
  const tierCode = mapTierCodeFromCents(effectiveTierCents)
  const canonicalTierCents = mapCanonicalTierCentsFromCode(tierCode)
  const entitlementStatus =
    effectiveMembershipStatus === 'active_patron' && canonicalTierCents > 0 ? EntitlementStatus.ACTIVE : EntitlementStatus.INACTIVE

  if (!refreshToken || !tokenExpiresAt) {
    const currentPatreonAccount = await prisma.patreonAccount.findUnique({
      where: {
        userId: input.userId
      }
    })

    if (currentPatreonAccount?.refreshTokenEncrypted) {
      refreshToken = decryptSecret(currentPatreonAccount.refreshTokenEncrypted)
    }

    tokenExpiresAt = currentPatreonAccount?.tokenExpiresAt ?? null
  }

  const accessTokenEncrypted = encryptSecret(accessToken)
  const refreshTokenEncrypted = refreshToken ? encryptSecret(refreshToken) : null

  await prisma.patreonAccount.upsert({
    where: {
      userId: input.userId
    },
    update: {
      patreonUserId: snapshot.patreonUserId,
      campaignMemberId: snapshot.campaignMemberId,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenExpiresAt,
      tierCents: canonicalTierCents,
      membershipStatus: effectiveMembershipStatus,
      lastChargeStatus: snapshot.lastChargeStatus,
      lastChargeDate: snapshot.lastChargeDate,
      nextChargeDate: snapshot.nextChargeDate,
      lastCheckedAt: now
    },
    create: {
      userId: input.userId,
      patreonUserId: snapshot.patreonUserId,
      campaignMemberId: snapshot.campaignMemberId,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenExpiresAt,
      tierCents: canonicalTierCents,
      membershipStatus: effectiveMembershipStatus,
      lastChargeStatus: snapshot.lastChargeStatus,
      lastChargeDate: snapshot.lastChargeDate,
      nextChargeDate: snapshot.nextChargeDate,
      lastCheckedAt: now
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
      validFrom: now,
      validUntil: snapshot.nextChargeDate,
      updatedAt: now
    },
    create: {
      id: `patreon-entitlement-${input.userId}`,
      userId: input.userId,
      source: 'PATREON',
      tierCode,
      status: entitlementStatus,
      validFrom: now,
      validUntil: snapshot.nextChargeDate
    }
  })

  return {
    linked: true,
    patreonUserId: snapshot.patreonUserId,
    tierCents: canonicalTierCents,
    tierCode,
    membershipStatus: effectiveMembershipStatus,
    lastCheckedAt: now.toISOString(),
    nextChargeDate: snapshot.nextChargeDate ? snapshot.nextChargeDate.toISOString() : null,
    entitlementStatus
  }
}

export { syncPatreonMembership }
export type { SyncedPatreonMembership }
