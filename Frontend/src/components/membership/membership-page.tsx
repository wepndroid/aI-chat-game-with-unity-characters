'use client'

import AccountSideMenu from '@/components/shared/account-side-menu'
import DashboardStatCard from '@/components/ui-elements/dashboard-stat-card'
import MembershipEntitlementRow, { type MembershipEntitlementRecord } from '@/components/ui-elements/membership-entitlement-row'
import MembershipStatusPill, { type MembershipConnectionStatus } from '@/components/ui-elements/membership-status-pill'
import MembershipTierCard from '@/components/ui-elements/membership-tier-card'
import { readSessionUser } from '@/lib/auth-session'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

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

const MembershipPage = () => {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000/api'
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
      setMembershipMessage(errorMessage ?? 'Patreon connection failed.')
    }

    if (patreonState || errorMessage) {
      window.history.replaceState({}, '', '/members')
    }
  }, [])

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

  const loadMembershipStatus = async () => {
    const sessionUser = readSessionUser()

    if (!sessionUser) {
      setIsPatreonLinked(false)
      setCurrentTier('free')
      setConnectionStatus('not-connected')
      setLastSyncLabel('Never')
      setPeriodEndLabel('No active billing period')
      setEntitlementRecords(inactiveEntitlementRecords)
      return
    }

    const response = await fetch(`${apiBaseUrl}/patreon/status?email=${encodeURIComponent(sessionUser.email)}`)

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null
      throw new Error(errorPayload?.message ?? 'Failed to load Patreon status.')
    }

    const payload = (await response.json()) as { data: PatreonStatusApiResponse }
    const statusData = payload.data

    setIsPatreonLinked(statusData.linked)
    setCurrentTier(mapTierFromCents(statusData.tierCents))
    setConnectionStatus(mapMembershipStatusToChip(statusData.linked, statusData.membershipStatus))
    setLastSyncLabel(formatDateLabel(statusData.lastCheckedAt, 'Never'))
    setPeriodEndLabel(formatDateLabel(statusData.nextChargeDate, 'No active billing period'))
    setEntitlementRecords(mapEntitlements(statusData.entitlements))
    setSyncCount((previousCount) => previousCount + 1)
  }

  useEffect(() => {
    loadMembershipStatus().catch((error) => {
      setMembershipMessage(error instanceof Error ? error.message : 'Failed to load membership status.')
      setConnectionStatus('not-connected')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleConnectPatreon = async () => {
    const sessionUser = readSessionUser()

    if (!sessionUser) {
      setMembershipMessage('Please sign in before connecting Patreon.')
      return
    }

    try {
      setConnectionStatus('syncing')
      setMembershipMessage(null)

      const query = new URLSearchParams({
        email: sessionUser.email,
        username: sessionUser.username,
        redirectAfter: '/members'
      })

      const response = await fetch(`${apiBaseUrl}/patreon/connect?${query.toString()}`)
      const payload = (await response.json().catch(() => null)) as
        | {
          data?: {
            authorizationUrl?: string
          }
          message?: string
        }
        | null

      if (!response.ok || !payload?.data?.authorizationUrl) {
        throw new Error(payload?.message ?? 'Unable to start Patreon connection.')
      }

      window.location.assign(payload.data.authorizationUrl)
    } catch (error) {
      setConnectionStatus('not-connected')
      setMembershipMessage(error instanceof Error ? error.message : 'Unable to start Patreon connection.')
    }
  }

  const handleRecheckMembership = async () => {
    const sessionUser = readSessionUser()

    if (!sessionUser || connectionStatus === 'syncing') {
      return
    }

    try {
      setConnectionStatus('syncing')
      setMembershipMessage(null)

      const response = await fetch(`${apiBaseUrl}/patreon/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: sessionUser.email
        })
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(payload?.message ?? 'Unable to refresh Patreon status.')
      }

      await loadMembershipStatus()
      setMembershipMessage('Membership synced successfully.')
    } catch (error) {
      setConnectionStatus('expired')
      setMembershipMessage(error instanceof Error ? error.message : 'Unable to refresh Patreon status.')
    }
  }

  const handleDisconnectPatreon = async () => {
    const sessionUser = readSessionUser()

    if (!sessionUser || !isPatreonLinked || connectionStatus === 'syncing') {
      return
    }

    try {
      setConnectionStatus('syncing')
      setMembershipMessage(null)

      const response = await fetch(`${apiBaseUrl}/patreon/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: sessionUser.email
        })
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(payload?.message ?? 'Unable to disconnect Patreon.')
      }

      setIsPatreonLinked(false)
      setCurrentTier('free')
      setConnectionStatus('not-connected')
      setLastSyncLabel('Disconnected')
      setPeriodEndLabel('No active billing period')
      setEntitlementRecords(inactiveEntitlementRecords)
      setMembershipMessage('Patreon account disconnected.')
    } catch (error) {
      setConnectionStatus('canceled')
      setMembershipMessage(error instanceof Error ? error.message : 'Unable to disconnect Patreon.')
    }
  }

  const activeEntitlementCount = useMemo(() => {
    return entitlementRecords.filter((entitlementItem) => entitlementItem.status === 'active').length
  }, [entitlementRecords])

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

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleConnectPatreon}
                    disabled={connectionStatus === 'syncing'}
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
                    href={patreonExternalUrl}
                    target={patreonExternalUrl.startsWith('http') ? '_blank' : undefined}
                    rel={patreonExternalUrl.startsWith('http') ? 'noreferrer' : undefined}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/85 transition hover:border-ember-300 hover:text-ember-200"
                    aria-label="Open membership plans and support page"
                  >
                    Open Patreon
                  </Link>
                </div>
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
