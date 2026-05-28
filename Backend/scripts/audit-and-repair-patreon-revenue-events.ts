import 'dotenv/config'
import { PrismaClient, RevenueEventKind } from '@prisma/client'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { getTierRank, normalizeMembershipTierCode } from '../src/lib/patreon-tier'
import { resolvePatreonRevenueEventKind } from '../src/lib/patreon-revenue-event-kind'

const prisma = new PrismaClient()

type RevenueEventRow = {
  id: string
  userId: string
  providerEventKey: string
  kind: RevenueEventKind
  tierCode: string
  amountCents: number
  billingPeriodMonths: number
  chargedAt: Date
  createdAt: Date
}

type RepairReportEntry = {
  eventId: string
  providerEventKey: string
  userId: string
  oldKind: RevenueEventKind
  proposedKind: RevenueEventKind
  tierCode: string
  amountCents: number
  billingPeriodMonths: number
  chargedAt: string
  reason: string
  linkedQuotaPeriodSourceKeys: string[]
  repairable: boolean
}

type ParsedArgs = {
  apply: boolean
  confirm: string | null
  jsonPath: string | null
}

const PRODUCTION_CONFIRMATION = 'repair-patreon-revenue-events'

const parseArgs = (): ParsedArgs => {
  const args = process.argv.slice(2)
  const confirmArg = args.find((arg) => arg.startsWith('--confirm='))
  const jsonArg = args.find((arg) => arg.startsWith('--json='))

  return {
    apply: args.includes('--apply'),
    confirm: confirmArg ? confirmArg.slice('--confirm='.length) : null,
    jsonPath: jsonArg ? jsonArg.slice('--json='.length) : null
  }
}

const toIso = (date: Date) => date.toISOString()

const resolveReason = (event: RevenueEventRow, previousEvent: RevenueEventRow | null) => {
  const currentTierCode = normalizeMembershipTierCode(event.tierCode)
  const previousTierCode = normalizeMembershipTierCode(previousEvent?.tierCode)

  if (!previousEvent) {
    if (event.kind === RevenueEventKind.UPGRADE && currentTierCode && event.billingPeriodMonths > 1) {
      return {
        previous: {
          wasActive: true,
          tierCode: event.tierCode,
          amountCents: event.amountCents,
          billingPeriodMonths: event.billingPeriodMonths
        },
        reason: 'annual_upgrade_without_earlier_revenue_event_treated_as_imported_renewal',
        repairable: true
      }
    }

    return {
      previous: null,
      reason: 'first_recorded_revenue_event',
      repairable: false
    }
  }

  if (currentTierCode && previousTierCode) {
    const currentRank = getTierRank(currentTierCode)
    const previousRank = getTierRank(previousTierCode)

    return {
      previous: {
        wasActive: true,
        tierCode: previousEvent.tierCode,
        amountCents: previousEvent.amountCents,
        billingPeriodMonths: previousEvent.billingPeriodMonths
      },
      reason:
        currentRank === previousRank
          ? 'same_canonical_tier_rank'
          : currentRank > previousRank
            ? 'higher_canonical_tier_rank'
            : 'lower_canonical_tier_rank',
      repairable: true
    }
  }

  return {
    previous: {
      wasActive: true,
      tierCode: previousEvent.tierCode,
      amountCents: previousEvent.amountCents,
      billingPeriodMonths: previousEvent.billingPeriodMonths
    },
    reason: 'unknown_tier_identity_monthly_equivalent_fallback',
    repairable: true
  }
}

const buildQuotaSourceKeys = (providerEventKey: string) => [
  `quota:${providerEventKey}:patreon_initial_purchase`,
  `quota:${providerEventKey}:patreon_reactivation`,
  `quota:${providerEventKey}:patreon_renewal`,
  `quota:${providerEventKey}:patreon_upgrade`
]

const findLinkedQuotaPeriodSourceKeys = async (providerEventKey: string) => {
  const possibleSourceKeys = buildQuotaSourceKeys(providerEventKey)
  const rows = await prisma.chatQuotaPeriod.findMany({
    where: {
      sourceEventKey: {
        in: possibleSourceKeys
      }
    },
    select: {
      sourceEventKey: true
    }
  })

  return rows.map((row) => row.sourceEventKey).filter((sourceEventKey): sourceEventKey is string => Boolean(sourceEventKey))
}

const buildReport = async () => {
  const revenueEvents = await prisma.revenueEvent.findMany({
    where: {
      provider: 'PATREON'
    },
    orderBy: [
      {
        userId: 'asc'
      },
      {
        chargedAt: 'asc'
      },
      {
        createdAt: 'asc'
      }
    ],
    select: {
      id: true,
      userId: true,
      providerEventKey: true,
      kind: true,
      tierCode: true,
      amountCents: true,
      billingPeriodMonths: true,
      chargedAt: true,
      createdAt: true
    }
  })

  const previousEventByUserId = new Map<string, RevenueEventRow>()
  const report: RepairReportEntry[] = []

  for (const event of revenueEvents) {
    const previousEvent = previousEventByUserId.get(event.userId) ?? null
    const reason = resolveReason(event, previousEvent)
    const proposedKind = resolvePatreonRevenueEventKind({
      currentTierCode: event.tierCode,
      currentAmountCents: event.amountCents,
      currentBillingPeriodMonths: event.billingPeriodMonths,
      previous: reason.previous
    })

    if (proposedKind !== event.kind) {
      report.push({
        eventId: event.id,
        providerEventKey: event.providerEventKey,
        userId: event.userId,
        oldKind: event.kind,
        proposedKind,
        tierCode: event.tierCode,
        amountCents: event.amountCents,
        billingPeriodMonths: event.billingPeriodMonths,
        chargedAt: toIso(event.chargedAt),
        reason: reason.reason,
        linkedQuotaPeriodSourceKeys: await findLinkedQuotaPeriodSourceKeys(event.providerEventKey),
        repairable: reason.repairable
      })
    }

    previousEventByUserId.set(event.userId, event)
  }

  return report
}

const writeJsonReport = async (jsonPath: string, report: RepairReportEntry[]) => {
  const absolutePath = resolve(jsonPath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, `${JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2)}\n`, 'utf8')
  console.log(`Wrote JSON report: ${absolutePath}`)
}

const applyRepair = async (report: RepairReportEntry[]) => {
  const repairableRows = report.filter((entry) => entry.repairable)

  for (const entry of repairableRows) {
    await prisma.revenueEvent.update({
      where: {
        id: entry.eventId
      },
      data: {
        kind: entry.proposedKind
      }
    })
  }

  return repairableRows.length
}

const main = async () => {
  const args = parseArgs()
  const report = await buildReport()
  const repairableCount = report.filter((entry) => entry.repairable).length

  console.log(`Patreon revenue event audit found ${report.length} proposed kind changes.`)
  console.log(`${repairableCount} row(s) are marked repairable by conservative checks.`)

  for (const entry of report) {
    console.log(
      [
        `${entry.oldKind} -> ${entry.proposedKind}`,
        `event=${entry.eventId}`,
        `user=${entry.userId}`,
        `tier=${entry.tierCode}`,
        `amount=${entry.amountCents}`,
        `period=${entry.billingPeriodMonths}`,
        `chargedAt=${entry.chargedAt}`,
        `reason=${entry.reason}`,
        `quotaSourceKeys=${entry.linkedQuotaPeriodSourceKeys.length ? entry.linkedQuotaPeriodSourceKeys.join(',') : 'none'}`,
        `repairable=${entry.repairable}`
      ].join(' | ')
    )
  }

  if (args.jsonPath) {
    await writeJsonReport(args.jsonPath, report)
  }

  if (!args.apply) {
    console.log('Dry run only. Re-run with --apply to update repairable RevenueEvent.kind rows.')
    return
  }

  if (process.env.NODE_ENV === 'production' && args.confirm !== PRODUCTION_CONFIRMATION) {
    throw new Error(`Production repair requires --confirm=${PRODUCTION_CONFIRMATION}`)
  }

  const updatedCount = await applyRepair(report)
  console.log(`Updated ${updatedCount} RevenueEvent row(s). Quota periods were not changed.`)
}

main()
  .catch((error) => {
    console.error('Patreon revenue event repair failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
