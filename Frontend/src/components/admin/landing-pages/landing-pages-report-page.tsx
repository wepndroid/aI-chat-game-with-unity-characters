'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import {
  getLandingPagesTrafficReport,
  type LandingPagesTrafficReportResponse
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

const formatDayLabel = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(`${value}T00:00:00Z`))

const formatDateTime = (value: string | null) => {
  if (!value) {
    return 'Not yet'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

type UserRow = LandingPagesTrafficReportResponse['data']['users'][number]
type SourceBreakdownRow = {
  source: string
  landingPageNames: string[]
  uniqueVisitors: number
  totalVisits: number
  uniqueUsers: number
  signupClicks: number
  signups: number
  patreonSales: number
  totalPurchases: number
  firstPurchaseRevenueCents: number
  totalRevenueCents: number
  currentMonthlySubscriptionEarningCents: number
  currentSubscribers: number
  clickThroughRate: number
  signupConversionRate: number
  patreonSaleRate: number
}

const pageSize = 25

const dailyColumnTooltips = {
  date: 'Calendar day for the tracked landing-page activity.',
  views: 'Total landing-page visits recorded on this date, including repeat visits.',
  clicks: 'Signup CTA clicks recorded on this date.',
  signups: 'Users who completed signup from attributed landing-page visits.',
  buyers: 'Attributed users who generated at least one purchase.',
  purchases: 'Total purchase events attributed to these landing-page visits.',
  currentMonthly: 'Current monthly recurring subscription value from active attributed subscribers. Yearly plans are shown as monthly equivalent.',
  subscribers: 'Active attributed subscribers contributing current monthly subscription value.',
  firstPurchaseRevenue: 'Revenue from each buyer first attributed purchase.',
  lifetimeRevenue: 'All tracked revenue attributed to these visits, including repeat purchases.'
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

const LandingPagesReportPage = () => {
  const searchParams = useSearchParams()
  const [report, setReport] = useState<LandingPagesTrafficReportResponse['data'] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [landingPageFilter, setLandingPageFilter] = useState<string>(searchParams.get('landingPageId') ?? 'all')
  const [shortUrlFilter, setShortUrlFilter] = useState<string>(searchParams.get('shortUrlId') ?? 'all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [purchaseFilter, setPurchaseFilter] = useState<'all' | 'buyers' | 'non-buyers'>('all')
  const [dailyPage, setDailyPage] = useState(1)
  const [sourcePage, setSourcePage] = useState(1)
  const [userPage, setUserPage] = useState(1)

  useEffect(() => {
    const run = async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const payload = await getLandingPagesTrafficReport()
        setReport(payload.data)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load traffic report.')
      } finally {
        setIsLoading(false)
      }
    }

    void run()
  }, [])

  const sourceOptions = useMemo(() => {
    if (!report) {
      return []
    }

    return [...new Set(report.sources.map((sourceRow) => sourceRow.source))].sort((left, right) => left.localeCompare(right))
  }, [report])

  const filteredSources = useMemo(() => {
    if (!report) {
      return []
    }

    const normalizedSearchValue = searchValue.trim().toLowerCase()
    const selectedShortUrlKey = shortUrlFilter === 'all'
      ? null
      : report.shortUrls.find((shortUrl) => shortUrl.id === shortUrlFilter)?.key ?? null

    return report.sources.filter((sourceRow) => {
      if (landingPageFilter !== 'all' && sourceRow.landingPageId !== landingPageFilter) {
        return false
      }

      if (selectedShortUrlKey && sourceRow.shortUrlKey !== selectedShortUrlKey) {
        return false
      }

      if (sourceFilter !== 'all' && sourceRow.source !== sourceFilter) {
        return false
      }

      if (!normalizedSearchValue) {
        return true
      }

      return [sourceRow.landingPageName, sourceRow.source, sourceRow.medium, sourceRow.campaign, sourceRow.content, sourceRow.term, sourceRow.shortUrlKey]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearchValue)
    })
  }, [landingPageFilter, report, searchValue, shortUrlFilter, sourceFilter])

  const sourceBreakdownRows = useMemo(() => {
    const sourceMap = new Map<string, SourceBreakdownRow & { landingPageNameSet: Set<string> }>()

    for (const sourceRow of filteredSources) {
      const existingRow = sourceMap.get(sourceRow.source) ?? {
        source: sourceRow.source,
        landingPageNames: [],
        landingPageNameSet: new Set<string>(),
        uniqueVisitors: 0,
        totalVisits: 0,
        uniqueUsers: 0,
        signupClicks: 0,
        signups: 0,
        patreonSales: 0,
        totalPurchases: 0,
        firstPurchaseRevenueCents: 0,
        totalRevenueCents: 0,
        currentMonthlySubscriptionEarningCents: 0,
        currentSubscribers: 0,
        clickThroughRate: 0,
        signupConversionRate: 0,
        patreonSaleRate: 0
      }

      existingRow.landingPageNameSet.add(sourceRow.landingPageName)
      existingRow.uniqueVisitors += sourceRow.uniqueVisitors
      existingRow.totalVisits += sourceRow.totalVisits
      existingRow.uniqueUsers += sourceRow.uniqueUsers
      existingRow.signupClicks += sourceRow.signupClicks
      existingRow.signups += sourceRow.signups
      existingRow.patreonSales += sourceRow.patreonSales
      existingRow.totalPurchases += sourceRow.totalPurchases
      existingRow.firstPurchaseRevenueCents += sourceRow.firstPurchaseRevenueCents
      existingRow.totalRevenueCents += sourceRow.totalRevenueCents
      existingRow.currentMonthlySubscriptionEarningCents += sourceRow.currentMonthlySubscriptionEarningCents
      existingRow.currentSubscribers += sourceRow.currentSubscribers
      sourceMap.set(sourceRow.source, existingRow)
    }

    return [...sourceMap.values()]
      .map((sourceRow) => ({
        ...sourceRow,
        landingPageNames: [...sourceRow.landingPageNameSet].sort((left, right) => left.localeCompare(right)),
        clickThroughRate: sourceRow.uniqueVisitors > 0 ? (sourceRow.signupClicks / sourceRow.uniqueVisitors) * 100 : 0,
        signupConversionRate: sourceRow.uniqueVisitors > 0 ? (sourceRow.signups / sourceRow.uniqueVisitors) * 100 : 0,
        patreonSaleRate: sourceRow.uniqueVisitors > 0 ? (sourceRow.patreonSales / sourceRow.uniqueVisitors) * 100 : 0
      }))
      .sort((left, right) => {
        if (right.totalRevenueCents !== left.totalRevenueCents) {
          return right.totalRevenueCents - left.totalRevenueCents
        }

        if (right.signups !== left.signups) {
          return right.signups - left.signups
        }

        return right.signupClicks - left.signupClicks
      })
  }, [filteredSources])

  const filteredUsers = useMemo(() => {
    if (!report) {
      return []
    }

    const normalizedSearchValue = searchValue.trim().toLowerCase()
    const selectedShortUrlKey = shortUrlFilter === 'all'
      ? null
      : report.shortUrls.find((shortUrl) => shortUrl.id === shortUrlFilter)?.key ?? null

    return report.users.filter((userRow) => {
      if (landingPageFilter !== 'all' && userRow.landingPageId !== landingPageFilter) {
        return false
      }

      if (selectedShortUrlKey && userRow.shortUrlKey !== selectedShortUrlKey) {
        return false
      }

      if (sourceFilter !== 'all' && userRow.source !== sourceFilter) {
        return false
      }

      if (purchaseFilter === 'buyers' && userRow.totalPurchases === 0) {
        return false
      }

      if (purchaseFilter === 'non-buyers' && userRow.totalPurchases > 0) {
        return false
      }

      if (!normalizedSearchValue) {
        return true
      }

      return [
        userRow.username,
        userRow.email,
        userRow.landingPageName,
        userRow.source,
        userRow.medium,
        userRow.campaign,
        userRow.content,
        userRow.term,
        userRow.shortUrlKey
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearchValue)
    })
  }, [landingPageFilter, purchaseFilter, report, searchValue, shortUrlFilter, sourceFilter])

  const sourceSummary = useMemo(
    () => ({
      totalRevenueCents: filteredSources.reduce((sum, sourceRow) => sum + sourceRow.totalRevenueCents, 0),
      currentMonthlySubscriptionEarningCents: filteredSources.reduce(
        (sum, sourceRow) => sum + sourceRow.currentMonthlySubscriptionEarningCents,
        0
      ),
      signups: filteredSources.reduce((sum, sourceRow) => sum + sourceRow.signups, 0),
      purchases: filteredSources.reduce((sum, sourceRow) => sum + sourceRow.totalPurchases, 0)
    }),
    [filteredSources]
  )

  const userSummary = useMemo(
    () => ({
      buyers: filteredUsers.filter((userRow) => userRow.totalPurchases > 0).length,
      nonBuyers: filteredUsers.filter((userRow) => userRow.totalPurchases === 0).length,
      totalRevenueCents: filteredUsers.reduce((sum, userRow) => sum + userRow.totalRevenueCents, 0),
      currentMonthlySubscriptionEarningCents: filteredUsers.reduce(
        (sum, userRow) => sum + userRow.currentMonthlySubscriptionEarningCents,
        0
      ),
      currentSubscribers: filteredUsers.filter((userRow) => userRow.currentMonthlySubscriptionEarningCents > 0).length
    }),
    [filteredUsers]
  )

  const dailyBreakdown = useMemo(() => {
    const dayMap = new Map<
      string,
      {
        date: string
        views: number
        signupClicks: number
        signups: number
        buyers: number
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
        views: 0,
        signupClicks: 0,
        signups: 0,
        buyers: 0,
        totalPurchases: 0,
        firstPurchaseRevenueCents: 0,
        totalRevenueCents: 0,
        currentMonthlySubscriptionEarningCents: 0,
        currentSubscribers: 0
      }

      dayMap.set(date, existingDay)
      return existingDay
    }

    for (const sourceRow of filteredSources) {
      for (const dayStat of sourceRow.dailyStats) {
        const dayEntry = ensureDay(dayStat.date)
        dayEntry.views += dayStat.totalVisits
        dayEntry.signupClicks += dayStat.signupClicks
        dayEntry.signups += dayStat.signups
        dayEntry.buyers += dayStat.patreonSales
        dayEntry.totalPurchases += dayStat.totalPurchases
        dayEntry.firstPurchaseRevenueCents += dayStat.firstPurchaseRevenueCents
        dayEntry.totalRevenueCents += dayStat.totalRevenueCents
        dayEntry.currentMonthlySubscriptionEarningCents += dayStat.currentMonthlySubscriptionEarningCents
        dayEntry.currentSubscribers += dayStat.currentSubscribers
      }
    }

    return [...dayMap.values()].sort((left, right) => right.date.localeCompare(left.date))
  }, [filteredSources])

  useEffect(() => {
    setDailyPage(1)
    setSourcePage(1)
    setUserPage(1)
  }, [landingPageFilter, purchaseFilter, searchValue, shortUrlFilter, sourceFilter])

  const dailyPagination = getPaginationBounds(dailyBreakdown.length, dailyPage)
  const sourcePagination = getPaginationBounds(sourceBreakdownRows.length, sourcePage)
  const userPagination = getPaginationBounds(filteredUsers.length, userPage)
  const paginatedDailyBreakdown = dailyBreakdown.slice(dailyPagination.startIndex, dailyPagination.endIndex)
  const paginatedSourceBreakdownRows = sourceBreakdownRows.slice(sourcePagination.startIndex, sourcePagination.endIndex)
  const paginatedUsers = filteredUsers.slice(userPagination.startIndex, userPagination.endIndex)

  const performanceReportHref = new URLSearchParams()
  if (landingPageFilter !== 'all') {
    performanceReportHref.set('landingPageId', landingPageFilter)
  }
  if (shortUrlFilter !== 'all') {
    performanceReportHref.set('shortUrlId', shortUrlFilter)
  }
  const renderedPerformanceReportHref = performanceReportHref.toString()
    ? `/admin/landing-pages/performance?${performanceReportHref.toString()}`
    : '/admin/landing-pages/performance'

  return (
    <AdminPageShell activeKey="landing-pages">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-tight text-white sm:text-[26px] md:text-[29px] md:leading-none">
            Traffic Report
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-[#95a6c1]">
            Full source performance and per-user revenue follow-up view. This is where you can see signup timing, first purchase value, recurring revenue, and who may still be worth nudging after signup.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={renderedPerformanceReportHref}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-400/15 hover:text-white"
          >
            Open Performance Report
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

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-white/50">Attributed Users</p>
          <p className="mt-2 text-3xl font-semibold text-white">{formatNumber(report?.summary.attributedUsers ?? 0)}</p>
          <p className="mt-1 text-xs text-white/45">{formatNumber(filteredUsers.length)} match your filters</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-white/50">First Purchase Revenue</p>
          <p className="mt-2 text-3xl font-semibold text-white">{formatCurrencyCents(report?.summary.firstPurchaseRevenueCents ?? 0)}</p>
          <p className="mt-1 text-xs text-white/45">{formatNumber(report?.summary.purchasingUsers ?? 0)} buying users</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-white/50">Lifetime Revenue</p>
          <p className="mt-2 text-3xl font-semibold text-white">{formatCurrencyCents(report?.summary.totalRevenueCents ?? 0)}</p>
          <p className="mt-1 text-xs text-white/45">{formatNumber(report?.summary.totalPurchases ?? 0)} tracked purchases</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-white/50">Current Monthly</p>
          <p className="mt-2 text-3xl font-semibold text-white">{formatCurrencyCents(userSummary.currentMonthlySubscriptionEarningCents)}</p>
          <p className="mt-1 text-xs text-white/45">
            {formatNumber(userSummary.currentSubscribers)} active subscribers in filter
          </p>
        </div>
      </div>

      <section className="mt-5 rounded-2xl border border-white/10 bg-[#0c0f14]/95 p-4 sm:p-5">
        <div className="grid gap-3 xl:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]">
          <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-white/55">
            Search
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search by source, user, campaign, short URL..."
              className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2.5 text-sm normal-case tracking-normal text-white placeholder:text-white/30"
            />
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
            Source
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2.5 text-sm normal-case tracking-normal text-white"
            >
              <option value="all">All sources</option>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-white/55">
            Buyer Status
            <select
              value={purchaseFilter}
              onChange={(event) => setPurchaseFilter(event.target.value as 'all' | 'buyers' | 'non-buyers')}
              className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2.5 text-sm normal-case tracking-normal text-white"
            >
              <option value="all">All users</option>
              <option value="buyers">Buyers only</option>
              <option value="non-buyers">Non-buyers only</option>
            </select>
          </label>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-white/10 bg-[#0c0f14]/95">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Daily Breakdown</h2>
            <p className="mt-1 text-sm text-white/55">
              Daily traffic and revenue rollup for the selected landing page view.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] text-left text-sm text-white/85">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.08em] text-white/45">
              <tr>
                <th className="px-4 py-3" title={dailyColumnTooltips.date}>Date</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.views}>Views</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.clicks}>Clicks</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.signups}>Signups</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.buyers}>Buyers</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.purchases}>Purchases</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.currentMonthly}>Current Monthly</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.subscribers}>Subscribers</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.firstPurchaseRevenue}>1st Purchase Revenue</th>
                <th className="px-4 py-3" title={dailyColumnTooltips.lifetimeRevenue}>Lifetime Revenue</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-white/55">
                    Loading daily breakdown...
                  </td>
                </tr>
              ) : null}
              {!isLoading && dailyBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-white/55">
                    No daily data matches the current filters.
                  </td>
                </tr>
              ) : null}
              {!isLoading
                ? paginatedDailyBreakdown.map((dayRow) => (
                    <tr key={dayRow.date} className="border-t border-white/5">
                      <td className="px-4 py-3 font-medium text-white">{formatDayLabel(dayRow.date)}</td>
                      <td className="px-4 py-3">{formatNumber(dayRow.views)}</td>
                      <td className="px-4 py-3">{formatNumber(dayRow.signupClicks)}</td>
                      <td className="px-4 py-3">{formatNumber(dayRow.signups)}</td>
                      <td className="px-4 py-3">{formatNumber(dayRow.buyers)}</td>
                      <td className="px-4 py-3">{formatNumber(dayRow.totalPurchases)}</td>
                      <td className="px-4 py-3">{formatCurrencyCents(dayRow.currentMonthlySubscriptionEarningCents)}</td>
                      <td className="px-4 py-3">{formatNumber(dayRow.currentSubscribers)}</td>
                      <td className="px-4 py-3">{formatCurrencyCents(dayRow.firstPurchaseRevenueCents)}</td>
                      <td className="px-4 py-3">{formatCurrencyCents(dayRow.totalRevenueCents)}</td>
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

      <section className="mt-6 rounded-2xl border border-white/10 bg-[#0c0f14]/95">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Source Breakdown</h2>
            <p className="mt-1 text-sm text-white/55">
              {formatCurrencyCents(sourceSummary.currentMonthlySubscriptionEarningCents)} current monthly, {formatCurrencyCents(sourceSummary.totalRevenueCents)} lifetime revenue, {formatNumber(sourceSummary.signups)} signups.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1280px] text-left text-sm text-white/85">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.08em] text-white/45">
              <tr>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Landing Pages</th>
                <th className="px-4 py-3">Visitors</th>
                <th className="px-4 py-3">Views</th>
                <th className="px-4 py-3">Users</th>
                <th className="px-4 py-3">Clicks</th>
                <th className="px-4 py-3">Signups</th>
                <th className="px-4 py-3">Buyers</th>
                <th className="px-4 py-3">Current Monthly</th>
                <th className="px-4 py-3">Subscribers</th>
                <th className="px-4 py-3">1st Purchase</th>
                <th className="px-4 py-3">Lifetime Revenue</th>
                <th className="px-4 py-3">Signup CVR</th>
                <th className="px-4 py-3">Sale Rate</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-sm text-white/55">
                    Loading traffic report...
                  </td>
                </tr>
              ) : null}
              {!isLoading && sourceBreakdownRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-sm text-white/55">
                    No source rows match the current filters.
                  </td>
                </tr>
              ) : null}
              {!isLoading
                ? paginatedSourceBreakdownRows.map((sourceRow) => (
                    <tr key={sourceRow.source} className="border-t border-white/5">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{sourceRow.source}</div>
                      </td>
                      <td className="px-4 py-3 text-white/70">
                        {sourceRow.landingPageNames.length === 0 ? 'n/a' : sourceRow.landingPageNames.join(', ')}
                      </td>
                      <td className="px-4 py-3">{formatNumber(sourceRow.uniqueVisitors)}</td>
                      <td className="px-4 py-3">{formatNumber(sourceRow.totalVisits)}</td>
                      <td className="px-4 py-3">{formatNumber(sourceRow.uniqueUsers)}</td>
                      <td className="px-4 py-3">{formatNumber(sourceRow.signupClicks)}</td>
                      <td className="px-4 py-3">{formatNumber(sourceRow.signups)}</td>
                      <td className="px-4 py-3">{formatNumber(sourceRow.patreonSales)}</td>
                      <td className="px-4 py-3">{formatCurrencyCents(sourceRow.currentMonthlySubscriptionEarningCents)}</td>
                      <td className="px-4 py-3">{formatNumber(sourceRow.currentSubscribers)}</td>
                      <td className="px-4 py-3">{formatCurrencyCents(sourceRow.firstPurchaseRevenueCents)}</td>
                      <td className="px-4 py-3">{formatCurrencyCents(sourceRow.totalRevenueCents)}</td>
                      <td className="px-4 py-3 text-emerald-300">{formatPercent(sourceRow.signupConversionRate)}</td>
                      <td className="px-4 py-3 text-amber-300">{formatPercent(sourceRow.patreonSaleRate)}</td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
        <PaginatedSectionFooter
          currentPage={sourcePagination.safePage}
          itemLabel="sources"
          onPageChange={setSourcePage}
          totalItems={sourceBreakdownRows.length}
        />
      </section>

      <section className="mt-6 rounded-2xl border border-white/10 bg-[#0c0f14]/95">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Attributed Users</h2>
            <p className="mt-1 text-sm text-white/55">
              See when each user signed up, how much the first purchase was, and how much subscription revenue has accumulated so far.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1580px] text-left text-sm text-white/85">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.08em] text-white/45">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Landing Page</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Short URL</th>
                <th className="px-4 py-3">Signed Up</th>
                <th className="px-4 py-3">1st Purchase</th>
                <th className="px-4 py-3">1st Amount</th>
                <th className="px-4 py-3">Last Purchase</th>
                <th className="px-4 py-3">Purchases</th>
                <th className="px-4 py-3">Current Monthly</th>
                <th className="px-4 py-3">Lifetime Revenue</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Purchase History</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-sm text-white/55">
                    Loading users...
                  </td>
                </tr>
              ) : null}
              {!isLoading && filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-sm text-white/55">
                    No users match the current filters.
                  </td>
                </tr>
              ) : null}
              {!isLoading
                ? paginatedUsers.map((userRow: UserRow) => (
                    <tr key={userRow.userId} className="border-t border-white/5 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{userRow.username}</div>
                        <div className="text-xs text-white/50">{userRow.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{userRow.landingPageName}</div>
                        <div className="font-mono text-[11px] text-white/35">{userRow.basePath || userRow.landingPageKey}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{userRow.source}</div>
                        <div className="text-xs text-white/45">
                          {[userRow.medium, userRow.campaign, userRow.content, userRow.term].filter(Boolean).join(' / ') || 'n/a'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/70">{userRow.shortUrlKey || 'n/a'}</td>
                      <td className="px-4 py-3 text-white/70">{formatDateTime(userRow.signedUpAt)}</td>
                      <td className="px-4 py-3 text-white/70">{formatDateTime(userRow.firstPurchaseAt)}</td>
                      <td className="px-4 py-3">{formatCurrencyCents(userRow.firstPurchaseAmountCents)}</td>
                      <td className="px-4 py-3 text-white/70">{formatDateTime(userRow.lastPurchaseAt)}</td>
                      <td className="px-4 py-3">{formatNumber(userRow.totalPurchases)}</td>
                      <td className="px-4 py-3">{formatCurrencyCents(userRow.currentMonthlySubscriptionEarningCents)}</td>
                      <td className="px-4 py-3">{formatCurrencyCents(userRow.totalRevenueCents)}</td>
                      <td className="px-4 py-3 text-white/70">
                        <div>{userRow.membershipStatus}</div>
                        <div className="text-xs text-white/40">
                          {userRow.currentTierCents > 0 ? formatCurrencyCents(userRow.currentTierCents) : 'No active tier'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {userRow.purchaseHistory.length === 0 ? (
                          <span className="text-white/45">No purchases yet</span>
                        ) : (
                          <div className="space-y-1 text-xs text-white/65">
                            {userRow.purchaseHistory.map((purchase) => (
                              <div key={purchase.id}>
                                {formatDateTime(purchase.chargedAt)} · {purchase.kind.toLowerCase().replace(/_/g, ' ')} ·{' '}
                                {formatCurrencyCents(purchase.amountCents)}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
        <PaginatedSectionFooter
          currentPage={userPagination.safePage}
          itemLabel="users"
          onPageChange={setUserPage}
          totalItems={filteredUsers.length}
        />
      </section>
    </AdminPageShell>
  )
}

export default LandingPagesReportPage
