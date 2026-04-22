'use client'

import { useAuth } from '@/components/providers/auth-provider'
import AccountSideMenu from '@/components/shared/account-side-menu'
import MaintenanceWorkspaceGate from '@/components/shared/maintenance-workspace-gate'
import type { MembershipEntitlementRecord } from '@/components/ui-elements/membership-entitlement-row'
import MembershipStatusPill, { type MembershipConnectionStatus } from '@/components/ui-elements/membership-status-pill'
import MembershipTierCard from '@/components/ui-elements/membership-tier-card'
import { apiGet, apiPost } from '@/lib/api-client'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

const PatreonIcon = ({ className = 'size-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      d="M13.2 2.2C17.9 2.2 21.2 5 21.2 9.2C21.2 13.9 18.1 16.4 13.9 17.1C11.7 17.5 10.2 18.7 9.3 20.8C8.4 22.9 7.2 23.9 5.4 23.9C2.8 23.9 1.1 21.6 1.1 18.1V9.2C1.1 4.7 3.3 2.2 7.2 2.2C8.2 2.2 9.1 2.2 10.1 2.2C11.2 2.2 12.2 2.2 13.2 2.2Z"
      fill="currentColor"
    />
  </svg>
)

type MembershipTier = 'free' | 'just_models_900' | 'secretwaifu_1650'
type PatreonEntitlementApiRecord = {
  id: string
  tierCode: string
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED'
  validFrom: string | null
  validUntil: string | null
}

type PatreonStatusApiResponse = {
  linked: boolean
  membershipStatus: string
  tierCents: number
  patreonUserId: string | null
  lastCheckedAt: string | null
  nextChargeDate: string | null
  entitlements: PatreonEntitlementApiRecord[]
}

type MembershipAccessState = 'not-connected' | 'connected-inactive' | 'active-entitlement' | 'sync-in-progress'

const formatDateLabel = (value: string | null, fallbackLabel: string) => {
  if (!value) {
    return fallbackLabel
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return fallbackLabel
  }

  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(parsedDate)
}

const mapTierFromCents = (tierCents: number): MembershipTier => {
  if (tierCents >= 1650) {
    return 'secretwaifu_1650'
  }

  if (tierCents >= 900) {
    return 'just_models_900'
  }

  return 'free'
}

const mapMembershipStatusToChip = (linked: boolean, membershipStatus: string): MembershipConnectionStatus => {
  if (!linked) {
    return 'not-connected'
  }

  if (membershipStatus === 'active_patron') {
    return 'active'
  }

  if (membershipStatus === 'former_patron') {
    return 'canceled'
  }

  if (membershipStatus === 'declined_patron') {
    return 'expired'
  }

  return 'not-connected'
}

const mapEntitlements = (entitlements: PatreonEntitlementApiRecord[]): MembershipEntitlementRecord[] => {
  return entitlements.map((entitlement) => ({
    id: entitlement.id,
    featureKey: entitlement.tierCode,
    sourceProvider: 'patreon',
    validUntilLabel: formatDateLabel(entitlement.validUntil, 'No access'),
    status: entitlement.status === 'ACTIVE' ? 'active' : 'inactive'
  }))
}

const buildDerivedEntitlementFromPatreonStatus = (statusData: PatreonStatusApiResponse): MembershipEntitlementRecord[] => {
  const isAccountActive = statusData.linked && statusData.membershipStatus === 'active_patron' && statusData.tierCents > 0

  if (!isAccountActive) {
    return []
  }

  const derivedFeatureKey = statusData.tierCents >= 1650 ? 'secretwaifu_access' : statusData.tierCents >= 900 ? 'just_models' : 'patreon_active'

  return [
    {
      id: 'derived-patreon-account-tier',
      featureKey: derivedFeatureKey,
      sourceProvider: 'patreon',
      validUntilLabel: formatDateLabel(statusData.nextChargeDate, 'Active'),
      status: 'active'
    }
  ]
}

const mapPatreonCallbackErrorMessage = (rawMessage: string | null) => {
  const normalized = (rawMessage ?? '').trim().toLowerCase()

  if (!normalized) {
    return 'Patreon connection failed. Please try again.'
  }

  if (normalized.includes('invalid oauth state') || normalized.includes('oauth state expired')) {
    return 'Your Patreon connection session expired. Please sign in and click Connect Patreon again.'
  }

  if (normalized.includes('missing oauth code or state')) {
    return 'Patreon authorization was incomplete. Please try connecting again.'
  }

  return rawMessage ?? 'Patreon connection failed. Please try again.'
}

const mapMembershipActionErrorMessage = (rawMessage: string | null): string | null => {
  const text = rawMessage ?? ''
  const normalized = text.trim().toLowerCase()

  if (normalized.includes('maintenance') || text.includes('MAINTENANCE_MODE')) {
    return null
  }

  if (normalized.includes('authentication required')) {
    return 'Please sign in to SecretWaifu first, then click Connect Patreon.'
  }

  if (normalized.includes('email verification required')) {
    return 'Please verify your email on the Account page, then connect Patreon.'
  }

  if (normalized.includes('patreon oauth is not enabled')) {
    return 'Patreon connection is not enabled in this environment yet.'
  }

  if (normalized.includes('temporarily unavailable') || normalized.includes('oauth redirect configuration')) {
    return 'Patreon connection is temporarily unavailable due to server configuration. Please try again later or contact support.'
  }

  return text.trim() ? text : 'Unable to complete Patreon action.'
}

const MembershipPage = () => {
  const { sessionUser, isAuthLoading } = useAuth()
  const patreonExternalUrl = process.env.NEXT_PUBLIC_PATREON_URL ?? 'https://www.patreon.com'
  const modelsTierUrl = process.env.NEXT_PUBLIC_PATREON_TIER_MODELS_URL ?? patreonExternalUrl
  const secretwaifuTierUrl = process.env.NEXT_PUBLIC_PATREON_TIER_SECRETWAIFU_URL ?? patreonExternalUrl
  const [connectionStatus, setConnectionStatus] = useState<MembershipConnectionStatus>('not-connected')
  const [currentTier, setCurrentTier] = useState<MembershipTier>('free')
  const [isPatreonLinked, setIsPatreonLinked] = useState(false)
  const [lastSyncLabel, setLastSyncLabel] = useState('Never')
  const [periodEndLabel, setPeriodEndLabel] = useState('No active billing period')
  const [entitlementRecords, setEntitlementRecords] = useState<MembershipEntitlementRecord[]>([])
  const [membershipMessage, setMembershipMessage] = useState<string | null>(null)

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const patreonState = query.get('patreon')
    const errorMessage = query.get('message')

    if (patreonState === 'connected') {
      setMembershipMessage('Patreon connected successfully.')
    } else if (patreonState === 'error') {
      setMembershipMessage(mapPatreonCallbackErrorMessage(errorMessage))
    }

    if (patreonState || errorMessage) {
      window.history.replaceState({}, '', '/members')
    }
  }, [])

  const loadMembershipStatus = useCallback(async () => {
    if (!sessionUser) {
      setIsPatreonLinked(false)
      setCurrentTier('free')
      setConnectionStatus('not-connected')
      setLastSyncLabel('Never')
      setPeriodEndLabel('No active billing period')
      setEntitlementRecords([])
      return
    }

    setConnectionStatus('syncing')
    const payload = await apiGet<{ data: PatreonStatusApiResponse }>('/patreon/status')
    const statusData = payload.data

    /** Only show a paid tier when Patreon is linked and Patreon reports an active membership — avoids "Unlocked / Tier 2" while disconnected. */
    const tierForDisplay =
      statusData.linked && statusData.membershipStatus === 'active_patron'
        ? mapTierFromCents(statusData.tierCents)
        : 'free'

    setIsPatreonLinked(statusData.linked)
    setCurrentTier(tierForDisplay)
    setConnectionStatus(mapMembershipStatusToChip(statusData.linked, statusData.membershipStatus))
    setLastSyncLabel(formatDateLabel(statusData.lastCheckedAt, 'Never'))
    setPeriodEndLabel(formatDateLabel(statusData.nextChargeDate, 'No active billing period'))
    const mappedEntitlements = mapEntitlements(statusData.entitlements)
    setEntitlementRecords(mappedEntitlements.length > 0 ? mappedEntitlements : buildDerivedEntitlementFromPatreonStatus(statusData))
  }, [sessionUser])

  useEffect(() => {
    if (isAuthLoading) {
      return
    }

    loadMembershipStatus().catch((error) => {
      const rawMessage = error instanceof Error ? error.message : null
      setMembershipMessage(mapMembershipActionErrorMessage(rawMessage))
      setConnectionStatus('not-connected')
    })
  }, [isAuthLoading, loadMembershipStatus])

  const handleConnectPatreon = async () => {
    if (!sessionUser) {
      setMembershipMessage('Please sign in before connecting Patreon.')
      return
    }

    if (!sessionUser.isEmailVerified) {
      setMembershipMessage('Please verify your email on the Account page before connecting Patreon.')
      return
    }

    try {
      setConnectionStatus('syncing')
      setMembershipMessage(null)

      const query = new URLSearchParams({
        redirectAfter: '/members'
      })

      const payload = await apiGet<{ data: { authorizationUrl?: string } }>(`/patreon/connect?${query.toString()}`)

      if (!payload?.data?.authorizationUrl) {
        throw new Error('Unable to start Patreon connection.')
      }

      const patreonWindow = window.open(payload.data.authorizationUrl, '_blank', 'noopener,noreferrer')

      if (!patreonWindow) {
        const blockedPopupMessage = 'Unable to open Patreon authorization window.'
        setConnectionStatus('not-connected')
        setMembershipMessage(blockedPopupMessage)
        return
      }

      try {
        patreonWindow.blur()
        window.focus()
      } catch {
        // Ignore focus-management failures caused by browser policies.
      }

      setConnectionStatus('not-connected')
      const redirectedMessage =
        'Patreon opened in a new tab. Complete authorization there, then return here and click Recheck Tier. If Patreon shows "Redirect URI not supported", please contact support.'
      setMembershipMessage(redirectedMessage)
    } catch (error) {
      setConnectionStatus('not-connected')
      const rawMessage = error instanceof Error ? error.message : null
      const mappedMessage = mapMembershipActionErrorMessage(rawMessage)
      setMembershipMessage(mappedMessage)
    }
  }

  const handleRecheckMembership = async () => {
    if (!sessionUser || connectionStatus === 'syncing') {
      return
    }

    try {
      setConnectionStatus('syncing')
      setMembershipMessage(null)

      await apiPost<{ data: unknown }>('/patreon/sync')

      await loadMembershipStatus()
      setMembershipMessage('Membership synced successfully.')
    } catch (error) {
      setConnectionStatus('expired')
      const rawMessage = error instanceof Error ? error.message : null
      setMembershipMessage(mapMembershipActionErrorMessage(rawMessage))
    }
  }

  const handleDisconnectPatreon = async () => {
    if (!sessionUser || !isPatreonLinked || connectionStatus === 'syncing') {
      return
    }

    try {
      setConnectionStatus('syncing')
      setMembershipMessage(null)

      await apiPost<{ data: unknown }>('/patreon/disconnect')

      setIsPatreonLinked(false)
      setCurrentTier('free')
      setConnectionStatus('not-connected')
      setLastSyncLabel('Disconnected')
      setPeriodEndLabel('No active billing period')
      setEntitlementRecords([])
      setMembershipMessage('Patreon account disconnected.')
    } catch (error) {
      setConnectionStatus('canceled')
      const rawMessage = error instanceof Error ? error.message : null
      setMembershipMessage(mapMembershipActionErrorMessage(rawMessage))
    }
  }

  const activeEntitlementCount = useMemo(() => {
    return entitlementRecords.filter((entitlementItem) => entitlementItem.status === 'active').length
  }, [entitlementRecords])

  const hasActiveMembershipAccess = useMemo(() => {
    if (connectionStatus !== 'active') {
      return false
    }
    return activeEntitlementCount > 0 || currentTier !== 'free'
  }, [connectionStatus, activeEntitlementCount, currentTier])

  const membershipAccessState = useMemo<MembershipAccessState>(() => {
    if (connectionStatus === 'syncing') {
      return 'sync-in-progress'
    }

    if (!isPatreonLinked) {
      return 'not-connected'
    }

    if (hasActiveMembershipAccess) {
      return 'active-entitlement'
    }

    return 'connected-inactive'
  }, [connectionStatus, hasActiveMembershipAccess, isPatreonLinked])

  const membershipStateDescriptionMap: Record<MembershipAccessState, string> = {
    'not-connected': 'Connect Patreon to sync your tier and unlock gated content.',
    'connected-inactive': 'Patreon is linked, but no active entitlement is currently available for this account.',
    'active-entitlement': 'Your Patreon entitlement is active. Gated characters and member features are unlocked.',
    'sync-in-progress': 'We are syncing your Patreon membership data with the backend.'
  }

  const gatedAccessLabel = hasActiveMembershipAccess ? 'Unlocked' : 'Locked'
  const accessStateHelperText = hasActiveMembershipAccess ? 'Patreon content is available now' : 'Link Patreon to unlock gated content'

  const tierLabelMap: Record<MembershipTier, string> = {
    free: 'Free',
    just_models_900: 'Basic',
    secretwaifu_1650: 'Premium'
  }

  const accessTierHelperTextMap: Record<MembershipTier, string> = {
    free: 'Link Patreon and subscribe to unlock paid plans',
    just_models_900: 'Tier 1 active: models pack and polls',
    secretwaifu_1650: 'Tier 2 active: full SecretWaifu access'
  }
  const tierRankMap: Record<MembershipTier, number> = {
    free: 0,
    just_models_900: 1,
    secretwaifu_1650: 2
  }
  const currentTierRank = tierRankMap[currentTier]
  const getTierFooterLabel = (tier: MembershipTier) => {
    const tierRank = tierRankMap[tier]
    if (tierRank === currentTierRank) {
      return 'Current tier'
    }
    if (tierRank > currentTierRank) {
      return 'Upgrade available'
    }
    return 'Included in your tier'
  }
  const supportActionHref = membershipAccessState === 'connected-inactive' ? secretwaifuTierUrl : patreonExternalUrl
  const isSupportActionExternal = supportActionHref.startsWith('http')
  const connectButtonLabel = isPatreonLinked ? 'Reconnect Patreon' : 'Connect Patreon'
  const connectButtonClassName = isPatreonLinked
    ? 'inline-flex h-9 items-center justify-center gap-2 rounded-full border border-white/16 bg-white/[0.03] px-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition hover:border-ember-300 hover:text-ember-200 disabled:cursor-not-allowed disabled:opacity-50'
    : 'inline-flex h-9 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-ember-400 via-ember-500 to-[#ff7a2f] px-4 text-[10px] font-bold uppercase tracking-[0.14em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70'
  const connectionHint = !sessionUser
    ? 'Sign in to connect your Patreon account.'
    : !sessionUser.isEmailVerified
      ? 'Verify your email on the Account page before connecting Patreon.'
      : hasActiveMembershipAccess
        ? 'Your account is ready. Recheck after plan changes if you need to refresh access.'
        : 'Connect Patreon once, then refresh here whenever your tier changes.'

  return (
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-150px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(244,99,19,0.18),transparent_34%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_12%,rgba(255,132,71,0.12),transparent_28%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_24%,transparent_72%,rgba(255,255,255,0.02))]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px] opacity-35" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <div className="mt-10 grid min-w-0 gap-8 lg:grid-cols-[380px_1fr] lg:items-start">
            <AccountSideMenu activeKey="membership" />

            <MaintenanceWorkspaceGate>
            <div className="space-y-6">
              <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(140deg,rgba(29,18,18,0.98),rgba(10,10,12,0.94))] px-6 py-8 shadow-[0_28px_90px_rgba(0,0,0,0.38)] md:px-8 md:py-10">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(244,99,19,0.18),transparent_30%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(255,255,255,0.06),transparent_26%)]" />
                <div className="relative">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ember-200/85">Membership</p>
                  <h1 className="mt-3 font-[family-name:var(--font-heading)] text-[32px] font-normal italic leading-none text-white md:text-[38px]">
                    Membership
                  </h1>
                </div>
              </section>

              <div className="grid gap-4 xl:grid-cols-3">
                <MembershipTierCard
                  tierName="Free"
                  monthlyPriceLabel="$0 / month"
                  summary="A simple starting point for trying the platform and building your own experience."
                  benefitList={[
                    '10 messages per month',
                    'Upload custom characters',
                    'Core website account features'
                  ]}
                  accentTone="slate"
                  isCurrentTier={currentTier === 'free'}
                  footerLabel={getTierFooterLabel('free')}
                />
                <MembershipTierCard
                  tierName="Basic"
                  monthlyPriceLabel="$7.99 / month"
                  summary="For regular users who want a generous message cap and the key community perks."
                  benefitList={[
                    '1,000 messages per month',
                    'Limited in-game voice functionality',
                    'Upload custom characters',
                    'Core website account features',
                    'Monthly character poll',
                    'Discord title'
                  ]}
                  noteList={[]}
                  ctaLabel="Select"
                  ctaHref={modelsTierUrl}
                  accentTone="amber"
                  isCurrentTier={currentTier === 'just_models_900'}
                  footerLabel={getTierFooterLabel('just_models_900')}
                />
                <MembershipTierCard
                  tierName="Premium"
                  monthlyPriceLabel="$12.99 / month"
                  summary="The full experience with unlimited chatting, richer voice features, and premium extras."
                  benefitList={[
                    'Unlimited messages per month',
                    'Unlimited character voice functionality',
                    'Unique NSFW voices',
                    'Upload custom characters',
                    'Core website account features',
                    'Monthly character poll',
                    'Discord title'
                  ]}
                  ctaLabel="Select"
                  ctaHref={secretwaifuTierUrl}
                  accentTone="rose"
                  isMostPopular
                  isCurrentTier={currentTier === 'secretwaifu_1650'}
                  footerLabel={getTierFooterLabel('secretwaifu_1650')}
                />
              </div>

              <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(18,16,18,0.95))] p-4 md:p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/52">Account Status</p>
                  <MembershipStatusPill status={connectionStatus} />
                </div>
                <p className="mt-3 font-[family-name:var(--font-heading)] text-[24px] italic leading-none text-white">
                  {gatedAccessLabel} for {tierLabelMap[currentTier]}
                </p>
                <p className="mt-2 max-w-[620px] text-[13px] leading-6 text-white/66">
                  {membershipStateDescriptionMap[membershipAccessState]}
                </p>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-[18px] border border-white/8 bg-black/20 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Plan</p>
                    <p className="mt-1.5 text-[13px] font-semibold text-white">{tierLabelMap[currentTier]}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-black/20 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Last Check</p>
                    <p className="mt-1.5 text-[13px] font-semibold text-white">{lastSyncLabel}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-black/20 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Billing</p>
                    <p className="mt-1.5 text-[13px] font-semibold text-white">{periodEndLabel}</p>
                  </div>
                </div>

                {membershipMessage ? (
                  <p className="mt-4 rounded-[18px] border border-ember-300/25 bg-ember-300/10 px-3 py-2.5 text-[13px] leading-5 text-ember-100">
                    {membershipMessage}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleConnectPatreon}
                    disabled={!sessionUser || !sessionUser.isEmailVerified || connectionStatus === 'syncing'}
                    className={connectButtonClassName}
                    aria-label="Connect Patreon and verify membership"
                  >
                    <span>{connectButtonLabel}</span>
                    <PatreonIcon className="size-[13px]" />
                  </button>

                  <button
                    type="button"
                    onClick={handleRecheckMembership}
                    disabled={!isPatreonLinked || connectionStatus === 'syncing'}
                    className="inline-flex h-9 items-center justify-center rounded-full border border-white/16 bg-white/[0.03] px-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition hover:border-ember-300 hover:text-ember-200 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Refresh membership status from Patreon"
                  >
                    Refresh Status
                  </button>

                  <Link
                    href={supportActionHref}
                    target={isSupportActionExternal ? '_blank' : undefined}
                    rel={isSupportActionExternal ? 'noreferrer' : undefined}
                    className="inline-flex h-9 items-center justify-center rounded-full border border-white/14 px-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/88 transition hover:border-ember-300 hover:text-ember-200"
                    aria-label="Open membership plans and support page"
                  >
                    {membershipAccessState === 'connected-inactive' ? 'Upgrade Plan' : 'View Patreon'}
                  </Link>

                  {isPatreonLinked ? (
                    <button
                      type="button"
                      onClick={handleDisconnectPatreon}
                      disabled={connectionStatus === 'syncing'}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-rose-300/28 px-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-100 transition hover:border-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Disconnect Patreon account"
                    >
                      Disconnect
                    </button>
                  ) : null}
                </div>

                <p className="mt-3 text-[11px] leading-5 text-white/58">{connectionHint}</p>
                <p className="mt-1.5 text-[11px] leading-5 text-white/50">
                  {currentTier === 'free' ? accessStateHelperText : accessTierHelperTextMap[currentTier]}
                </p>
              </section>
            </div>
            </MaintenanceWorkspaceGate>
          </div>
        </div>
      </section>

    </main>
  )
}

export default MembershipPage
