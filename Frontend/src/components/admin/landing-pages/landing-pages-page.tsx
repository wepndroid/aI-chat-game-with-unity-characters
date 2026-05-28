'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminKpiCard from '@/components/ui-elements/admin-kpi-card'
import {
  createLandingPage,
  createLandingPageShortUrl,
  getAdminDefaultHomepage,
  getLandingPageOptions,
  getLandingPageTrackingIssues,
  getLandingPagesAnalytics,
  type DefaultHomepageResponse,
  type LandingPageOptionsResponse,
  type LandingPageTrackingIssuesResponse,
  type LandingPagesAnalyticsResponse,
  updateDefaultHomepage,
  updateLandingPage,
  updateLandingPageShortUrl
} from '@/lib/landing-page-api'
import {
  buildDefaultHomepageSuccessMessage,
  getDefaultHomepageFallbackSelectValue,
  hasDefaultHomepageSelection,
  resolveDefaultHomepageLandingPageId,
  resolveDefaultHomepageSelectionValue
} from '@/lib/default-homepage-selection'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type LandingPageOptionRecord = LandingPageOptionsResponse['data'][number]
type TrackingIssueRecord = LandingPageTrackingIssuesResponse['data'][number]
type ShortUrlRecord = LandingPagesAnalyticsResponse['data']['shortUrls'][number]
type TargetSelectionState = Record<string, { enabled: boolean; weight: string }>
type ShortUrlFormValue = {
  name: string
  key: string
  description: string
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmContent: string
  utmTerm: string
  isActive: boolean
  targets: TargetSelectionState
}
type ChartGranularity = 'daily' | 'monthly'
type ChartMetricKey = 'currentMonthlySubscriptionEarningCents' | 'totalRevenueCents' | 'currentSubscribers' | 'cumulativeCurrentSubscribers'
type SubscriptionChartPeriod = LandingPagesAnalyticsResponse['data']['subscriptionEarningsChart']['daily'][number]

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
  }).format(value)

const formatCurrencyCents = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value / 100)

const formatPercent = (value: number) => `${value.toFixed(1)}%`

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))

const pageSize = 25
const fallbackDefaultHomepageSelectionValue = getDefaultHomepageFallbackSelectValue()

const getPaginationBounds = (totalItems: number, currentPage: number) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(Math.max(currentPage, 1), totalPages)
  const startIndex = (safePage - 1) * pageSize

  return {
    totalPages,
    safePage,
    startIndex,
    endIndex: Math.min(startIndex + pageSize, totalItems)
  }
}

const PaginatedSectionFooter = ({
  currentPage,
  itemLabel,
  onPageChange,
  totalItems
}: {
  currentPage: number
  itemLabel: string
  onPageChange: (page: number) => void
  totalItems: number
}) => {
  const { endIndex, safePage, startIndex, totalPages } = getPaginationBounds(totalItems, currentPage)

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-4 text-sm text-white/55">
      <span>
        Showing {totalItems === 0 ? 0 : startIndex + 1}-{endIndex} of {formatNumber(totalItems)} {itemLabel}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          Previous
        </button>
        <span className="min-w-20 text-center text-white/60">
          {safePage} / {totalPages}
        </span>
        <button
          type="button"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  )
}

const trackingIssueKindLabels: Record<string, string> = {
  UNKNOWN_LANDING_PAGE: 'Unknown landing page',
  INACTIVE_LANDING_PAGE: 'Inactive landing page',
  UNKNOWN_VARIANT: 'Unknown variant',
  MISSING_CONTROL_VARIANT: 'Missing control variant'
}

const chartMetricOptions: Array<{
  key: ChartMetricKey
  label: string
  valueLabel: string
  helperText: string
  isCurrency: boolean
}> = [
  {
    key: 'currentMonthlySubscriptionEarningCents',
    label: 'Current monthly subscription earning',
    valueLabel: 'Current monthly',
    helperText: 'Active attributed subscribers by acquisition period, with annual plans divided by 12',
    isCurrency: true
  },
  {
    key: 'totalRevenueCents',
    label: 'Total earning',
    valueLabel: 'Total earning',
    helperText: 'Historical revenue by charge period',
    isCurrency: true
  },
  {
    key: 'currentSubscribers',
    label: 'New current subscribers',
    valueLabel: 'Subscribers',
    helperText: 'Active subscribers grouped by acquisition period',
    isCurrency: false
  },
  {
    key: 'cumulativeCurrentSubscribers',
    label: 'Total current subscriber growth',
    valueLabel: 'Total subscribers',
    helperText: 'Running total of active attributed subscribers across the selected acquisition periods',
    isCurrency: false
  }
]

const formatPeriodLabel = (periodKey: string, granularity: ChartGranularity) => {
  const date = new Date(`${periodKey}${granularity === 'monthly' ? '-01' : ''}T00:00:00Z`)

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    ...(granularity === 'daily' ? { day: 'numeric' } : { year: '2-digit' })
  }).format(date)
}

const getChartPeriodMetricValue = (
  period: SubscriptionChartPeriod,
  metricKey: Exclude<ChartMetricKey, 'cumulativeCurrentSubscribers'>,
  selectedTierCodes: Set<string>
) => {
  if (selectedTierCodes.size === 0) {
    return 0
  }

  return period.tiers
    .filter((tier) => selectedTierCodes.has(tier.tierCode))
    .reduce((sum, tier) => sum + tier[metricKey], 0)
}

const buildTargetSelectionState = (
  landingOptions: LandingPageOptionRecord[],
  selectedTargets: Array<{ landingPageId: string; weight: number }> = []
) => {
  const selectedTargetMap = new Map(
    selectedTargets.map((target) => [
      target.landingPageId,
      {
        enabled: true,
        weight: String(target.weight)
      }
    ])
  )

  return Object.fromEntries(
    landingOptions.map((landingPage) => [
      landingPage.id,
      selectedTargetMap.get(landingPage.id) ?? {
        enabled: false,
        weight: '100'
      }
    ])
  )
}

const serializeTargetSelectionState = (targetSelectionState: TargetSelectionState) =>
  Object.entries(targetSelectionState)
    .filter(([, target]) => target.enabled)
    .map(([landingPageId, target]) => ({
      landingPageId,
      weight: Math.max(1, Number.parseInt(target.weight || '100', 10) || 100)
    }))

const buildShortUrlFormValue = (shortUrl: ShortUrlRecord, landingOptions: LandingPageOptionRecord[]): ShortUrlFormValue => ({
  name: shortUrl.name,
  key: shortUrl.key,
  description: shortUrl.description ?? '',
  utmSource: shortUrl.utmSource ?? '',
  utmMedium: shortUrl.utmMedium ?? '',
  utmCampaign: shortUrl.utmCampaign ?? '',
  utmContent: shortUrl.utmContent ?? '',
  utmTerm: shortUrl.utmTerm ?? '',
  isActive: shortUrl.isActive,
  targets: buildTargetSelectionState(
    landingOptions,
    shortUrl.targets.map((target) => ({
      landingPageId: target.landingPageId,
      weight: target.weight
    }))
  )
})

const ChartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-full" aria-hidden="true">
    <path d="M4 19.2h16" strokeLinecap="round" />
    <path d="M7 16V9.5M12 16V5M17 16v-3.5" strokeLinecap="round" />
  </svg>
)

const UserPlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-full" aria-hidden="true">
    <circle cx="10" cy="8" r="3" />
    <path d="M4.5 18c.6-2.5 2.7-4 5.5-4s4.9 1.5 5.5 4" strokeLinecap="round" />
    <path d="M18 8v6M15 11h6" strokeLinecap="round" />
  </svg>
)

const CoinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-full" aria-hidden="true">
    <circle cx="12" cy="12" r="7" />
    <path d="M9.5 10.5c0-1.1 1-2 2.5-2s2.5.7 2.5 1.8-1 1.6-2.2 1.9l-.9.2c-1.2.3-2.1.8-2.1 1.9 0 1.1 1 1.9 2.6 1.9 1.5 0 2.6-.8 2.6-2" strokeLinecap="round" />
  </svg>
)

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-full" aria-hidden="true">
    <path d="M10.6 13.4a4 4 0 0 0 5.7 0l2.4-2.4a4 4 0 0 0-5.7-5.7l-1 1" strokeLinecap="round" />
    <path d="M13.4 10.6a4 4 0 0 0-5.7 0l-2.4 2.4a4 4 0 0 0 5.7 5.7l1-1" strokeLinecap="round" />
  </svg>
)

const TargetSelector = ({
  landingOptions,
  value,
  onChange
}: {
  landingOptions: LandingPageOptionRecord[]
  value: TargetSelectionState
  onChange: (nextValue: TargetSelectionState) => void
}) => (
  <div className="grid gap-2">
    {landingOptions.map((landingPage) => {
      const targetValue = value[landingPage.id] ?? { enabled: false, weight: '100' }

      return (
        <label
          key={landingPage.id}
          className="grid gap-3 rounded-xl border border-white/10 bg-black/15 px-3 py-3 text-sm text-white/85 md:grid-cols-[minmax(0,1fr)_140px]"
        >
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={targetValue.enabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  [landingPage.id]: {
                    ...targetValue,
                    enabled: event.target.checked
                  }
                })
              }
            />
            <div className="min-w-0">
              <div className="font-medium text-white">
                {landingPage.name} {!landingPage.isActive ? <span className="text-xs text-amber-300">(inactive)</span> : null}
              </div>
              <div className="font-mono text-[11px] text-white/45">{landingPage.basePath || 'No base path yet'}</div>
            </div>
          </div>
          <input
            type="number"
            min={1}
            step={1}
            disabled={!targetValue.enabled}
            className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
            value={targetValue.weight}
            onChange={(event) =>
              onChange({
                ...value,
                [landingPage.id]: {
                  ...targetValue,
                  weight: event.target.value
                }
              })
            }
            placeholder="Weight"
          />
        </label>
      )
    })}
  </div>
)

const SubscriptionEarningsChart = ({
  analytics,
  granularity,
  metricKey,
  selectedTierCodes,
  onGranularityChange,
  onMetricChange,
  onTierToggle,
  onSelectAllTiers
}: {
  analytics: LandingPagesAnalyticsResponse['data'] | null
  granularity: ChartGranularity
  metricKey: ChartMetricKey
  selectedTierCodes: string[]
  onGranularityChange: (nextValue: ChartGranularity) => void
  onMetricChange: (nextValue: ChartMetricKey) => void
  onTierToggle: (tierCode: string) => void
  onSelectAllTiers: () => void
}) => {
  const selectedTierCodeSet = useMemo(() => new Set(selectedTierCodes), [selectedTierCodes])
  const metricOption = chartMetricOptions.find((option) => option.key === metricKey) ?? chartMetricOptions[0]
  const periodRows = useMemo(() => {
    if (!analytics) {
      return []
    }

    const periods = analytics.subscriptionEarningsChart[granularity]
    let cumulativeCurrentSubscribers = 0

    return periods
      .map((period) => {
        const periodSubscribers = getChartPeriodMetricValue(period, 'currentSubscribers', selectedTierCodeSet)
        cumulativeCurrentSubscribers += periodSubscribers
        const value =
          metricKey === 'cumulativeCurrentSubscribers'
            ? cumulativeCurrentSubscribers
            : getChartPeriodMetricValue(period, metricKey, selectedTierCodeSet)

        return {
          periodKey: period.periodKey,
          label: formatPeriodLabel(period.periodKey, granularity),
          value,
          periodSubscribers,
          cumulativeSubscribers: cumulativeCurrentSubscribers,
          tooltipValue: metricOption.isCurrency ? formatCurrencyCents(value) : formatNumber(value)
        }
      })
      .slice(-(granularity === 'daily' ? 30 : 12))
  }, [analytics, granularity, metricKey, metricOption.isCurrency, selectedTierCodeSet])
  const maxValue = Math.max(...periodRows.map((period) => period.value), 0)
  const totalValue = periodRows.reduce((sum, period) => sum + period.value, 0)
  const averageValue = periodRows.length > 0 ? totalValue / periodRows.length : 0
  const bestPeriod = periodRows.reduce<(typeof periodRows)[number] | null>(
    (bestRow, period) => (!bestRow || period.value > bestRow.value ? period : bestRow),
    null
  )
  const selectedTierCount = selectedTierCodes.length
  const chartWidth = 720
  const chartHeight = 260
  const padding = { top: 22, right: 24, bottom: 42, left: 58 }
  const innerWidth = chartWidth - padding.left - padding.right
  const innerHeight = chartHeight - padding.top - padding.bottom
  const barGap = 6
  const barWidth = periodRows.length > 0 ? Math.max(7, (innerWidth - barGap * (periodRows.length - 1)) / periodRows.length) : 0

  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-[#0c0f14]/95 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">Subscription Earnings Graph</h2>
          <p className="mt-1 text-sm text-white/55">{metricOption.helperText}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-[#11161e]/90 px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.08em] text-white/45">{metricOption.valueLabel}</p>
            <p className="mt-1 text-xl font-semibold text-white">
              {metricOption.isCurrency ? formatCurrencyCents(totalValue) : formatNumber(totalValue)}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#11161e]/90 px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.08em] text-white/45">Best Period</p>
            <p className="mt-1 text-xl font-semibold text-white">
              {bestPeriod ? (metricOption.isCurrency ? formatCurrencyCents(bestPeriod.value) : formatNumber(bestPeriod.value)) : '-'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#11161e]/90 px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.08em] text-white/45">Average</p>
            <p className="mt-1 text-xl font-semibold text-white">
              {metricOption.isCurrency ? formatCurrencyCents(averageValue) : formatNumber(averageValue)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[170px_minmax(220px,1fr)_minmax(220px,1.4fr)]">
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/15 p-1">
          {(['daily', 'monthly'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                granularity === option ? 'bg-white text-[#0c0f14]' : 'text-white/65 hover:bg-white/10 hover:text-white'
              }`}
              onClick={() => onGranularityChange(option)}
            >
              {option === 'daily' ? 'Daily' : 'Monthly'}
            </button>
          ))}
        </div>

        <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-white/55">
          Data
          <select
            value={metricKey}
            onChange={(event) => onMetricChange(event.target.value as ChartMetricKey)}
            className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2.5 text-sm normal-case tracking-normal text-white"
          >
            {chartMetricOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.08em] text-white/55">Tiers</p>
            <button
              type="button"
              className="text-xs font-semibold uppercase tracking-[0.08em] text-sky-200 transition hover:text-white"
              onClick={onSelectAllTiers}
            >
              Select all
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {analytics?.subscriptionEarningsChart.tiers.length === 0 ? (
              <span className="text-sm text-white/50">No tiers yet</span>
            ) : null}
            {analytics?.subscriptionEarningsChart.tiers.map((tier) => {
              const isSelected = selectedTierCodeSet.has(tier.tierCode)

              return (
                <label
                  key={tier.tierCode}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    isSelected
                      ? 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100'
                      : 'border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onTierToggle(tier.tierCode)}
                    className="accent-emerald-300"
                  />
                  {tier.tierLabel}
                </label>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-[#11161e]/80 p-3">
        {periodRows.length === 0 ? (
          <div className="flex min-h-[260px] items-center justify-center text-sm text-white/55">No graph data yet.</div>
        ) : (
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="min-w-[720px] text-white" role="img" aria-label="Subscription earnings chart">
            {[0, 0.25, 0.5, 0.75, 1].map((step) => {
              const y = padding.top + innerHeight - innerHeight * step
              const labelValue = maxValue * step

              return (
                <g key={step}>
                  <line x1={padding.left} x2={chartWidth - padding.right} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" />
                  <text x={padding.left - 8} y={y + 3} textAnchor="end" className="fill-white/40 text-[9px]">
                    {metricOption.isCurrency ? formatCurrencyCents(labelValue).replace('.00', '') : formatNumber(labelValue)}
                  </text>
                </g>
              )
            })}
            {periodRows.map((period, index) => {
              const x = padding.left + index * (barWidth + barGap)
              const barHeight = maxValue > 0 ? (period.value / maxValue) * innerHeight : 0
              const y = padding.top + innerHeight - barHeight
              const shouldShowLabel = periodRows.length <= 12 || index % Math.ceil(periodRows.length / 6) === 0

              return (
                <g key={period.periodKey}>
                  <title>
                    {period.label}: {period.tooltipValue}; {formatNumber(period.periodSubscribers)} new active subscribers; {formatNumber(period.cumulativeSubscribers)} cumulative active subscribers
                  </title>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={3}
                    className="fill-emerald-300/80 transition hover:fill-emerald-200"
                  />
                  {shouldShowLabel ? (
                    <text
                      x={x + barWidth / 2}
                      y={chartHeight - 18}
                      textAnchor="middle"
                      className="fill-white/40 text-[9px]"
                    >
                      {period.label}
                    </text>
                  ) : null}
                </g>
              )
            })}
            <line x1={padding.left} x2={chartWidth - padding.right} y1={padding.top + innerHeight} y2={padding.top + innerHeight} stroke="rgba(255,255,255,0.18)" />
          </svg>
        )}
      </div>

      <p className="mt-3 text-xs text-white/45">
        Showing {formatNumber(periodRows.length)} {granularity === 'daily' ? 'days' : 'months'} across {formatNumber(selectedTierCount)} selected tiers. Hover a bar to inspect the exact value.
      </p>
    </section>
  )
}

const LandingPagesPage = () => {
  const [analytics, setAnalytics] = useState<LandingPagesAnalyticsResponse['data'] | null>(null)
  const [landingOptions, setLandingOptions] = useState<LandingPageOptionsResponse['data']>([])
  const [trackingIssues, setTrackingIssues] = useState<LandingPageTrackingIssuesResponse['data']>([])
  const [defaultHomepage, setDefaultHomepage] = useState<DefaultHomepageResponse['data'] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showCreateLandingPageForm, setShowCreateLandingPageForm] = useState(false)
  const [showCreateShortUrlForm, setShowCreateShortUrlForm] = useState(false)
  const [isCreatingLandingPage, setIsCreatingLandingPage] = useState(false)
  const [isCreatingShortUrl, setIsCreatingShortUrl] = useState(false)
  const [savingLandingPageId, setSavingLandingPageId] = useState<string | null>(null)
  const [savingShortUrlId, setSavingShortUrlId] = useState<string | null>(null)
  const [isSavingDefaultHomepage, setIsSavingDefaultHomepage] = useState(false)
  const [selectedDefaultHomepageValue, setSelectedDefaultHomepageValue] = useState('')
  const [openLandingPageEditorId, setOpenLandingPageEditorId] = useState<string | null>(null)
  const [openShortUrlEditorId, setOpenShortUrlEditorId] = useState<string | null>(null)
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>('daily')
  const [chartMetricKey, setChartMetricKey] = useState<ChartMetricKey>('currentMonthlySubscriptionEarningCents')
  const [selectedTierCodes, setSelectedTierCodes] = useState<string[]>([])
  const [landingPageListPage, setLandingPageListPage] = useState(1)
  const [shortUrlListPage, setShortUrlListPage] = useState(1)
  const [landingPageForm, setLandingPageForm] = useState({
    key: '',
    name: '',
    description: '',
    basePath: ''
  })
  const [shortUrlForm, setShortUrlForm] = useState({
    key: '',
    name: '',
    description: '',
    utmSource: '',
    utmMedium: '',
    utmCampaign: '',
    utmContent: '',
    utmTerm: '',
    isActive: true,
    targets: {} as TargetSelectionState
  })
  const [landingPageEditForms, setLandingPageEditForms] = useState<
    Record<
      string,
      {
        name: string
        key: string
        description: string
        basePath: string
        isActive: boolean
      }
    >
  >({})
  const [shortUrlEditForms, setShortUrlEditForms] = useState<
    Record<
      string,
      ShortUrlFormValue
    >
  >({})

  const loadPageData = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const [analyticsPayload, optionsPayload, trackingIssuesPayload, defaultHomepagePayload] = await Promise.all([
        getLandingPagesAnalytics(),
        getLandingPageOptions(),
        getLandingPageTrackingIssues(),
        getAdminDefaultHomepage()
      ])
      const targetSelectionTemplate = buildTargetSelectionState(optionsPayload.data)

      setAnalytics(analyticsPayload.data)
      setLandingOptions(optionsPayload.data)
      setTrackingIssues(trackingIssuesPayload.data)
      setDefaultHomepage(defaultHomepagePayload.data)
      setSelectedDefaultHomepageValue(resolveDefaultHomepageSelectionValue(defaultHomepagePayload.data))
      setLandingPageEditForms(
        Object.fromEntries(
          analyticsPayload.data.landingPages.map((landingPage) => [
            landingPage.id,
            {
              name: landingPage.name,
              key: landingPage.key,
              description: landingPage.description ?? '',
              basePath: landingPage.basePath ?? '',
              isActive: landingPage.isActive
            }
          ])
        )
      )
      setShortUrlEditForms(
        Object.fromEntries(
          analyticsPayload.data.shortUrls.map((shortUrl) => [
            shortUrl.id,
            buildShortUrlFormValue(shortUrl, optionsPayload.data)
          ])
        )
      )
      setShortUrlForm((currentValue) => ({
        ...currentValue,
        targets:
          Object.keys(currentValue.targets).length > 0
            ? buildTargetSelectionState(optionsPayload.data, serializeTargetSelectionState(currentValue.targets))
            : targetSelectionTemplate
      }))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load landing page analytics.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadPageData()
  }, [])

  useEffect(() => {
    const nextTierCodes = analytics?.subscriptionEarningsChart.tiers.map((tier) => tier.tierCode) ?? []

    if (nextTierCodes.length === 0) {
      setSelectedTierCodes([])
      return
    }

    setSelectedTierCodes((currentValue) => {
      const nextTierCodeSet = new Set(nextTierCodes)
      const preservedTierCodes = currentValue.filter((tierCode) => nextTierCodeSet.has(tierCode))

      return preservedTierCodes.length > 0 ? preservedTierCodes : nextTierCodes
    })
  }, [analytics?.subscriptionEarningsChart.tiers])

  const summaryCards = useMemo(() => {
    if (!analytics) {
      return []
    }

    return [
      {
        id: 'visitors',
        label: 'Unique Visitors',
        value: formatNumber(analytics.summary.uniqueVisitors),
        helperText: `${formatNumber(analytics.summary.totalVisits)} tracked visits`,
        tone: 'blue' as const,
        icon: <ChartIcon />
      },
      {
        id: 'signups',
        label: 'Signups',
        value: formatNumber(analytics.summary.signups),
        helperText: `${formatPercent(analytics.summary.signupConversionRate)} visitor-to-signup`,
        tone: 'purple' as const,
        icon: <UserPlusIcon />
      },
      {
        id: 'first-purchase',
        label: 'First Purchase Revenue',
        value: formatCurrencyCents(analytics.summary.firstPurchaseRevenueCents),
        helperText: `${formatNumber(analytics.summary.patreonSales)} purchasing users`,
        tone: 'orange' as const,
        icon: <CoinIcon />
      },
      {
        id: 'current-monthly-subscriptions',
        label: 'Current Monthly Subscriptions',
        value: formatCurrencyCents(analytics.summary.currentMonthlySubscriptionEarningCents),
        helperText: `${formatNumber(analytics.summary.currentSubscribers)} active subscribers`,
        tone: 'green' as const,
        icon: <CoinIcon />
      },
      {
        id: 'lifetime-revenue',
        label: 'Lifetime Revenue',
        value: formatCurrencyCents(analytics.summary.totalRevenueCents),
        helperText: `${formatNumber(analytics.summary.totalPurchases)} tracked purchases`,
        tone: 'green' as const,
        icon: <CoinIcon />
      },
      {
        id: 'short-urls',
        label: 'Active Short URLs',
        value: formatNumber(analytics.summary.activeShortUrls),
        helperText: `${formatNumber(analytics.summary.totalShortUrls)} total short URLs`,
        tone: 'blue' as const,
        icon: <LinkIcon />
      }
    ]
  }, [analytics])

  const landingOptionByKey = useMemo(
    () => new Map(landingOptions.map((landingPage) => [landingPage.key, landingPage])),
    [landingOptions]
  )

  // Tracking issues are read-only diagnostics; admins repair matching rows
  // through the existing landing-page editor instead of a separate workflow.
  const focusLandingPageEditor = (landingPage: LandingPageOptionRecord) => {
    setOpenLandingPageEditorId(landingPage.id)
    requestAnimationFrame(() => {
      document.getElementById(`landing-page-${landingPage.id}`)?.scrollIntoView({
        block: 'start',
        behavior: 'smooth'
      })
    })
  }

  const handleCreateLandingPage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreatingLandingPage(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await createLandingPage({
        key: landingPageForm.key,
        name: landingPageForm.name,
        description: landingPageForm.description || undefined,
        basePath: landingPageForm.basePath
      })

      setLandingPageForm({
        key: '',
        name: '',
        description: '',
        basePath: ''
      })
      setShowCreateLandingPageForm(false)
      setSuccessMessage('Landing page created.')
      await loadPageData()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create landing page.')
    } finally {
      setIsCreatingLandingPage(false)
    }
  }

  const handleCreateShortUrl = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreatingShortUrl(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const targets = serializeTargetSelectionState(shortUrlForm.targets)

      if (targets.length === 0) {
        throw new Error('Select at least one landing page target for the short URL.')
      }

      await createLandingPageShortUrl({
        key: shortUrlForm.key,
        name: shortUrlForm.name,
        description: shortUrlForm.description || undefined,
        utmSource: shortUrlForm.utmSource || null,
        utmMedium: shortUrlForm.utmMedium || null,
        utmCampaign: shortUrlForm.utmCampaign || null,
        utmContent: shortUrlForm.utmContent || null,
        utmTerm: shortUrlForm.utmTerm || null,
        isActive: shortUrlForm.isActive,
        targets
      })

      setShortUrlForm({
        key: '',
        name: '',
        description: '',
        utmSource: '',
        utmMedium: '',
        utmCampaign: '',
        utmContent: '',
        utmTerm: '',
        isActive: true,
        targets: buildTargetSelectionState(landingOptions)
      })
      setShowCreateShortUrlForm(false)
      setSuccessMessage('Short URL created.')
      await loadPageData()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create short URL.')
    } finally {
      setIsCreatingShortUrl(false)
    }
  }

  const handleSaveLandingPage = async (landingPageId: string) => {
    const formValue = landingPageEditForms[landingPageId]

    if (!formValue) {
      return
    }

    setSavingLandingPageId(landingPageId)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await updateLandingPage(landingPageId, {
        key: formValue.key,
        name: formValue.name,
        description: formValue.description,
        basePath: formValue.basePath,
        isActive: formValue.isActive
      })

      setOpenLandingPageEditorId(null)
      setSuccessMessage('Landing page updated.')
      await loadPageData()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update landing page.')
    } finally {
      setSavingLandingPageId(null)
    }
  }

  const handleSaveDefaultHomepage = async () => {
    if (!hasDefaultHomepageSelection(selectedDefaultHomepageValue)) {
      setErrorMessage('Select a landing page or the fallback homepage.')
      return
    }

    setIsSavingDefaultHomepage(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const payload = await updateDefaultHomepage(resolveDefaultHomepageLandingPageId(selectedDefaultHomepageValue))
      setDefaultHomepage(payload.data)
      setSelectedDefaultHomepageValue(resolveDefaultHomepageSelectionValue(payload.data))
      setSuccessMessage(buildDefaultHomepageSuccessMessage(payload.data))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update default homepage.')
    } finally {
      setIsSavingDefaultHomepage(false)
    }
  }

  const handleSaveShortUrl = async (shortUrlId: string) => {
    const formValue = shortUrlEditForms[shortUrlId]

    if (!formValue) {
      return
    }

    setSavingShortUrlId(shortUrlId)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const targets = serializeTargetSelectionState(formValue.targets)

      if (targets.length === 0) {
        throw new Error('Select at least one landing page target for the short URL.')
      }

      await updateLandingPageShortUrl(shortUrlId, {
        key: formValue.key,
        name: formValue.name,
        description: formValue.description,
        utmSource: formValue.utmSource || null,
        utmMedium: formValue.utmMedium || null,
        utmCampaign: formValue.utmCampaign || null,
        utmContent: formValue.utmContent || null,
        utmTerm: formValue.utmTerm || null,
        isActive: formValue.isActive,
        targets
      })

      setOpenShortUrlEditorId(null)
      setSuccessMessage('Short URL updated.')
      await loadPageData()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update short URL.')
    } finally {
      setSavingShortUrlId(null)
    }
  }

  const handleToggleChartTier = (tierCode: string) => {
    setSelectedTierCodes((currentValue) =>
      currentValue.includes(tierCode)
        ? currentValue.filter((selectedTierCode) => selectedTierCode !== tierCode)
        : [...currentValue, tierCode]
    )
  }

  const handleSelectAllChartTiers = () => {
    setSelectedTierCodes(analytics?.subscriptionEarningsChart.tiers.map((tier) => tier.tierCode) ?? [])
  }

  const landingPagePagination = getPaginationBounds(analytics?.landingPages.length ?? 0, landingPageListPage)
  const shortUrlPagination = getPaginationBounds(analytics?.shortUrls.length ?? 0, shortUrlListPage)
  const paginatedLandingPages = analytics?.landingPages.slice(landingPagePagination.startIndex, landingPagePagination.endIndex) ?? []
  const paginatedShortUrls = analytics?.shortUrls.slice(shortUrlPagination.startIndex, shortUrlPagination.endIndex) ?? []

  return (
    <AdminPageShell activeKey="landing-pages">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-tight text-white sm:text-[26px] md:text-[29px] md:leading-none">
            Landing Pages
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-[#95a6c1]">
            Use landing pages as the destination experience, and use short URLs as the A/B testing entry point. Variant URLs still exist under the hood for attribution, but the main workflow now lives around randomizable short links.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/landing-pages/performance"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-400/15 hover:text-white"
          >
            Open Performance Report
          </Link>
          <Link
            href="/admin/landing-pages/report"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-500/15 hover:text-white"
          >
            Open Traffic Report
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p>
      ) : null}
      {successMessage ? (
        <p className="mt-4 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">{successMessage}</p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {isLoading && summaryCards.length === 0 ? <p className="col-span-full text-sm text-white/70">Loading landing analytics...</p> : null}
        {summaryCards.map((summaryCard) => (
          <AdminKpiCard
            key={summaryCard.id}
            label={summaryCard.label}
            value={summaryCard.value}
            helperText={summaryCard.helperText}
            tone={summaryCard.tone}
            icon={summaryCard.icon}
          />
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-white/10 bg-[#0c0f14]/95 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-heading)] text-[18px] text-white sm:text-[21px]">Default Homepage</h2>
            <p className="mt-1 max-w-3xl text-sm text-white/55">
              Choose which configured landing page renders at <span className="font-mono text-white/75">/</span>. The public URL stays the same, but the homepage experience and tracking key follow this setting.
            </p>
            <p className="mt-2 text-sm text-white/65">
              Current:{' '}
              <span className="font-medium text-white">
                {defaultHomepage?.landingPage?.name ?? `Fallback ${defaultHomepage?.fallbackKey ?? 'home2'}`}
              </span>{' '}
              <span className="font-mono text-xs text-white/45">
                {defaultHomepage?.landingPage?.basePath ?? defaultHomepage?.fallbackPath ?? '/home2'}
              </span>
            </p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:w-[520px]">
            <label>
              <span className="text-xs uppercase tracking-[0.08em] text-white/45">Homepage Landing Page</span>
              <select
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white outline-none focus:border-amber-300/60"
                value={selectedDefaultHomepageValue}
                onChange={(event) => setSelectedDefaultHomepageValue(event.target.value)}
              >
                <option value={fallbackDefaultHomepageSelectionValue}>Use fallback home2</option>
                {landingOptions
                  .filter((landingPage) => landingPage.isActive && landingPage.basePath)
                  .map((landingPage) => (
                    <option key={landingPage.id} value={landingPage.id}>
                      {landingPage.name} ({landingPage.basePath})
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              disabled={isSavingDefaultHomepage || !hasDefaultHomepageSelection(selectedDefaultHomepageValue)}
              onClick={() => void handleSaveDefaultHomepage()}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingDefaultHomepage ? 'Saving...' : 'Set Default'}
            </button>
          </div>
        </div>
      </section>

      <SubscriptionEarningsChart
        analytics={analytics}
        granularity={chartGranularity}
        metricKey={chartMetricKey}
        selectedTierCodes={selectedTierCodes}
        onGranularityChange={setChartGranularity}
        onMetricChange={setChartMetricKey}
        onTierToggle={handleToggleChartTier}
        onSelectAllTiers={handleSelectAllChartTiers}
      />

      <section className="mt-8 rounded-2xl border border-white/10 bg-[#0c0f14]/95 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-heading)] text-[18px] text-white sm:text-[21px]">Tracking Issues</h2>
            <p className="mt-1 text-sm text-white/55">Public tracking mismatches found since the issue table was added.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#11161e]/90 px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.08em] text-white/45">Open</p>
            <p className="mt-1 text-xl font-semibold text-white">{formatNumber(trackingIssues.length)}</p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {trackingIssues.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-black/15 px-4 py-4 text-sm text-white/60">No tracking issues recorded.</p>
          ) : (
            <table className="min-w-[920px] text-left text-sm text-white/80">
              <thead className="text-[11px] uppercase tracking-[0.08em] text-white/45">
                <tr>
                  <th className="pb-2 pr-4 whitespace-nowrap">Issue</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">Landing</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">Variant</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">Route</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">Short URL</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">Seen</th>
                  <th className="pb-2 pr-4 whitespace-nowrap">Last Seen</th>
                  <th className="pb-2 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody>
                {trackingIssues.map((issue: TrackingIssueRecord) => {
                  const landingPage = issue.landingPageKey ? landingOptionByKey.get(issue.landingPageKey) : undefined

                  return (
                    <tr key={issue.id} className="border-t border-white/5">
                      <td className="py-2 pr-4">
                        <span className="rounded-md border border-amber-300/25 bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-100">
                          {trackingIssueKindLabels[issue.kind] ?? issue.kind}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-mono text-[12px] text-white/75">{issue.landingPageKey ?? '-'}</td>
                      <td className="py-2 pr-4 font-mono text-[12px] text-white/65">{issue.variantKey ?? '-'}</td>
                      <td className="py-2 pr-4 font-mono text-[12px] text-white/65">{issue.routePath ?? '-'}</td>
                      <td className="py-2 pr-4 font-mono text-[12px] text-white/65">{issue.shortUrlKey ? `/s/${issue.shortUrlKey}` : '-'}</td>
                      <td className="py-2 pr-4">{formatNumber(issue.seenCount)}</td>
                      <td className="py-2 pr-4 text-white/60">{formatDateTime(issue.lastSeenAt)}</td>
                      <td className="py-2">
                        {landingPage ? (
                          <button
                            type="button"
                            className="rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-sky-100 transition hover:bg-sky-500/15 hover:text-white"
                            onClick={() => focusLandingPageEditor(landingPage)}
                          >
                            Edit
                          </button>
                        ) : (
                          <span className="text-xs uppercase tracking-[0.08em] text-white/40">Not Configured</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-heading)] text-[18px] text-white sm:text-[21px]">Create Landing Page</h2>
              <p className="mt-1 text-sm text-white/55">Register the destination page that traffic should eventually land on.</p>
            </div>
            <button
              type="button"
              className="rounded-lg bg-ember-400 px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
              onClick={() => setShowCreateLandingPageForm((currentValue) => !currentValue)}
            >
              {showCreateLandingPageForm ? 'Close' : 'New Landing Page'}
            </button>
          </div>
          {showCreateLandingPageForm ? (
            <form className="mt-4 grid gap-3" onSubmit={handleCreateLandingPage}>
              <input
                className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                placeholder="Key (e.g. lp-2)"
                value={landingPageForm.key}
                onChange={(event) => setLandingPageForm((currentValue) => ({ ...currentValue, key: event.target.value }))}
              />
              <input
                className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                placeholder="Display name"
                value={landingPageForm.name}
                onChange={(event) => setLandingPageForm((currentValue) => ({ ...currentValue, name: event.target.value }))}
              />
              <input
                className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                placeholder="Destination path (e.g. /lp-2)"
                value={landingPageForm.basePath}
                onChange={(event) => setLandingPageForm((currentValue) => ({ ...currentValue, basePath: event.target.value }))}
              />
              <textarea
                className="min-h-20 rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                placeholder="What makes this page different?"
                value={landingPageForm.description}
                onChange={(event) => setLandingPageForm((currentValue) => ({ ...currentValue, description: event.target.value }))}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-ember-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isCreatingLandingPage}
                >
                  {isCreatingLandingPage ? 'Saving...' : 'Create Landing Page'}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-transparent px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/5 hover:text-white"
                  onClick={() => setShowCreateLandingPageForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-heading)] text-[18px] text-white sm:text-[21px]">Create Short URL</h2>
              <p className="mt-1 text-sm text-white/55">Build one entry URL that randomly routes visitors across selected landing pages.</p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              onClick={() => setShowCreateShortUrlForm((currentValue) => !currentValue)}
            >
              {showCreateShortUrlForm ? 'Close' : 'New Short URL'}
            </button>
          </div>
          {showCreateShortUrlForm ? (
            <form className="mt-4 grid gap-3" onSubmit={handleCreateShortUrl}>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                  placeholder="Short code (e.g. spring-drop)"
                  value={shortUrlForm.key}
                  onChange={(event) => setShortUrlForm((currentValue) => ({ ...currentValue, key: event.target.value }))}
                />
                <input
                  className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                  placeholder="Display name"
                  value={shortUrlForm.name}
                  onChange={(event) => setShortUrlForm((currentValue) => ({ ...currentValue, name: event.target.value }))}
                />
              </div>
              <textarea
                className="min-h-20 rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                placeholder="What is this short URL used for?"
                value={shortUrlForm.description}
                onChange={(event) => setShortUrlForm((currentValue) => ({ ...currentValue, description: event.target.value }))}
              />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <input
                  className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                  placeholder="utm_source"
                  value={shortUrlForm.utmSource}
                  onChange={(event) => setShortUrlForm((currentValue) => ({ ...currentValue, utmSource: event.target.value }))}
                />
                <input
                  className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                  placeholder="utm_medium"
                  value={shortUrlForm.utmMedium}
                  onChange={(event) => setShortUrlForm((currentValue) => ({ ...currentValue, utmMedium: event.target.value }))}
                />
                <input
                  className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                  placeholder="utm_campaign"
                  value={shortUrlForm.utmCampaign}
                  onChange={(event) => setShortUrlForm((currentValue) => ({ ...currentValue, utmCampaign: event.target.value }))}
                />
                <input
                  className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                  placeholder="utm_content"
                  value={shortUrlForm.utmContent}
                  onChange={(event) => setShortUrlForm((currentValue) => ({ ...currentValue, utmContent: event.target.value }))}
                />
                <input
                  className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                  placeholder="utm_term"
                  value={shortUrlForm.utmTerm}
                  onChange={(event) => setShortUrlForm((currentValue) => ({ ...currentValue, utmTerm: event.target.value }))}
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={shortUrlForm.isActive}
                  onChange={(event) => setShortUrlForm((currentValue) => ({ ...currentValue, isActive: event.target.checked }))}
                />
                Active immediately
              </label>
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-white/50">Randomized Targets</p>
                <div className="mt-2">
                  <TargetSelector
                    landingOptions={landingOptions}
                    value={shortUrlForm.targets}
                    onChange={(nextValue) => setShortUrlForm((currentValue) => ({ ...currentValue, targets: nextValue }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isCreatingShortUrl}
                >
                  {isCreatingShortUrl ? 'Saving...' : 'Create Short URL'}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-transparent px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/5 hover:text-white"
                  onClick={() => setShowCreateShortUrlForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </section>
      </div>

      <section className="mt-6 grid gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-[family-name:var(--font-heading)] text-[20px] text-white">Landing Pages</h2>
            <p className="mt-1 text-sm text-white/55">Compact overview of performance by destination page.</p>
          </div>
        </div>

        {paginatedLandingPages.map((landingPage) => (
          <article id={`landing-page-${landingPage.id}`} key={landingPage.id} className="scroll-mt-6 rounded-3xl border border-white/10 bg-[#0c0f14]/95 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-[family-name:var(--font-heading)] text-[20px] text-white">{landingPage.name}</h3>
                  {!landingPage.isActive ? (
                    <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-100">
                      Inactive
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 font-mono text-xs text-white/45">{landingPage.basePath || 'No path configured'}</p>
                {landingPage.description ? <p className="mt-2 max-w-3xl text-sm text-white/60">{landingPage.description}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/landing-pages/performance?landingPageId=${landingPage.id}`}
                  className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-400/15 hover:text-white"
                >
                  Performance Report
                </Link>
                <Link
                  href={`/admin/landing-pages/report?landingPageId=${landingPage.id}`}
                  className="rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-500/15 hover:text-white"
                >
                  Traffic Report
                </Link>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                  onClick={() =>
                    setOpenLandingPageEditorId((currentValue) => (currentValue === landingPage.id ? null : landingPage.id))
                  }
                >
                  {openLandingPageEditorId === landingPage.id ? 'Close Editor' : 'Edit'}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-2xl border border-white/10 bg-[#11161e]/90 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.08em] text-white/45">Visitors</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(landingPage.kpis.uniqueVisitors)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#11161e]/90 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.08em] text-white/45">Signups</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(landingPage.kpis.signups)}</p>
                <p className="mt-1 text-xs text-emerald-300">{formatPercent(landingPage.kpis.signupConversionRate)} CVR</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#11161e]/90 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.08em] text-white/45">Purchasing Users</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(landingPage.kpis.patreonSales)}</p>
                <p className="mt-1 text-xs text-amber-300">{formatPercent(landingPage.kpis.patreonSaleRate)} sale rate</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#11161e]/90 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.08em] text-white/45">First Purchase</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatCurrencyCents(landingPage.kpis.firstPurchaseRevenueCents)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#11161e]/90 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.08em] text-white/45">Current Monthly</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {formatCurrencyCents(landingPage.kpis.currentMonthlySubscriptionEarningCents)}
                </p>
                <p className="mt-1 text-xs text-white/50">{formatNumber(landingPage.kpis.currentSubscribers)} subscribers</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#11161e]/90 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.08em] text-white/45">Lifetime Revenue</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatCurrencyCents(landingPage.kpis.totalRevenueCents)}</p>
                <p className="mt-1 text-xs text-white/50">{formatNumber(landingPage.kpis.totalPurchases)} purchases</p>
              </div>
            </div>

            {openLandingPageEditorId === landingPage.id ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                    value={landingPageEditForms[landingPage.id]?.name ?? landingPage.name}
                    onChange={(event) =>
                      setLandingPageEditForms((currentValue) => ({
                        ...currentValue,
                        [landingPage.id]: {
                          ...(currentValue[landingPage.id] ?? {
                            name: landingPage.name,
                            key: landingPage.key,
                            description: landingPage.description ?? '',
                            basePath: landingPage.basePath ?? '',
                            isActive: landingPage.isActive
                          }),
                          name: event.target.value
                        }
                      }))
                    }
                  />
                  <input
                    className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                    value={landingPageEditForms[landingPage.id]?.key ?? landingPage.key}
                    onChange={(event) =>
                      setLandingPageEditForms((currentValue) => ({
                        ...currentValue,
                        [landingPage.id]: {
                          ...(currentValue[landingPage.id] ?? {
                            name: landingPage.name,
                            key: landingPage.key,
                            description: landingPage.description ?? '',
                            basePath: landingPage.basePath ?? '',
                            isActive: landingPage.isActive
                          }),
                          key: event.target.value
                        }
                      }))
                    }
                  />
                  <input
                    className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white md:col-span-2"
                    value={landingPageEditForms[landingPage.id]?.basePath ?? landingPage.basePath ?? ''}
                    onChange={(event) =>
                      setLandingPageEditForms((currentValue) => ({
                        ...currentValue,
                        [landingPage.id]: {
                          ...(currentValue[landingPage.id] ?? {
                            name: landingPage.name,
                            key: landingPage.key,
                            description: landingPage.description ?? '',
                            basePath: landingPage.basePath ?? '',
                            isActive: landingPage.isActive
                          }),
                          basePath: event.target.value
                        }
                      }))
                    }
                  />
                  <textarea
                    className="min-h-20 rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white md:col-span-2"
                    value={landingPageEditForms[landingPage.id]?.description ?? landingPage.description ?? ''}
                    onChange={(event) =>
                      setLandingPageEditForms((currentValue) => ({
                        ...currentValue,
                        [landingPage.id]: {
                          ...(currentValue[landingPage.id] ?? {
                            name: landingPage.name,
                            key: landingPage.key,
                            description: landingPage.description ?? '',
                            basePath: landingPage.basePath ?? '',
                            isActive: landingPage.isActive
                          }),
                          description: event.target.value
                        }
                      }))
                    }
                  />
                  <label className="inline-flex items-center gap-2 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={landingPageEditForms[landingPage.id]?.isActive ?? landingPage.isActive}
                      onChange={(event) =>
                        setLandingPageEditForms((currentValue) => ({
                          ...currentValue,
                          [landingPage.id]: {
                            ...(currentValue[landingPage.id] ?? {
                              name: landingPage.name,
                              key: landingPage.key,
                              description: landingPage.description ?? '',
                              basePath: landingPage.basePath ?? '',
                              isActive: landingPage.isActive
                            }),
                            isActive: event.target.checked
                          }
                        }))
                      }
                    />
                    Active
                  </label>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-70"
                    disabled={savingLandingPageId === landingPage.id}
                    onClick={() => void handleSaveLandingPage(landingPage.id)}
                  >
                    {savingLandingPageId === landingPage.id ? 'Saving...' : 'Save Landing Page'}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/5 hover:text-white"
                    onClick={() => setOpenLandingPageEditorId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-5 rounded-2xl border border-white/10 bg-[#11161e]/85 p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-white/85">Top Sources</h4>
                <Link
                  href={`/admin/landing-pages/report?landingPageId=${landingPage.id}`}
                  className="text-xs font-semibold uppercase tracking-[0.08em] text-sky-200 transition hover:text-white"
                >
                  Full Traffic Report
                </Link>
              </div>
              <div className="mt-3 space-y-2">
                {landingPage.sources.length === 0 ? <p className="text-sm text-white/60">No source clicks captured yet.</p> : null}
                {landingPage.sources.map((source) => (
                  <div key={source.source} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-white">{source.source}</span>
                    <span className="shrink-0 text-white/60">{formatNumber(source.signupClicks)} clicks</span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
        <PaginatedSectionFooter
          currentPage={landingPagePagination.safePage}
          itemLabel="landing pages"
          onPageChange={setLandingPageListPage}
          totalItems={analytics?.landingPages.length ?? 0}
        />
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-[family-name:var(--font-heading)] text-[20px] text-white">Short URLs</h2>
            <p className="mt-1 text-sm text-white/55">Each short URL can randomly split traffic across any landing pages you select.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-5">
          {analytics?.shortUrls.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-6 text-sm text-white/60">
              No short URLs created yet.
            </div>
          ) : null}

          {paginatedShortUrls.map((shortUrl) => (
            <article key={shortUrl.id} className="rounded-3xl border border-white/10 bg-[#0c0f14]/95 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-[family-name:var(--font-heading)] text-[20px] text-white">{shortUrl.name}</h3>
                    {!shortUrl.isActive ? (
                      <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-100">
                        Inactive
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 font-mono text-sm text-sky-200">/s/{shortUrl.key}</p>
                  {shortUrl.description ? <p className="mt-2 max-w-3xl text-sm text-white/60">{shortUrl.description}</p> : null}
                  {[shortUrl.utmSource, shortUrl.utmMedium, shortUrl.utmCampaign, shortUrl.utmContent, shortUrl.utmTerm].some(Boolean) ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/60">
                      {shortUrl.utmSource ? <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">source: {shortUrl.utmSource}</span> : null}
                      {shortUrl.utmMedium ? <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">medium: {shortUrl.utmMedium}</span> : null}
                      {shortUrl.utmCampaign ? <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">campaign: {shortUrl.utmCampaign}</span> : null}
                      {shortUrl.utmContent ? <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">content: {shortUrl.utmContent}</span> : null}
                      {shortUrl.utmTerm ? <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">term: {shortUrl.utmTerm}</span> : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/landing-pages/report?shortUrlId=${shortUrl.id}`}
                    className="rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/15 hover:text-white"
                  >
                    Traffic
                  </Link>
                  <Link
                    href={`/admin/landing-pages/performance?shortUrlId=${shortUrl.id}`}
                    className="rounded-lg border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/15 hover:text-white"
                  >
                    Performance
                  </Link>
                  <button
                    type="button"
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                    onClick={() => setOpenShortUrlEditorId((currentValue) => (currentValue === shortUrl.id ? null : shortUrl.id))}
                  >
                    {openShortUrlEditorId === shortUrl.id ? 'Close Editor' : 'Edit'}
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-[#11161e]/90 px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-white/45">Views</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(shortUrl.kpis.totalVisits)}</p>
                  <p className="mt-1 text-xs text-white/45">{formatNumber(shortUrl.kpis.uniqueVisitors)} visitors</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#11161e]/90 px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-white/45">Signups</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(shortUrl.kpis.signups)}</p>
                  <p className="mt-1 text-xs text-emerald-300">{formatPercent(shortUrl.kpis.signupConversionRate)} signup CVR</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#11161e]/90 px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-white/45">Sales</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(shortUrl.kpis.patreonSales)}</p>
                  <p className="mt-1 text-xs text-amber-300">{formatPercent(shortUrl.kpis.patreonSaleRate)} sale CVR</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#11161e]/90 px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-white/45">Revenue</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatCurrencyCents(shortUrl.kpis.totalRevenueCents)}</p>
                  <p className="mt-1 text-xs text-white/45">{formatNumber(shortUrl.kpis.totalPurchases)} purchases</p>
                </div>
              </div>

              {openShortUrlEditorId === shortUrl.id ? (
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                      value={shortUrlEditForms[shortUrl.id]?.name ?? shortUrl.name}
                      onChange={(event) =>
                        setShortUrlEditForms((currentValue) => ({
                          ...currentValue,
                          [shortUrl.id]: {
                            ...(currentValue[shortUrl.id] ?? buildShortUrlFormValue(shortUrl, landingOptions)),
                            name: event.target.value
                          }
                        }))
                      }
                    />
                    <input
                      className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                      value={shortUrlEditForms[shortUrl.id]?.key ?? shortUrl.key}
                      onChange={(event) =>
                        setShortUrlEditForms((currentValue) => ({
                          ...currentValue,
                          [shortUrl.id]: {
                            ...(currentValue[shortUrl.id] ?? buildShortUrlFormValue(shortUrl, landingOptions)),
                            key: event.target.value
                          }
                        }))
                      }
                    />
                    <textarea
                      className="min-h-20 rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white md:col-span-2"
                      value={shortUrlEditForms[shortUrl.id]?.description ?? shortUrl.description ?? ''}
                      onChange={(event) =>
                        setShortUrlEditForms((currentValue) => ({
                          ...currentValue,
                          [shortUrl.id]: {
                            ...(currentValue[shortUrl.id] ?? buildShortUrlFormValue(shortUrl, landingOptions)),
                            description: event.target.value
                          }
                        }))
                      }
                    />
                    <div className="grid gap-3 md:col-span-2 md:grid-cols-2 xl:grid-cols-5">
                      <input
                        className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                        placeholder="utm_source"
                        value={shortUrlEditForms[shortUrl.id]?.utmSource ?? shortUrl.utmSource ?? ''}
                        onChange={(event) =>
                          setShortUrlEditForms((currentValue) => ({
                            ...currentValue,
                            [shortUrl.id]: {
                              ...(currentValue[shortUrl.id] ?? buildShortUrlFormValue(shortUrl, landingOptions)),
                              utmSource: event.target.value
                            }
                          }))
                        }
                      />
                      <input
                        className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                        placeholder="utm_medium"
                        value={shortUrlEditForms[shortUrl.id]?.utmMedium ?? shortUrl.utmMedium ?? ''}
                        onChange={(event) =>
                          setShortUrlEditForms((currentValue) => ({
                            ...currentValue,
                            [shortUrl.id]: {
                              ...(currentValue[shortUrl.id] ?? buildShortUrlFormValue(shortUrl, landingOptions)),
                              utmMedium: event.target.value
                            }
                          }))
                        }
                      />
                      <input
                        className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                        placeholder="utm_campaign"
                        value={shortUrlEditForms[shortUrl.id]?.utmCampaign ?? shortUrl.utmCampaign ?? ''}
                        onChange={(event) =>
                          setShortUrlEditForms((currentValue) => ({
                            ...currentValue,
                            [shortUrl.id]: {
                              ...(currentValue[shortUrl.id] ?? buildShortUrlFormValue(shortUrl, landingOptions)),
                              utmCampaign: event.target.value
                            }
                          }))
                        }
                      />
                      <input
                        className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                        placeholder="utm_content"
                        value={shortUrlEditForms[shortUrl.id]?.utmContent ?? shortUrl.utmContent ?? ''}
                        onChange={(event) =>
                          setShortUrlEditForms((currentValue) => ({
                            ...currentValue,
                            [shortUrl.id]: {
                              ...(currentValue[shortUrl.id] ?? buildShortUrlFormValue(shortUrl, landingOptions)),
                              utmContent: event.target.value
                            }
                          }))
                        }
                      />
                      <input
                        className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                        placeholder="utm_term"
                        value={shortUrlEditForms[shortUrl.id]?.utmTerm ?? shortUrl.utmTerm ?? ''}
                        onChange={(event) =>
                          setShortUrlEditForms((currentValue) => ({
                            ...currentValue,
                            [shortUrl.id]: {
                              ...(currentValue[shortUrl.id] ?? buildShortUrlFormValue(shortUrl, landingOptions)),
                              utmTerm: event.target.value
                            }
                          }))
                        }
                      />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-white/70">
                      <input
                        type="checkbox"
                        checked={shortUrlEditForms[shortUrl.id]?.isActive ?? shortUrl.isActive}
                        onChange={(event) =>
                          setShortUrlEditForms((currentValue) => ({
                            ...currentValue,
                            [shortUrl.id]: {
                              ...(currentValue[shortUrl.id] ?? buildShortUrlFormValue(shortUrl, landingOptions)),
                              isActive: event.target.checked
                            }
                          }))
                        }
                      />
                      Active
                    </label>
                    <div className="md:col-span-2">
                      <p className="text-xs uppercase tracking-[0.08em] text-white/50">Randomized Targets</p>
                      <div className="mt-2">
                        <TargetSelector
                          landingOptions={landingOptions}
                          value={
                            shortUrlEditForms[shortUrl.id]?.targets ??
                            buildTargetSelectionState(
                              landingOptions,
                              shortUrl.targets.map((target) => ({
                                landingPageId: target.landingPageId,
                                weight: target.weight
                              }))
                            )
                          }
                          onChange={(nextValue) =>
                            setShortUrlEditForms((currentValue) => ({
                              ...currentValue,
                              [shortUrl.id]: {
                                ...(currentValue[shortUrl.id] ?? buildShortUrlFormValue(shortUrl, landingOptions)),
                                targets: nextValue
                              }
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-70"
                      disabled={savingShortUrlId === shortUrl.id}
                      onClick={() => void handleSaveShortUrl(shortUrl.id)}
                    >
                      {savingShortUrlId === shortUrl.id ? 'Saving...' : 'Save Short URL'}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/5 hover:text-white"
                      onClick={() => setOpenShortUrlEditorId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 overflow-x-auto">
                <table className="min-w-[980px] text-left text-sm text-white/80">
                  <thead className="text-[11px] uppercase tracking-[0.08em] text-white/45">
                    <tr>
                      <th className="pb-2 pr-4 whitespace-nowrap">Destination</th>
                      <th className="pb-2 pr-4 whitespace-nowrap">Weight</th>
                      <th className="pb-2 pr-4 whitespace-nowrap">Clicks</th>
                      <th className="pb-2 pr-4 whitespace-nowrap">Signups</th>
                      <th className="pb-2 pr-4 whitespace-nowrap">Signup CVR</th>
                      <th className="pb-2 pr-4 whitespace-nowrap">Sales</th>
                      <th className="pb-2 pr-4 whitespace-nowrap">Sale CVR</th>
                      <th className="pb-2 whitespace-nowrap">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortUrl.targets.map((target) => (
                      <tr key={target.id} className="border-t border-white/5">
                        <td className="py-2 pr-4">
                          <div className="font-medium text-white">{target.landingPageName}</div>
                          <div className="font-mono text-[11px] text-white/45">{target.basePath || 'No path configured'}</div>
                        </td>
                        <td className="py-2 pr-4">{formatNumber(target.weight)}</td>
                        <td className="py-2 pr-4">{formatNumber(target.kpis.totalVisits)}</td>
                        <td className="py-2 pr-4">{formatNumber(target.kpis.signups)}</td>
                        <td className="py-2 pr-4 text-emerald-300">{formatPercent(target.kpis.signupConversionRate)}</td>
                        <td className="py-2 pr-4">{formatNumber(target.kpis.patreonSales)}</td>
                        <td className="py-2 pr-4 text-amber-300">{formatPercent(target.kpis.patreonSaleRate)}</td>
                        <td className="py-2">{formatCurrencyCents(target.kpis.totalRevenueCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
        <PaginatedSectionFooter
          currentPage={shortUrlPagination.safePage}
          itemLabel="short URLs"
          onPageChange={setShortUrlListPage}
          totalItems={analytics?.shortUrls.length ?? 0}
        />
      </section>
    </AdminPageShell>
  )
}

export default LandingPagesPage
