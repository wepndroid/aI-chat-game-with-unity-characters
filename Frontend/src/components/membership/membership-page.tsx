'use client'

import { useAuth } from '@/components/providers/auth-provider'
import AccountSideMenu from '@/components/shared/account-side-menu'
import DashboardStatCard from '@/components/ui-elements/dashboard-stat-card'
import MembershipEntitlementRow, { type MembershipEntitlementRecord } from '@/components/ui-elements/membership-entitlement-row'
import MembershipStatusPill, { type MembershipConnectionStatus } from '@/components/ui-elements/membership-status-pill'
import MembershipTierCard from '@/components/ui-elements/membership-tier-card'
import { apiGet, apiPost } from '@/lib/api-client'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

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

const inactiveEntitlementRecords: MembershipEntitlementRecord[] = [
  {
    id: 'entitlement-just-models',
    featureKey: 'just_models',
    sourceProvider: 'patreon',
    validUntilLabel: 'No access',
    status: 'inactive'
  },
  {
    id: 'entitlement-secretwaifu-access',
    featureKey: 'secretwaifu_access',
    sourceProvider: 'patreon',
    validUntilLabel: 'No access',
    status: 'inactive'
  }
]

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
  if (entitlements.length === 0) {
    return inactiveEntitlementRecords
  }

  return entitlements.map((entitlement) => ({
    id: entitlement.id,
    featureKey: entitlement.tierCode,
    sourceProvider: 'patreon',
    validUntilLabel: formatDateLabel(entitlement.validUntil, 'No access'),
    status: entitlement.status === 'ACTIVE' ? 'active' : 'inactive'
  }))
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

const mapMembershipActionErrorMessage = (rawMessage: string | null) => {
  const normalized = (rawMessage ?? '').trim().toLowerCase()

  if (normalized.includes('authentication required')) {
    return 'Please sign in to SecretWaifu first, then click Connect Patreon.'
  }

  if (normalized.includes('email verification required')) {
    return 'Please verify your email on the Profile page, then connect Patreon.'
  }

  if (normalized.includes('patreon oauth is not enabled')) {
    return 'Patreon connection is not enabled in this environment yet.'
  }

  if (normalized.includes('temporarily unavailable') || normalized.includes('oauth redirect configuration')) {
    return 'Patreon connection is temporarily unavailable due to server configuration. Please try again later or contact support.'
  }

  return rawMessage ?? 'Unable to complete Patreon action.'
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
  const [entitlementRecords, setEntitlementRecords] = useState<MembershipEntitlementRecord[]>(inactiveEntitlementRecords)
  const [syncCount, setSyncCount] = useState(0)
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
      setEntitlementRecords(inactiveEntitlementRecords)
      return
    }

    setConnectionStatus('syncing')
    const payload = await apiGet<{ data: PatreonStatusApiResponse }>('/patreon/status')
    const statusData = payload.data

    setIsPatreonLinked(statusData.linked)
    setCurrentTier(mapTierFromCents(statusData.tierCents))
    setConnectionStatus(mapMembershipStatusToChip(statusData.linked, statusData.membershipStatus))
    setLastSyncLabel(formatDateLabel(statusData.lastCheckedAt, 'Never'))
    setPeriodEndLabel(formatDateLabel(statusData.nextChargeDate, 'No active billing period'))
    setEntitlementRecords(mapEntitlements(statusData.entitlements))
    setSyncCount((previousCount) => previousCount + 1)
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
      setMembershipMessage('Please verify your email on the Profile page before connecting Patreon.')
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
      setEntitlementRecords(inactiveEntitlementRecords)
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

  const membershipAccessState = useMemo<MembershipAccessState>(() => {
    if (connectionStatus === 'syncing') {
      return 'sync-in-progress'
    }

    if (!isPatreonLinked) {
      return 'not-connected'
    }

    if (activeEntitlementCount > 0) {
      return 'active-entitlement'
    }

    return 'connected-inactive'
  }, [activeEntitlementCount, connectionStatus, isPatreonLinked])

  const membershipStateLabelMap: Record<MembershipAccessState, string> = {
    'not-connected': 'Not Connected',
    'connected-inactive': 'Connected But Inactive',
    'active-entitlement': 'Active Entitlement',
    'sync-in-progress': 'Sync In Progress'
  }

  const membershipStateDescriptionMap: Record<MembershipAccessState, string> = {
    'not-connected': 'Connect Patreon to sync your tier and unlock gated content.',
    'connected-inactive': 'Patreon is linked, but no active entitlement is currently available for this account.',
    'active-entitlement': 'Your Patreon entitlement is active. Gated characters and member features are unlocked.',
    'sync-in-progress': 'We are syncing your Patreon membership data with the backend.'
  }

  const gatedAccessLabel = activeEntitlementCount > 0 ? 'Unlocked' : 'Locked'
  const accessStateHelperText = activeEntitlementCount > 0 ? 'Patreon content is available now' : 'Link Patreon to unlock gated content'

  const tierLabelMap: Record<MembershipTier, string> = {
    free: 'Free',
    just_models_900: 'Just Our Models',
    secretwaifu_1650: 'SecretWaifu Access'
  }

  const tierPriceLabelMap: Record<MembershipTier, string> = {
    free: '$0 / month',
    just_models_900: 'EUR 9.00 / month (+VAT)',
    secretwaifu_1650: 'EUR 16.50 / month (+VAT)'
  }

  const accessTierHelperTextMap: Record<MembershipTier, string> = {
    free: 'Link Patreon and subscribe to unlock paid plans',
    just_models_900: 'Tier 1 active: models pack and polls',
    secretwaifu_1650: 'Tier 2 active: full SecretWaifu access'
  }
  const supportActionHref = membershipAccessState === 'connected-inactive' ? secretwaifuTierUrl : patreonExternalUrl
  const isSupportActionExternal = supportActionHref.startsWith('http')

  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-150px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_44%_0%,rgba(244,99,19,0.12),transparent_38%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-50" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-4xl font-normal italic leading-none text-white md:text-5xl">
            Membership
          </h1>
          <p className="mx-auto mt-3 max-w-[780px] text-center text-sm leading-7 text-white/70">
            Connect Patreon, verify your tier, and keep entitlement access synced for gated characters and member-only content.
          </p>
          {membershipMessage ? (
            <p className="mx-auto mt-3 max-w-[780px] rounded-md border border-ember-300/30 bg-ember-300/10 px-4 py-2 text-center text-xs uppercase tracking-[0.08em] text-ember-100">
              {membershipMessage}
            </p>
          ) : null}

          <div className="mt-10 grid gap-8 lg:grid-cols-[380px_1fr]">
            <AccountSideMenu activeKey="membership" />

            <div className="space-y-5">
              <article className="rounded-xl border border-white/10 bg-[#151214]/95 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">Provider</p>
                    <p className="mt-1 font-[family-name:var(--font-heading)] text-[22px] font-normal italic leading-none text-white">Patreon OAuth</p>
                  </div>
                  <MembershipStatusPill status={connectionStatus} />
                </div>

                <div className="mt-4 grid gap-2 text-xs uppercase tracking-[0.08em] text-white/65 sm:grid-cols-2">
                  <p>Current Tier: {tierLabelMap[currentTier]}</p>
                  <p>Price: {tierPriceLabelMap[currentTier]}</p>
                  <p>Last Sync: {lastSyncLabel}</p>
                  <p>Current Period Ends: {periodEndLabel}</p>
                </div>
                <div className="mt-4 rounded-md border border-white/10 bg-[#0f0d10] px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ember-200">
                    {membershipStateLabelMap[membershipAccessState]}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/75">{membershipStateDescriptionMap[membershipAccessState]}</p>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleConnectPatreon}
                    disabled={!sessionUser || !sessionUser.isEmailVerified || connectionStatus === 'syncing'}
                    className="inline-flex h-10 items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                    aria-label="Connect Patreon and verify membership"
                  >
                    {isPatreonLinked ? 'Reconnect Patreon' : 'Connect Patreon'}
                  </button>

                  <button
                    type="button"
                    onClick={handleRecheckMembership}
                    disabled={!isPatreonLinked || connectionStatus === 'syncing'}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-white transition hover:border-ember-300 hover:text-ember-200 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Refresh membership status from Patreon"
                  >
                    Recheck Tier
                  </button>

                  <button
                    type="button"
                    onClick={handleDisconnectPatreon}
                    disabled={!isPatreonLinked || connectionStatus === 'syncing'}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-rose-300/35 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-rose-100 transition hover:border-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Disconnect Patreon account"
                  >
                    Disconnect
                  </button>

                  <Link
                    href={supportActionHref}
                    target={isSupportActionExternal ? '_blank' : undefined}
                    rel={isSupportActionExternal ? 'noreferrer' : undefined}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/85 transition hover:border-ember-300 hover:text-ember-200"
                    aria-label="Open membership plans and support page"
                  >
                    {membershipAccessState === 'connected-inactive' ? 'Upgrade Tier' : 'Open Patreon'}
                  </Link>
                </div>
                {!sessionUser ? (
                  <p className="mt-3 text-[11px] uppercase tracking-[0.08em] text-amber-100">
                    Sign in to connect Patreon.
                  </p>
                ) : null}
                {sessionUser && !sessionUser.isEmailVerified ? (
                  <p className="mt-3 text-[11px] uppercase tracking-[0.08em] text-amber-100">
                    Verify your email on the Profile page before connecting Patreon.
                  </p>
                ) : null}
              </article>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <DashboardStatCard
                  value={isPatreonLinked ? 'Linked' : 'Not linked'}
                  label="Patreon Connection"
                  helperText="OAuth state for this account"
                  isEmphasized={isPatreonLinked}
                />
                <DashboardStatCard
                  value={tierLabelMap[currentTier]}
                  label="Current Tier"
                  helperText={tierPriceLabelMap[currentTier]}
                  isEmphasized={currentTier === 'secretwaifu_1650'}
                />
                <DashboardStatCard
                  value={activeEntitlementCount.toString()}
                  label="Active Entitlements"
                  helperText="Used for server-side access checks"
                />
                <DashboardStatCard
                  value={gatedAccessLabel}
                  label="Gated Access"
                  helperText={currentTier === 'free' ? accessStateHelperText : accessTierHelperTextMap[currentTier]}
                  isEmphasized={activeEntitlementCount > 0}
                />
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                <MembershipTierCard
                  tierName="Free"
                  monthlyPriceLabel="$0 / month"
                  summary="Base access plan for public website and character browsing."
                  benefitList={[
                    'Browse approved public VRoid gallery',
                    'View character pages and screenshots',
                    'Submit public reviews and hearts',
                    'Use account profile and favorites'
                  ]}
                  ctaLabel="Use Free"
                  ctaHref="/characters"
                  isCurrentTier={currentTier === 'free'}
                />
                <MembershipTierCard
                  tierName="Just Our Models"
                  monthlyPriceLabel="EUR 9.00 / month (plus VAT)"
                  summary="Models-only plan for character packs and community updates."
                  benefitList={[
                    'Access to the Patreon character pack',
                    'Monthly character poll',
                    'Developer blog',
                    'Patreon exclusive posts and messages',
                    'Discord access'
                  ]}
                  noteList={[]}
                  ctaLabel="Select"
                  ctaHref={modelsTierUrl}
                  isCurrentTier={currentTier === 'just_models_900'}
                />
                <MembershipTierCard
                  tierName="SecretWaifu Access"
                  monthlyPriceLabel="EUR 16.50 / month (plus VAT)"
                  summary="Full access plan with game access and premium Patreon perks."
                  benefitList={[
                    'Access to Hey Waifu',
                    'Full library access',
                    'Patreon exclusive clothed and nude character pack',
                    'Patreon exclusive posts and messages',
                    'Patreon exclusive character polls',
                    'Discord access'
                  ]}
                  ctaLabel="Select"
                  ctaHref={secretwaifuTierUrl}
                  isMostPopular
                  isCurrentTier={currentTier === 'secretwaifu_1650'}
                />
              </div>

              <article className="rounded-xl border border-white/10 bg-[#151214]/95 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-[family-name:var(--font-heading)] text-[25px] font-normal italic leading-none text-white">Entitlements</h2>
                    <p className="mt-1 text-xs uppercase tracking-[0.09em] text-white/55">
                      Server-side permissions snapshot synced from Patreon
                    </p>
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/60">Sync Count: {syncCount}</p>
                </div>

                <div className="mt-4 hidden rounded-lg border border-white/10 bg-[#0f0e10] px-3 py-2 text-[11px] uppercase tracking-[0.09em] text-white/60 sm:grid sm:grid-cols-[1.4fr_0.8fr_0.9fr_0.7fr]">
                  <p>Feature Key</p>
                  <p>Source</p>
                  <p>Valid Until</p>
                  <p>Status</p>
                </div>

                <div className="mt-2 space-y-2">
                  {entitlementRecords.map((entitlementItem) => (
                    <MembershipEntitlementRow key={entitlementItem.id} entitlementRecord={entitlementItem} />
                  ))}
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

    </main>
  )
}

export default MembershipPage
