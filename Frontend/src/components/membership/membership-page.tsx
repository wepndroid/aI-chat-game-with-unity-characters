'use client'

import AccountSideMenu from '@/components/shared/account-side-menu'
import DashboardStatCard from '@/components/ui-elements/dashboard-stat-card'
import MembershipEntitlementRow, { type MembershipEntitlementRecord } from '@/components/ui-elements/membership-entitlement-row'
import MembershipStatusPill, { type MembershipConnectionStatus } from '@/components/ui-elements/membership-status-pill'
import MembershipTierCard from '@/components/ui-elements/membership-tier-card'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

type MembershipTier = 'free' | 'supporter_799' | 'premium_1799'

const inactiveEntitlementRecords: MembershipEntitlementRecord[] = [
  {
    id: 'entitlement-premium-gallery',
    featureKey: 'premium_gallery',
    sourceProvider: 'patreon',
    validUntilLabel: 'No access',
    status: 'inactive'
  },
  {
    id: 'entitlement-exclusive-characters',
    featureKey: 'exclusive_characters',
    sourceProvider: 'patreon',
    validUntilLabel: 'No access',
    status: 'inactive'
  },
  {
    id: 'entitlement-high-priority-queue',
    featureKey: 'priority_character_queue',
    sourceProvider: 'patreon',
    validUntilLabel: 'No access',
    status: 'inactive'
  }
]

const activeEntitlementRecords: MembershipEntitlementRecord[] = [
  {
    id: 'entitlement-premium-gallery',
    featureKey: 'premium_gallery',
    sourceProvider: 'patreon',
    validUntilLabel: 'Apr 12, 2026',
    status: 'active'
  },
  {
    id: 'entitlement-exclusive-characters',
    featureKey: 'exclusive_characters',
    sourceProvider: 'patreon',
    validUntilLabel: 'Apr 12, 2026',
    status: 'active'
  },
  {
    id: 'entitlement-high-priority-queue',
    featureKey: 'priority_character_queue',
    sourceProvider: 'patreon',
    validUntilLabel: 'Apr 12, 2026',
    status: 'active'
  }
]

const MembershipPage = () => {
  const [connectionStatus, setConnectionStatus] = useState<MembershipConnectionStatus>('not-connected')
  const [currentTier, setCurrentTier] = useState<MembershipTier>('free')
  const [isPatreonLinked, setIsPatreonLinked] = useState(false)
  const [lastSyncLabel, setLastSyncLabel] = useState('Never')
  const [periodEndLabel, setPeriodEndLabel] = useState('No active billing period')
  const [entitlementRecords, setEntitlementRecords] = useState<MembershipEntitlementRecord[]>(inactiveEntitlementRecords)
  const [syncCount, setSyncCount] = useState(0)
  const pendingSyncTimeoutReference = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClearPendingSync = () => {
    if (!pendingSyncTimeoutReference.current) {
      return
    }

    clearTimeout(pendingSyncTimeoutReference.current)
    pendingSyncTimeoutReference.current = null
  }

  useEffect(() => {
    return () => {
      handleClearPendingSync()
    }
  }, [])

  const handleSetActiveMembershipState = () => {
    setIsPatreonLinked(true)
    setCurrentTier('premium_1799')
    setConnectionStatus('active')
    setLastSyncLabel('Just now')
    setPeriodEndLabel('Apr 12, 2026')
    setEntitlementRecords(activeEntitlementRecords)
    setSyncCount((previousCount) => previousCount + 1)
  }

  const handleConnectPatreon = () => {
    if (connectionStatus === 'syncing') {
      return
    }

    setConnectionStatus('syncing')
    handleClearPendingSync()

    pendingSyncTimeoutReference.current = setTimeout(() => {
      handleSetActiveMembershipState()
      pendingSyncTimeoutReference.current = null
    }, 900)
  }

  const handleRecheckMembership = () => {
    if (!isPatreonLinked || connectionStatus === 'syncing') {
      return
    }

    setConnectionStatus('syncing')
    handleClearPendingSync()

    pendingSyncTimeoutReference.current = setTimeout(() => {
      setConnectionStatus('active')
      setLastSyncLabel('Just now')
      setSyncCount((previousCount) => previousCount + 1)
      pendingSyncTimeoutReference.current = null
    }, 700)
  }

  const handleDisconnectPatreon = () => {
    if (!isPatreonLinked || connectionStatus === 'syncing') {
      return
    }

    handleClearPendingSync()
    setIsPatreonLinked(false)
    setCurrentTier('free')
    setConnectionStatus('not-connected')
    setLastSyncLabel('Disconnected just now')
    setPeriodEndLabel('No active billing period')
    setEntitlementRecords(inactiveEntitlementRecords)
  }

  const activeEntitlementCount = useMemo(() => {
    return entitlementRecords.filter((entitlementItem) => entitlementItem.status === 'active').length
  }, [entitlementRecords])

  const gatedAccessLabel = activeEntitlementCount > 0 ? 'Unlocked' : 'Locked'
  const accessStateHelperText = activeEntitlementCount > 0 ? 'Patreon content is available now' : 'Link Patreon to unlock gated content'

  const tierLabelMap: Record<MembershipTier, string> = {
    free: 'Free',
    supporter_799: 'Supporter',
    premium_1799: 'Premium 17.99'
  }

  const tierPriceLabelMap: Record<MembershipTier, string> = {
    free: '$0 / month',
    supporter_799: '$7.99 / month',
    premium_1799: '$17.99 / month'
  }

  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-150px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_44%_0%,rgba(244,99,19,0.12),transparent_38%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-50" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-6xl font-semibold italic leading-none text-white md:text-7xl">
            Membership
          </h1>
          <p className="mx-auto mt-3 max-w-[780px] text-center text-sm leading-7 text-white/70">
            Connect Patreon, verify your tier, and keep entitlement access synced for gated characters and member-only content.
          </p>

          <div className="mt-10 grid gap-8 lg:grid-cols-[380px_1fr]">
            <AccountSideMenu activeKey="membership" />

            <div className="space-y-5">
              <article className="rounded-xl border border-white/12 bg-[#151214]/95 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">Provider</p>
                    <p className="mt-1 font-[family-name:var(--font-heading)] text-[34px] font-semibold italic leading-none text-white">Patreon OAuth</p>
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
                    href="/support"
                    className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/85 transition hover:border-ember-300 hover:text-ember-200"
                    aria-label="Open membership plans and support page"
                  >
                    View Plans
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
                  isEmphasized={currentTier === 'premium_1799'}
                />
                <DashboardStatCard
                  value={activeEntitlementCount.toString()}
                  label="Active Entitlements"
                  helperText="Used for server-side access checks"
                />
                <DashboardStatCard value={gatedAccessLabel} label="Gated Access" helperText={accessStateHelperText} isEmphasized={activeEntitlementCount > 0} />
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                <MembershipTierCard
                  tierName="FREE"
                  monthlyPriceLabel="$0 / month"
                  summary="Starter access for public characters and base website features."
                  benefitList={['Browse approved public VRoid gallery', 'Post reviews on public characters', 'Save favorites to profile']}
                  isCurrentTier={currentTier === 'free'}
                />
                <MembershipTierCard
                  tierName="SUPPORTER"
                  monthlyPriceLabel="$7.99 / month"
                  summary="Entry-level supporter perks with extra gated character access."
                  benefitList={['Unlock supporter-tagged characters', 'Early access to selected community drops', 'Priority in review moderation queue']}
                  isCurrentTier={currentTier === 'supporter_799'}
                />
                <MembershipTierCard
                  tierName="PREMIUM"
                  monthlyPriceLabel="$17.99 / month"
                  summary="Full Patreon experience with all gated character content and premium access."
                  benefitList={['Unlock all premium gallery content', 'Access premium members-only character tiers', 'Highest priority for new release access']}
                  isCurrentTier={currentTier === 'premium_1799'}
                />
              </div>

              <article className="rounded-xl border border-white/12 bg-[#151214]/95 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-[family-name:var(--font-heading)] text-[38px] font-semibold italic leading-none text-white">Entitlements</h2>
                    <p className="mt-1 text-xs uppercase tracking-[0.09em] text-white/55">
                      Server-side permissions snapshot synced from Patreon
                    </p>
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/60">Sync Count: {syncCount}</p>
                </div>

                <div className="mt-4 hidden rounded-lg border border-white/12 bg-[#0f0e10] px-3 py-2 text-[11px] uppercase tracking-[0.09em] text-white/60 sm:grid sm:grid-cols-[1.4fr_0.8fr_0.9fr_0.7fr]">
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
