import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { prisma } from '../src/lib/prisma'
import { reconcilePatreonEntitlements } from '../src/services/membership/patreon-entitlement-reconciliation-service'
import type { PatreonEntitlementReconciliationResult } from '../src/services/membership/patreon-entitlement-reconciliation-service'

const PRODUCTION_CONFIRMATION = 'repair-patreon-entitlements'

type ParsedArgs = {
  apply: boolean
  confirm: string | null
  jsonPath: string | null
}

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

const writeJsonReport = async (jsonPath: string, result: PatreonEntitlementReconciliationResult) => {
  const absolutePath = resolve(jsonPath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(
    absolutePath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), result }, null, 2)}\n`,
    'utf8'
  )
  console.log(`Wrote JSON report: ${absolutePath}`)
}

const main = async () => {
  const args = parseArgs()

  if (args.apply && process.env.NODE_ENV === 'production' && args.confirm !== PRODUCTION_CONFIRMATION) {
    throw new Error(`Production repair requires --confirm=${PRODUCTION_CONFIRMATION}`)
  }

  const result = await reconcilePatreonEntitlements({
    apply: args.apply
  })

  console.log(`Patreon entitlement audit inspected ${result.inspectedEntitlements} expired active Patreon entitlement row(s).`)
  console.log(`${result.repairableEntitlements} row(s) are marked repairable by conservative checks.`)

  for (const entry of result.entries) {
    console.log(
      [
        `entitlement=${entry.entitlementId}`,
        `user=${entry.userId}`,
        `email=${entry.email}`,
        `tier=${entry.tierCode}`,
        `currentValidUntil=${entry.currentValidUntil}`,
        `proposedValidUntil=${entry.proposedValidUntil ?? 'null'}`,
        `reason=${entry.reason}`,
        `repairable=${entry.repairable}`
      ].join(' | ')
    )
  }

  if (args.jsonPath) {
    await writeJsonReport(args.jsonPath, result)
  }

  if (!args.apply) {
    console.log(`Dry run only. Re-run with --apply --confirm=${PRODUCTION_CONFIRMATION} to repair entitlement rows.`)
    return
  }

  console.log(`Updated ${result.updatedEntitlements} Patreon entitlement row(s).`)
}

main()
  .catch((error) => {
    console.error('Patreon entitlement repair failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
