'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import { getLandingPagesAnalytics, type LandingPagesAnalyticsResponse } from '@/lib/landing-page-api'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
  }).format(value)

const formatPercent = (value: number) => `${value.toFixed(1)}%`

const formatDayLabel = (value: string | null) => {
  if (!value) {
    return 'N/A'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(new Date(`${value}T00:00:00Z`))
}

type DailyStatRow = LandingPagesAnalyticsResponse['data']['landingPages'][number]['dailyStats'][number]
type ReportSeverity = 'critical' | 'warning' | 'info'
type ReportScope = 'landing-page' | 'variant'
type ReportIssueType =
  | 'no-data'
  | 'traffic-drop'
  | 'signup-drop'
  | 'no-signups'
  | 'no-sales'
  | 'low-signup-cvr'
  | 'low-sale-cvr'

type SortKey =
  | 'severity'
  | 'scope'
  | 'entityName'
  | 'issueType'
  | 'visitors'
  | 'clicks'
  | 'signups'
  | 'sales'
  | 'signupRate'
  | 'saleRate'
  | 'lastSeenDate'

type ReportRow = {
  id: string
  severity: ReportSeverity
  severityRank: number
  scope: ReportScope
  issueType: ReportIssueType
  issueLabel: string
  entityName: string
  landingPageId: string
  landingPageName: string
  variantId: string | null
  variantName: string | null
  routePath: string
  isActive: boolean
  visitors: number
  clicks: number
  signups: number
  sales: number
  signupRate: number
  saleRate: number
  lastSeenDate: string | null
  recommendation: string
  detail: string
}

const severityPillClassName: Record<ReportSeverity, string> = {
  critical: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
  warning: 'border-amber-300/30 bg-amber-400/10 text-amber-100',
  info: 'border-sky-400/30 bg-sky-500/10 text-sky-100'
}

const scopeLabelMap: Record<ReportScope, string> = {
  'landing-page': 'Landing Page',
  variant: 'Variant'
}

const issueLabelMap: Record<ReportIssueType, string> = {
  'no-data': 'No recent data',
  'traffic-drop': 'Traffic drop',
  'signup-drop': 'Signup rate drop',
  'no-signups': 'Clicks without signups',
  'no-sales': 'Signups without sales',
  'low-signup-cvr': 'Low signup CVR',
  'low-sale-cvr': 'Low sale CVR'
}

const sumMetric = (
  dailyStats: DailyStatRow[],
  key: keyof Pick<DailyStatRow, 'uniqueVisitors' | 'signupClicks' | 'signups' | 'patreonSales'>
) =>
  dailyStats.reduce((totalValue, day) => totalValue + day[key], 0)

const getRecentWindow = (dailyStats: DailyStatRow[], size: number) => dailyStats.slice(Math.max(0, dailyStats.length - size))

const getPreviousWindow = (dailyStats: DailyStatRow[], size: number) =>
  dailyStats.slice(Math.max(0, dailyStats.length - size * 2), Math.max(0, dailyStats.length - size))

const createReportRowsForEntity = ({
  entityId,
  scope,
  entityName,
  landingPageId,
  landingPageName,
  variantId,
  variantName,
  routePath,
  isActive,
  uniqueVisitors,
  clicks,
  signups,
  sales,
  signupRate,
  saleRate,
  dailyStats
}: {
  entityId: string
  scope: ReportScope
  entityName: string
  landingPageId: string
  landingPageName: string
  variantId: string | null
  variantName: string | null
  routePath: string
  isActive: boolean
  uniqueVisitors: number
  clicks: number
  signups: number
  sales: number
  signupRate: number
  saleRate: number
  dailyStats: DailyStatRow[]
}) => {
  const reportRows: ReportRow[] = []
  const recentDays = getRecentWindow(dailyStats, 3)
  const previousDays = getPreviousWindow(dailyStats, 3)
  const recentVisitors = sumMetric(recentDays, 'uniqueVisitors')
  const previousVisitors = sumMetric(previousDays, 'uniqueVisitors')
  const recentClicks = sumMetric(recentDays, 'signupClicks')
  const previousClicks = sumMetric(previousDays, 'signupClicks')
  const recentSignups = sumMetric(recentDays, 'signups')
  const previousSignups = sumMetric(previousDays, 'signups')
  const lastSeenDate = dailyStats[dailyStats.length - 1]?.date ?? null
  const clickToSignupRate = clicks > 0 ? (signups / clicks) * 100 : 0

  const pushRow = (row: Omit<ReportRow, 'id' | 'scope' | 'entityName' | 'landingPageId' | 'landingPageName' | 'variantId' | 'variantName' | 'routePath' | 'isActive' | 'visitors' | 'clicks' | 'signups' | 'sales' | 'signupRate' | 'saleRate' | 'lastSeenDate'>) => {
    reportRows.push({
      id: `${entityId}-${row.issueType}`,
      scope,
      entityName,
      landingPageId,
      landingPageName,
      variantId,
      variantName,
      routePath,
      isActive,
      visitors: uniqueVisitors,
      clicks,
      signups,
      sales,
      signupRate,
      saleRate,
      lastSeenDate,
      ...row
    })
  }

  if (isActive && dailyStats.length === 0) {
    pushRow({
      severity: 'critical',
      severityRank: 3,
      issueType: 'no-data',
      issueLabel: issueLabelMap['no-data'],
      recommendation: 'Verify tracking is firing and the route is still receiving spend.',
      detail: 'This active asset has no daily analytics history yet.'
    })
  }

  if (isActive && dailyStats.length > 0 && recentVisitors === 0 && uniqueVisitors > 0) {
    pushRow({
      severity: 'critical',
      severityRank: 3,
      issueType: 'no-data',
      issueLabel: issueLabelMap['no-data'],
      recommendation: 'Check that traffic is still routed here and the page remains active in your campaigns.',
      detail: 'There has been no traffic in the latest 3-day window.'
    })
  }

  if (previousVisitors >= 40 && recentVisitors <= previousVisitors * 0.55) {
    pushRow({
      severity: 'warning',
      severityRank: 2,
      issueType: 'traffic-drop',
      issueLabel: issueLabelMap['traffic-drop'],
      recommendation: 'Review source delivery, budgets, and recent creative or URL changes.',
      detail: `${formatNumber(previousVisitors)} visitors fell to ${formatNumber(recentVisitors)} in the latest 3-day window.`
    })
  }

  const previousClickToSignupRate = previousClicks > 0 ? (previousSignups / previousClicks) * 100 : 0
  const recentClickToSignupRate = recentClicks > 0 ? (recentSignups / recentClicks) * 100 : 0

  if (clicks >= 20 && signups === 0) {
    pushRow({
      severity: 'critical',
      severityRank: 3,
      issueType: 'no-signups',
      issueLabel: issueLabelMap['no-signups'],
      recommendation: 'Audit CTA clarity, page load health, and signup form completion.',
      detail: `${formatNumber(clicks)} signup modal opens have produced zero signups.`
    })
  }

  if (signups >= 12 && sales === 0) {
    pushRow({
      severity: 'warning',
      severityRank: 2,
      issueType: 'no-sales',
      issueLabel: issueLabelMap['no-sales'],
      recommendation: 'Check Patreon handoff quality, pricing, and purchase flow continuity.',
      detail: `${formatNumber(signups)} signups have not converted into a single sale yet.`
    })
  }

  if (clicks >= 20 && clickToSignupRate > 0 && clickToSignupRate < 30) {
    pushRow({
      severity: 'warning',
      severityRank: 2,
      issueType: 'low-signup-cvr',
      issueLabel: issueLabelMap['low-signup-cvr'],
      recommendation: 'Review signup modal friction, field count, and message match after the click.',
      detail: `Only ${formatPercent(clickToSignupRate)} of signup modal opens are turning into signups.`
    })
  }

  if (previousClicks >= 20 && recentClicks >= 10 && previousClickToSignupRate >= 30 && recentClickToSignupRate <= previousClickToSignupRate * 0.6) {
    pushRow({
      severity: 'warning',
      severityRank: 2,
      issueType: 'signup-drop',
      issueLabel: issueLabelMap['signup-drop'],
      recommendation: 'Check whether the signup modal flow or validation changed recently.',
      detail: `Click-to-signup rate dropped from ${formatPercent(previousClickToSignupRate)} to ${formatPercent(recentClickToSignupRate)}.`
    })
  }

  if (signups >= 10 && saleRate < 1.5) {
    pushRow({
      severity: 'info',
      severityRank: 1,
      issueType: 'low-sale-cvr',
      issueLabel: issueLabelMap['low-sale-cvr'],
      recommendation: 'Review post-signup follow-through and Patreon messaging.',
      detail: `Sale conversion is ${formatPercent(saleRate)} on meaningful signup volume.`
    })
  }

  return reportRows
}

const compareValues = (leftValue: string | number | null, rightValue: string | number | null, direction: 'asc' | 'desc') => {
  const normalizedLeft = leftValue ?? ''
  const normalizedRight = rightValue ?? ''

  if (normalizedLeft < normalizedRight) {
    return direction === 'asc' ? -1 : 1
  }

  if (normalizedLeft > normalizedRight) {
    return direction === 'asc' ? 1 : -1
  }

  return 0
}

const LandingPagesReportPage = () => {
  const searchParams = useSearchParams()
  const [analytics, setAnalytics] = useState<LandingPagesAnalyticsResponse['data'] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [severityFilter, setSeverityFilter] = useState<'all' | ReportSeverity>('all')
  const [scopeFilter, setScopeFilter] = useState<'all' | ReportScope>('all')
  const [issueTypeFilter, setIssueTypeFilter] = useState<'all' | ReportIssueType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [landingPageFilter, setLandingPageFilter] = useState<string>(searchParams.get('landingPageId') ?? 'all')
  const [variantFilter, setVariantFilter] = useState<string>(searchParams.get('variantId') ?? 'all')
  const [sortKey, setSortKey] = useState<SortKey>('severity')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    const run = async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const payload = await getLandingPagesAnalytics()
        setAnalytics(payload.data)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load landing page report.')
      } finally {
        setIsLoading(false)
      }
    }

    void run()
  }, [])

  const reportRows = useMemo(() => {
    if (!analytics) {
      return []
    }

    return analytics.landingPages.flatMap((landingPage) => {
      const landingPageRows = createReportRowsForEntity({
        entityId: landingPage.id,
        scope: 'landing-page',
        entityName: landingPage.name,
        landingPageId: landingPage.id,
        landingPageName: landingPage.name,
        variantId: null,
        variantName: null,
        routePath: landingPage.basePath ?? 'N/A',
        isActive: landingPage.isActive,
        uniqueVisitors: landingPage.kpis.uniqueVisitors,
        clicks: landingPage.kpis.signupClicks,
        signups: landingPage.kpis.signups,
        sales: landingPage.kpis.patreonSales,
        signupRate: landingPage.kpis.signupConversionRate,
        saleRate: landingPage.kpis.patreonSaleRate,
        dailyStats: landingPage.dailyStats
      })

      const variantRows = landingPage.variants.flatMap((variant) =>
        createReportRowsForEntity({
          entityId: variant.id,
          scope: 'variant',
          entityName: variant.name,
          landingPageId: landingPage.id,
          landingPageName: landingPage.name,
          variantId: variant.id,
          variantName: variant.name,
          routePath: variant.routePath,
          isActive: variant.isActive,
          uniqueVisitors: variant.uniqueVisitors,
          clicks: variant.signupClicks,
          signups: variant.signups,
          sales: variant.patreonSales,
          signupRate: variant.signupConversionRate,
          saleRate: variant.patreonSaleRate,
          dailyStats: variant.dailyStats
        })
      )

      return [...landingPageRows, ...variantRows]
    })
  }, [analytics])

  const filteredRows = useMemo(() => {
    const normalizedSearchValue = searchValue.trim().toLowerCase()

    return reportRows.filter((row) => {
      if (severityFilter !== 'all' && row.severity !== severityFilter) {
        return false
      }

      if (scopeFilter !== 'all' && row.scope !== scopeFilter) {
        return false
      }

      if (issueTypeFilter !== 'all' && row.issueType !== issueTypeFilter) {
        return false
      }

      if (statusFilter === 'active' && !row.isActive) {
        return false
      }

      if (statusFilter === 'inactive' && row.isActive) {
        return false
      }

      if (landingPageFilter !== 'all' && row.landingPageId !== landingPageFilter) {
        return false
      }

      if (variantFilter !== 'all' && row.variantId !== variantFilter) {
        return false
      }

      if (!normalizedSearchValue) {
        return true
      }

      const searchHaystack = [
        row.entityName,
        row.landingPageName,
        row.variantName,
        row.issueLabel,
        row.detail,
        row.routePath
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchHaystack.includes(normalizedSearchValue)
    })
  }, [issueTypeFilter, landingPageFilter, reportRows, scopeFilter, searchValue, severityFilter, statusFilter, variantFilter])

  const sortedRows = useMemo(() => {
    const rowList = [...filteredRows]

    rowList.sort((leftRow, rightRow) => {
      switch (sortKey) {
        case 'severity':
          return compareValues(leftRow.severityRank, rightRow.severityRank, sortDirection)
        case 'scope':
          return compareValues(leftRow.scope, rightRow.scope, sortDirection)
        case 'entityName':
          return compareValues(leftRow.entityName, rightRow.entityName, sortDirection)
        case 'issueType':
          return compareValues(leftRow.issueLabel, rightRow.issueLabel, sortDirection)
        case 'visitors':
          return compareValues(leftRow.visitors, rightRow.visitors, sortDirection)
        case 'clicks':
          return compareValues(leftRow.clicks, rightRow.clicks, sortDirection)
        case 'signups':
          return compareValues(leftRow.signups, rightRow.signups, sortDirection)
        case 'sales':
          return compareValues(leftRow.sales, rightRow.sales, sortDirection)
        case 'signupRate':
          return compareValues(leftRow.signupRate, rightRow.signupRate, sortDirection)
        case 'saleRate':
          return compareValues(leftRow.saleRate, rightRow.saleRate, sortDirection)
        case 'lastSeenDate':
          return compareValues(leftRow.lastSeenDate, rightRow.lastSeenDate, sortDirection)
        default:
          return 0
      }
    })

    return rowList
  }, [filteredRows, sortDirection, sortKey])

  const summary = useMemo(
    () => ({
      critical: reportRows.filter((row) => row.severity === 'critical').length,
      warning: reportRows.filter((row) => row.severity === 'warning').length,
      info: reportRows.filter((row) => row.severity === 'info').length
    }),
    [reportRows]
  )

  const variantOptions = useMemo(() => {
    if (!analytics) {
      return []
    }

    const matchingLandingPage =
      landingPageFilter === 'all' ? null : analytics.landingPages.find((landingPage) => landingPage.id === landingPageFilter)

    return matchingLandingPage
      ? matchingLandingPage.variants
      : analytics.landingPages.flatMap((landingPage) =>
          landingPage.variants.map((variant) => ({
            ...variant,
            name: `${landingPage.name} / ${variant.name}`
          }))
        )
  }, [analytics, landingPageFilter])

  const handleSortChange = (nextSortKey: SortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection((currentValue) => (currentValue === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(nextSortKey)
    setSortDirection(nextSortKey === 'entityName' || nextSortKey === 'scope' || nextSortKey === 'issueType' ? 'asc' : 'desc')
  }

  return (
    <AdminPageShell activeKey="landing-pages">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-tight text-white sm:text-[26px] md:text-[29px] md:leading-none">
            Landing Page Report
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-[#95a6c1]">
            Review delivery and conversion issues across landing pages and variants in a single diagnostics table with advertiser-style filtering and sorting.
          </p>
        </div>
        <Link
          href="/admin/landing-pages"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Back to Landing Pages
        </Link>
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-white/50">Open issues</p>
          <p className="mt-2 text-3xl font-semibold text-white">{formatNumber(reportRows.length)}</p>
          <p className="mt-1 text-xs text-white/45">{formatNumber(sortedRows.length)} match your current filters</p>
        </div>
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/5 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-rose-100/80">Critical</p>
          <p className="mt-2 text-3xl font-semibold text-rose-100">{formatNumber(summary.critical)}</p>
          <p className="mt-1 text-xs text-rose-100/60">Immediate fixes or traffic checks</p>
        </div>
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/5 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-amber-100/80">Warning</p>
          <p className="mt-2 text-3xl font-semibold text-amber-100">{formatNumber(summary.warning)}</p>
          <p className="mt-1 text-xs text-amber-100/60">Performance is slipping</p>
        </div>
        <div className="rounded-2xl border border-sky-400/20 bg-sky-500/5 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-sky-100/80">Info</p>
          <p className="mt-2 text-3xl font-semibold text-sky-100">{formatNumber(summary.info)}</p>
          <p className="mt-1 text-xs text-sky-100/60">Optimization opportunities</p>
        </div>
      </div>

      <section className="mt-5 rounded-2xl border border-white/10 bg-[#0c0f14]/95 p-4 sm:p-5">
        <div className="grid gap-3 xl:grid-cols-[1.4fr_repeat(5,minmax(0,1fr))]">
          <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-white/55">
            Search
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search page, variant, issue, path..."
              className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2.5 text-sm normal-case tracking-normal text-white placeholder:text-white/30"
            />
          </label>
          <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-white/55">
            Severity
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value as 'all' | ReportSeverity)}
              className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2.5 text-sm normal-case tracking-normal text-white"
            >
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </label>
          <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-white/55">
            Scope
            <select
              value={scopeFilter}
              onChange={(event) => setScopeFilter(event.target.value as 'all' | ReportScope)}
              className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2.5 text-sm normal-case tracking-normal text-white"
            >
              <option value="all">All scopes</option>
              <option value="landing-page">Landing pages</option>
              <option value="variant">Variants</option>
            </select>
          </label>
          <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-white/55">
            Issue Type
            <select
              value={issueTypeFilter}
              onChange={(event) => setIssueTypeFilter(event.target.value as 'all' | ReportIssueType)}
              className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2.5 text-sm normal-case tracking-normal text-white"
            >
              <option value="all">All issues</option>
              {Object.entries(issueLabelMap).map(([issueType, label]) => (
                <option key={issueType} value={issueType}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-white/55">
            Landing Page
            <select
              value={landingPageFilter}
              onChange={(event) => {
                setLandingPageFilter(event.target.value)
                setVariantFilter('all')
              }}
              className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2.5 text-sm normal-case tracking-normal text-white"
            >
              <option value="all">All landing pages</option>
              {analytics?.landingPages.map((landingPage) => (
                <option key={landingPage.id} value={landingPage.id}>
                  {landingPage.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-white/55">
            Variant / Status
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <select
                value={variantFilter}
                onChange={(event) => setVariantFilter(event.target.value)}
                className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2.5 text-sm normal-case tracking-normal text-white"
              >
                <option value="all">All variants</option>
                {variantOptions.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'inactive')}
                className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2.5 text-sm normal-case tracking-normal text-white"
              >
                <option value="active">Active only</option>
                <option value="all">All statuses</option>
                <option value="inactive">Inactive only</option>
              </select>
            </div>
          </label>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0f14]/95">
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] text-left text-sm text-white/85">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.08em] text-white/45">
              <tr>
                {[
                  ['severity', 'Severity'],
                  ['scope', 'Scope'],
                  ['entityName', 'Entity'],
                  ['issueType', 'Issue'],
                  ['visitors', 'Visitors'],
                  ['clicks', 'Clicks'],
                  ['signups', 'Signups'],
                  ['sales', 'Sales'],
                  ['signupRate', 'Signup CVR'],
                  ['saleRate', 'Sale CVR'],
                  ['lastSeenDate', 'Last Seen']
                ].map(([columnKey, label]) => (
                  <th key={columnKey} className="px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 transition hover:text-white"
                      onClick={() => handleSortChange(columnKey as SortKey)}
                    >
                      {label}
                      <span className={sortKey === columnKey ? 'text-white' : 'text-white/20'}>
                        {sortKey === columnKey ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-sm text-white/55">
                    Loading report...
                  </td>
                </tr>
              ) : null}
              {!isLoading && sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-sm text-white/55">
                    No report rows match the current filters.
                  </td>
                </tr>
              ) : null}
              {!isLoading
                ? sortedRows.map((row) => (
                    <tr key={row.id} className="border-t border-white/5 align-top">
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${severityPillClassName[row.severity]}`}>
                          {row.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/70">{scopeLabelMap[row.scope]}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="font-medium text-white">{row.entityName}</div>
                          <div className="text-xs text-white/45">{row.landingPageName}</div>
                          <div className="font-mono text-[11px] text-white/35">{row.routePath}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{row.issueLabel}</div>
                      </td>
                      <td className="px-4 py-3">{formatNumber(row.visitors)}</td>
                      <td className="px-4 py-3">{formatNumber(row.clicks)}</td>
                      <td className="px-4 py-3">{formatNumber(row.signups)}</td>
                      <td className="px-4 py-3">{formatNumber(row.sales)}</td>
                      <td className="px-4 py-3 text-emerald-300">{formatPercent(row.signupRate)}</td>
                      <td className="px-4 py-3 text-amber-300">{formatPercent(row.saleRate)}</td>
                      <td className="px-4 py-3 text-white/60">{formatDayLabel(row.lastSeenDate)}</td>
                      <td className="px-4 py-3 text-sm text-white/65">{row.detail}</td>
                      <td className="px-4 py-3 text-sm text-white/55">{row.recommendation}</td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPageShell>
  )
}

export default LandingPagesReportPage
