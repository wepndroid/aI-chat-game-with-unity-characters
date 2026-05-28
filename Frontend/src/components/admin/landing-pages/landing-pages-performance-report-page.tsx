'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import {
  getLandingPagesPerformanceReport,
  type LandingPagesPerformanceReportResponse
} from '@/lib/landing-page-api'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

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

const formatDayLabel = (value: string | null) => {
  if (!value) {
    return 'N/A'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(new Date(`${value}T00:00:00Z`))
}

type DailyStatRow = LandingPagesPerformanceReportResponse['data']['landingPages'][number]['dailyStats'][number]
type PerformanceLandingPage = LandingPagesPerformanceReportResponse['data']['landingPages'][number]
type PerformanceEntity = Pick<
  PerformanceLandingPage,
  'id' | 'name' | 'description' | 'basePath' | 'isActive' | 'kpis' | 'dailyStats'
>
type ReportSeverity = 'critical' | 'warning' | 'info'
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
  | 'landingPageName'
  | 'issueType'
  | 'visitors'
  | 'clicks'
  | 'signups'
  | 'sales'
  | 'signupRate'
  | 'saleRate'
  | 'revenue'
  | 'lastSeenDate'

type ReportRow = {
  id: string
  severity: ReportSeverity
  severityRank: number
  issueType: ReportIssueType
  issueLabel: string
  landingPageId: string
  landingPageName: string
  routePath: string
  isActive: boolean
  visitors: number
  clicks: number
  signups: number
  sales: number
  signupRate: number
  saleRate: number
  totalRevenueCents: number
  lastSeenDate: string | null
  recommendation: string
  detail: string
}

const pageSize = 25

const dailyColumnTooltips = {
  date: 'Calendar day for the tracked landing-page activity.',
  visitors: 'Unique visitors recorded on this date.',
  visits: 'Total landing-page visits recorded on this date, including repeat visits.',
  clicks: 'Signup CTA clicks recorded on this date.',
  signups: 'Users who completed signup from attributed landing-page visits.',
  buyers: 'Attributed users who generated at least one purchase.',
  purchases: 'Total purchase events attributed to these landing-page visits.',
  currentMonthly: 'Current monthly recurring subscription value from active attributed subscribers. Yearly plans are shown as monthly equivalent.',
  subscribers: 'Active attributed subscribers contributing current monthly subscription value.',
  firstPurchaseRevenue: 'Revenue from each buyer first attributed purchase.',
  lifetimeRevenue: 'All tracked revenue attributed to these visits, including repeat purchases.',
  signupCvr: 'Percentage of unique visitors who completed signup.',
  saleCvr: 'Percentage of unique visitors who became buyers.'
}

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
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4 text-sm text-white/55">
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

const severityPillClassName: Record<ReportSeverity, string> = {
  critical: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
  warning: 'border-amber-300/30 bg-amber-400/10 text-amber-100',
  info: 'border-sky-400/30 bg-sky-500/10 text-sky-100'
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
) => dailyStats.reduce((totalValue, day) => totalValue + day[key], 0)

const getRecentWindow = (dailyStats: DailyStatRow[], size: number) => dailyStats.slice(Math.max(0, dailyStats.length - size))

const getPreviousWindow = (dailyStats: DailyStatRow[], size: number) =>
  dailyStats.slice(Math.max(0, dailyStats.length - size * 2), Math.max(0, dailyStats.length - size))

const createReportRowsForLandingPage = (landingPage: PerformanceEntity) => {
  const reportRows: ReportRow[] = []
  const recentDays = getRecentWindow(landingPage.dailyStats, 3)
  const previousDays = getPreviousWindow(landingPage.dailyStats, 3)
  const recentVisitors = sumMetric(recentDays, 'uniqueVisitors')
  const previousVisitors = sumMetric(previousDays, 'uniqueVisitors')
  const recentClicks = sumMetric(recentDays, 'signupClicks')
  const previousClicks = sumMetric(previousDays, 'signupClicks')
  const recentSignups = sumMetric(recentDays, 'signups')
  const previousSignups = sumMetric(previousDays, 'signups')
  const lastSeenDate = landingPage.dailyStats[landingPage.dailyStats.length - 1]?.date ?? null
  const clickToSignupRate =
    landingPage.kpis.signupClicks > 0 ? (landingPage.kpis.signups / landingPage.kpis.signupClicks) * 100 : 0

  const pushRow = (
    row: Omit<
      ReportRow,
      | 'id'
      | 'landingPageId'
      | 'landingPageName'
      | 'routePath'
      | 'isActive'
      | 'visitors'
      | 'clicks'
      | 'signups'
      | 'sales'
      | 'signupRate'
      | 'saleRate'
      | 'totalRevenueCents'
      | 'lastSeenDate'
    >
  ) => {
    reportRows.push({
      id: `${landingPage.id}-${row.issueType}`,
      landingPageId: landingPage.id,
      landingPageName: landingPage.name,
      routePath: landingPage.basePath ?? 'N/A',
      isActive: landingPage.isActive,
      visitors: landingPage.kpis.uniqueVisitors,
      clicks: landingPage.kpis.signupClicks,
      signups: landingPage.kpis.signups,
      sales: landingPage.kpis.patreonSales,
      signupRate: landingPage.kpis.signupConversionRate,
      saleRate: landingPage.kpis.patreonSaleRate,
      totalRevenueCents: landingPage.kpis.totalRevenueCents,
      lastSeenDate,
      ...row
    })
  }

  if (landingPage.isActive && landingPage.dailyStats.length === 0) {
    pushRow({
      severity: 'critical',
      severityRank: 3,
      issueType: 'no-data',
      issueLabel: issueLabelMap['no-data'],
      recommendation: 'Verify tracking is firing and confirm this page is still receiving traffic.',
      detail: 'This active landing page has no analytics history yet.'
    })
  }

  if (landingPage.isActive && landingPage.dailyStats.length > 0 && recentVisitors === 0 && landingPage.kpis.uniqueVisitors > 0) {
    pushRow({
      severity: 'critical',
      severityRank: 3,
      issueType: 'no-data',
      issueLabel: issueLabelMap['no-data'],
      recommendation: 'Check your traffic routing, active campaigns, and whether this page was removed from the funnel.',
      detail: 'There has been no traffic in the latest 3-day window.'
    })
  }

  if (previousVisitors >= 40 && recentVisitors <= previousVisitors * 0.55) {
    pushRow({
      severity: 'warning',
      severityRank: 2,
      issueType: 'traffic-drop',
      issueLabel: issueLabelMap['traffic-drop'],
      recommendation: 'Review budgets, source delivery, and any recent URL or routing changes.',
      detail: `${formatNumber(previousVisitors)} visitors fell to ${formatNumber(recentVisitors)} in the latest 3-day window.`
    })
  }

  const previousClickToSignupRate = previousClicks > 0 ? (previousSignups / previousClicks) * 100 : 0
  const recentClickToSignupRate = recentClicks > 0 ? (recentSignups / recentClicks) * 100 : 0

  if (landingPage.kpis.signupClicks >= 20 && landingPage.kpis.signups === 0) {
    pushRow({
      severity: 'critical',
      severityRank: 3,
      issueType: 'no-signups',
      issueLabel: issueLabelMap['no-signups'],
      recommendation: 'Audit CTA clarity, page load health, and the signup completion flow.',
      detail: `${formatNumber(landingPage.kpis.signupClicks)} signup clicks have produced zero signups.`
    })
  }

  if (landingPage.kpis.signups >= 12 && landingPage.kpis.patreonSales === 0) {
    pushRow({
      severity: 'warning',
      severityRank: 2,
      issueType: 'no-sales',
      issueLabel: issueLabelMap['no-sales'],
      recommendation: 'Check the checkout handoff, pricing message, and purchase continuity after signup.',
      detail: `${formatNumber(landingPage.kpis.signups)} signups have not converted into a sale yet.`
    })
  }

  if (landingPage.kpis.signupClicks >= 20 && clickToSignupRate > 0 && clickToSignupRate < 30) {
    pushRow({
      severity: 'warning',
      severityRank: 2,
      issueType: 'low-signup-cvr',
      issueLabel: issueLabelMap['low-signup-cvr'],
      recommendation: 'Review post-click friction, field count, and message match between page and signup flow.',
      detail: `Only ${formatPercent(clickToSignupRate)} of signup clicks are turning into signups.`
    })
  }

  if (
    previousClicks >= 20 &&
    recentClicks >= 10 &&
    previousClickToSignupRate >= 30 &&
    recentClickToSignupRate <= previousClickToSignupRate * 0.6
  ) {
    pushRow({
      severity: 'warning',
      severityRank: 2,
      issueType: 'signup-drop',
      issueLabel: issueLabelMap['signup-drop'],
      recommendation: 'Check whether the signup flow, form validation, or page messaging changed recently.',
      detail: `Click-to-signup rate dropped from ${formatPercent(previousClickToSignupRate)} to ${formatPercent(recentClickToSignupRate)}.`
    })
  }

  if (landingPage.kpis.signups >= 10 && landingPage.kpis.patreonSaleRate < 1.5) {
    pushRow({
      severity: 'info',
      severityRank: 1,
      issueType: 'low-sale-cvr',
      issueLabel: issueLabelMap['low-sale-cvr'],
      recommendation: 'Review follow-up messaging and the transition from signup into paid subscription.',
      detail: `Sale conversion is ${formatPercent(landingPage.kpis.patreonSaleRate)} on meaningful signup volume.`
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

const LandingPagesPerformanceReportPage = () => {
  const searchParams = useSearchParams()
  const [report, setReport] = useState<LandingPagesPerformanceReportResponse['data'] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [severityFilter, setSeverityFilter] = useState<'all' | ReportSeverity>('all')
  const [issueTypeFilter, setIssueTypeFilter] = useState<'all' | ReportIssueType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [landingPageFilter, setLandingPageFilter] = useState<string>(searchParams.get('landingPageId') ?? 'all')
  const [shortUrlFilter, setShortUrlFilter] = useState<string>(searchParams.get('shortUrlId') ?? 'all')
  const [sortKey, setSortKey] = useState<SortKey>('severity')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [dailyPage, setDailyPage] = useState(1)
  const [issuePage, setIssuePage] = useState(1)

  useEffect(() => {
    const run = async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const payload = await getLandingPagesPerformanceReport()
        setReport(payload.data)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load landing page performance report.')
      } finally {
        setIsLoading(false)
      }
    }

    void run()
  }, [])

  const reportRows = useMemo(() => {
    if (!report) {
      return []
    }

    if (shortUrlFilter !== 'all') {
      return report.shortUrls
        .filter((shortUrl) => shortUrl.id === shortUrlFilter)
        .flatMap((shortUrl) =>
          createReportRowsForLandingPage({
            id: `short-url-${shortUrl.id}`,
            name: `/s/${shortUrl.key} · ${shortUrl.name}`,
            description: shortUrl.description,
            basePath: `/s/${shortUrl.key}`,
            isActive: shortUrl.isActive,
            kpis: shortUrl.kpis,
            dailyStats: shortUrl.dailyStats
          })
        )
    }

    return report.landingPages.flatMap((landingPage) => createReportRowsForLandingPage(landingPage))
  }, [report, shortUrlFilter])

  const filteredRows = useMemo(() => {
    const normalizedSearchValue = searchValue.trim().toLowerCase()

    return reportRows.filter((row) => {
      if (severityFilter !== 'all' && row.severity !== severityFilter) {
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

      if (shortUrlFilter === 'all' && landingPageFilter !== 'all' && row.landingPageId !== landingPageFilter) {
        return false
      }

      if (!normalizedSearchValue) {
        return true
      }

      return [row.landingPageName, row.issueLabel, row.detail, row.routePath]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearchValue)
    })
  }, [issueTypeFilter, landingPageFilter, reportRows, searchValue, severityFilter, shortUrlFilter, statusFilter])

  const sortedRows = useMemo(() => {
    const rowList = [...filteredRows]

    rowList.sort((leftRow, rightRow) => {
      switch (sortKey) {
        case 'severity':
          return compareValues(leftRow.severityRank, rightRow.severityRank, sortDirection)
        case 'landingPageName':
          return compareValues(leftRow.landingPageName, rightRow.landingPageName, sortDirection)
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
        case 'revenue':
          return compareValues(leftRow.totalRevenueCents, rightRow.totalRevenueCents, sortDirection)
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

  const dailyBreakdownLandingPages = useMemo(() => {
    if (!report) {
      return []
    }

    const normalizedSearchValue = searchValue.trim().toLowerCase()
    const landingPageIdsMatchingIssueFilters =
      severityFilter !== 'all' || issueTypeFilter !== 'all'
        ? new Set(filteredRows.map((row) => row.landingPageId))
        : null

    const sourceRows =
      shortUrlFilter !== 'all'
        ? report.shortUrls
            .filter((shortUrl) => shortUrl.id === shortUrlFilter)
            .map((shortUrl) => ({
              id: `short-url-${shortUrl.id}`,
              name: `/s/${shortUrl.key} · ${shortUrl.name}`,
              description: shortUrl.description,
              basePath: `/s/${shortUrl.key}`,
              isActive: shortUrl.isActive,
              kpis: shortUrl.kpis,
              dailyStats: shortUrl.dailyStats
            }))
        : report.landingPages

    return sourceRows.filter((landingPage) => {
      if (statusFilter === 'active' && !landingPage.isActive) {
        return false
      }

      if (statusFilter === 'inactive' && landingPage.isActive) {
        return false
      }

      if (shortUrlFilter === 'all' && landingPageFilter !== 'all' && landingPage.id !== landingPageFilter) {
        return false
      }

      if (landingPageIdsMatchingIssueFilters && !landingPageIdsMatchingIssueFilters.has(landingPage.id)) {
        return false
      }

      if (!normalizedSearchValue) {
        return true
      }

      return [landingPage.name, landingPage.description, landingPage.basePath]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearchValue)
    })
  }, [filteredRows, issueTypeFilter, landingPageFilter, report, searchValue, severityFilter, shortUrlFilter, statusFilter])

  const dailyBreakdown = useMemo(() => {
    const dayMap = new Map<
      string,
      {
        date: string
        uniqueVisitors: number
        totalVisits: number
        signupClicks: number
        signups: number
        patreonSales: number
        totalPurchases: number
        firstPurchaseRevenueCents: number
        totalRevenueCents: number
        currentMonthlySubscriptionEarningCents: number
        currentSubscribers: number
      }
    >()

    const ensureDay = (date: string) => {
      const existingDay = dayMap.get(date) ?? {
        date,
        uniqueVisitors: 0,
        totalVisits: 0,
        signupClicks: 0,
        signups: 0,
        patreonSales: 0,
        totalPurchases: 0,
        firstPurchaseRevenueCents: 0,
        totalRevenueCents: 0,
        currentMonthlySubscriptionEarningCents: 0,
        currentSubscribers: 0
      }

      dayMap.set(date, existingDay)
      return existingDay
    }

    for (const landingPage of dailyBreakdownLandingPages) {
      for (const dayStat of landingPage.dailyStats) {
        const dayEntry = ensureDay(dayStat.date)
        dayEntry.uniqueVisitors += dayStat.uniqueVisitors
        dayEntry.totalVisits += dayStat.totalVisits
        dayEntry.signupClicks += dayStat.signupClicks
        dayEntry.signups += dayStat.signups
        dayEntry.patreonSales += dayStat.patreonSales
        dayEntry.totalPurchases += dayStat.totalPurchases
        dayEntry.firstPurchaseRevenueCents += dayStat.firstPurchaseRevenueCents
        dayEntry.totalRevenueCents += dayStat.totalRevenueCents
        dayEntry.currentMonthlySubscriptionEarningCents += dayStat.currentMonthlySubscriptionEarningCents
        dayEntry.currentSubscribers += dayStat.currentSubscribers
      }
    }

    return [...dayMap.values()]
      .sort((left, right) => right.date.localeCompare(left.date))
      .map((dayEntry) => ({
        ...dayEntry,
        clickThroughRate: dayEntry.uniqueVisitors > 0 ? (dayEntry.signupClicks / dayEntry.uniqueVisitors) * 100 : 0,
        signupConversionRate: dayEntry.uniqueVisitors > 0 ? (dayEntry.signups / dayEntry.uniqueVisitors) * 100 : 0,
        patreonSaleRate: dayEntry.uniqueVisitors > 0 ? (dayEntry.patreonSales / dayEntry.uniqueVisitors) * 100 : 0
      }))
  }, [dailyBreakdownLandingPages])

  useEffect(() => {
    setDailyPage(1)
    setIssuePage(1)
  }, [issueTypeFilter, landingPageFilter, searchValue, severityFilter, shortUrlFilter, sortDirection, sortKey, statusFilter])

  const dailyPagination = getPaginationBounds(dailyBreakdown.length, dailyPage)
  const issuePagination = getPaginationBounds(sortedRows.length, issuePage)
  const paginatedDailyBreakdown = dailyBreakdown.slice(dailyPagination.startIndex, dailyPagination.endIndex)
  const paginatedRows = sortedRows.slice(issuePagination.startIndex, issuePagination.endIndex)

  const handleSortChange = (nextSortKey: SortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection((currentValue) => (currentValue === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(nextSortKey)
    setSortDirection(nextSortKey === 'landingPageName' || nextSortKey === 'issueType' ? 'asc' : 'desc')
  }

  const trafficReportParams = new URLSearchParams()
  if (landingPageFilter !== 'all') {
    trafficReportParams.set('landingPageId', landingPageFilter)
  }
  if (shortUrlFilter !== 'all') {
    trafficReportParams.set('shortUrlId', shortUrlFilter)
  }
  const renderedTrafficReportHref = trafficReportParams.toString()
    ? `/admin/landing-pages/report?${trafficReportParams.toString()}`
    : '/admin/landing-pages/report'

  return (
    <AdminPageShell activeKey="landing-pages">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-tight text-white sm:text-[26px] md:text-[29px] md:leading-none">
            Performance Report
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-[#95a6c1]">
            A diagnostics view for landing-page performance. This flags traffic drops, weak signup conversion, and pages
            that are collecting signups without turning them into revenue.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={renderedTrafficReportHref}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-500/15 hover:text-white"
          >
            Open Traffic Report
          </Link>
          <Link
            href="/admin/landing-pages"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Back to Landing Pages
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-white/50">Open Issues</p>
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
        <div className="grid gap-3 xl:grid-cols-[1.5fr_repeat(5,minmax(0,1fr))]">
          <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-white/55">
            Search
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search page, issue, path..."
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
              onChange={(event) => setLandingPageFilter(event.target.value)}
              className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2.5 text-sm normal-case tracking-normal text-white"
            >
              <option value="all">All landing pages</option>
              {report?.landingPages.map((landingPage) => (
                <option key={landingPage.id} value={landingPage.id}>
                  {landingPage.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-white/55">
            Short URL
            <select
              value={shortUrlFilter}
              onChange={(event) => setShortUrlFilter(event.target.value)}
              className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2.5 text-sm normal-case tracking-normal text-white"
            >
              <option value="all">All short URLs</option>
              {report?.shortUrls.map((shortUrl) => (
                <option key={shortUrl.id} value={shortUrl.id}>
                  /s/{shortUrl.key} · {shortUrl.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-white/55">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'inactive')}
              className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2.5 text-sm normal-case tracking-normal text-white"
            >
              <option value="active">Active only</option>
              <option value="all">All statuses</option>
              <option value="inactive">Inactive only</option>
            </select>
          </label>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0f14]/95">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Daily Breakdown</h2>
            <p className="mt-1 text-sm text-white/55">
              Daily rollup for the landing pages currently included in this report view.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1360px] text-left text-sm text-white/85">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.08em] text-white/45">
              <tr>
                <th className="px-4 py-3" title={dailyColumnTooltips.date}>Date</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.visitors}>Visitors</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.visits}>Visits</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.clicks}>Clicks</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.signups}>Signups</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.buyers}>Buyers</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.purchases}>Purchases</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.currentMonthly}>Current Monthly</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.subscribers}>Subscribers</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.firstPurchaseRevenue}>1st Purchase Revenue</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.lifetimeRevenue}>Lifetime Revenue</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.signupCvr}>Signup CVR</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.saleCvr}>Sale CVR</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-sm text-white/55">
                    Loading daily breakdown...
                  </td>
                </tr>
              ) : null}
              {!isLoading && dailyBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-sm text-white/55">
                    No daily data matches the current filters.
                  </td>
                </tr>
              ) : null}
              {!isLoading
                ? paginatedDailyBreakdown.map((dayRow) => (
                    <tr key={dayRow.date} className="border-t border-white/5">
                      <td className="px-4 py-3 font-medium text-white">{formatDayLabel(dayRow.date)}</td>
                      <td className="px-4 py-3">{formatNumber(dayRow.uniqueVisitors)}</td>
                      <td className="px-4 py-3">{formatNumber(dayRow.totalVisits)}</td>
                      <td className="px-4 py-3">{formatNumber(dayRow.signupClicks)}</td>
                      <td className="px-4 py-3">{formatNumber(dayRow.signups)}</td>
                      <td className="px-4 py-3">{formatNumber(dayRow.patreonSales)}</td>
                      <td className="px-4 py-3">{formatNumber(dayRow.totalPurchases)}</td>
                      <td className="px-4 py-3">{formatCurrencyCents(dayRow.currentMonthlySubscriptionEarningCents)}</td>
                      <td className="px-4 py-3">{formatNumber(dayRow.currentSubscribers)}</td>
                      <td className="px-4 py-3">{formatCurrencyCents(dayRow.firstPurchaseRevenueCents)}</td>
                      <td className="px-4 py-3">{formatCurrencyCents(dayRow.totalRevenueCents)}</td>
                      <td className="px-4 py-3 text-emerald-300">{formatPercent(dayRow.signupConversionRate)}</td>
                      <td className="px-4 py-3 text-amber-300">{formatPercent(dayRow.patreonSaleRate)}</td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
        <PaginatedSectionFooter
          currentPage={dailyPagination.safePage}
          itemLabel="days"
          onPageChange={setDailyPage}
          totalItems={dailyBreakdown.length}
        />
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0f14]/95">
        <div className="overflow-x-auto">
          <table className="min-w-[1320px] text-left text-sm text-white/85">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.08em] text-white/45">
              <tr>
                {[
                  ['severity', 'Severity'],
                  ['landingPageName', 'Landing Page'],
                  ['issueType', 'Issue'],
                  ['visitors', 'Visitors'],
                  ['clicks', 'Clicks'],
                  ['signups', 'Signups'],
                  ['sales', 'Buyers'],
                  ['signupRate', 'Signup CVR'],
                  ['saleRate', 'Sale CVR'],
                  ['revenue', 'Revenue'],
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
                  <td colSpan={13} className="px-4 py-8 text-center text-sm text-white/55">
                    Loading performance report...
                  </td>
                </tr>
              ) : null}
              {!isLoading && sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-sm text-white/55">
                    No report rows match the current filters.
                  </td>
                </tr>
              ) : null}
              {!isLoading
                ? paginatedRows.map((row) => (
                    <tr key={row.id} className="border-t border-white/5 align-top">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${severityPillClassName[row.severity]}`}
                        >
                          {row.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="font-medium text-white">{row.landingPageName}</div>
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
                      <td className="px-4 py-3">{formatCurrencyCents(row.totalRevenueCents)}</td>
                      <td className="px-4 py-3 text-white/60">{formatDayLabel(row.lastSeenDate)}</td>
                      <td className="px-4 py-3 text-sm text-white/65">{row.detail}</td>
                      <td className="px-4 py-3 text-sm text-white/55">{row.recommendation}</td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
        <PaginatedSectionFooter
          currentPage={issuePagination.safePage}
          itemLabel="issues"
          onPageChange={setIssuePage}
          totalItems={sortedRows.length}
        />
      </section>
    </AdminPageShell>
  )
}

export default LandingPagesPerformanceReportPage
