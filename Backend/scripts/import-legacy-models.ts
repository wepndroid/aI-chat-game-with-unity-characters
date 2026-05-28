import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import {
  DEFAULT_OWNER_EMAIL,
  DEFAULT_SOURCE_BASE_URL,
  normalizeLegacyImportOptions,
  runLegacyImport,
  type LegacyImportOptions
} from '../src/lib/legacy-character-import'

type ParsedArgs = {
  command: 'run' | 'help'
  options: LegacyImportOptions
}

const prisma = new PrismaClient()

const parseNumberOption = (label: string, value: string) => {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label} value "${value}". Expected a positive integer.`)
  }

  return parsed
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const options: LegacyImportOptions = {
    ownerEmail: DEFAULT_OWNER_EMAIL,
    sourceBaseUrl: DEFAULT_SOURCE_BASE_URL,
    publicAssetBaseUrl:
      process.env.PUBLIC_ASSET_BASE_URL?.trim() || process.env.BACKEND_PUBLIC_URL?.trim() || 'http://127.0.0.1:4000',
    dryRun: false,
    skipDownloads: false,
    limit: null
  }

  for (const rawArg of argv) {
    const arg = rawArg.trim()

    if (!arg) {
      continue
    }

    if (arg === '--help' || arg === '-h') {
      return {
        command: 'help',
        options
      }
    }

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--skip-downloads') {
      options.skipDownloads = true
      continue
    }

    if (arg.startsWith('--owner-email=')) {
      options.ownerEmail = arg.slice('--owner-email='.length).trim()
      continue
    }

    if (arg.startsWith('--source-base-url=')) {
      options.sourceBaseUrl = arg.slice('--source-base-url='.length).trim()
      continue
    }

    if (arg.startsWith('--public-asset-base-url=')) {
      options.publicAssetBaseUrl = arg.slice('--public-asset-base-url='.length).trim()
      continue
    }

    if (arg.startsWith('--limit=')) {
      options.limit = parseNumberOption('limit', arg.slice('--limit='.length))
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return {
    command: 'run',
    options
  }
}

const printHelp = () => {
  console.log(`Import legacy VRMs and persona info from the previous website.

Usage:
  npm run import:legacy-models -- --owner-email=you@example.com

Options:
  --owner-email=<email>           User that will own the imported characters.
  --source-base-url=<url>         Legacy site base URL. Default: ${DEFAULT_SOURCE_BASE_URL}
  --public-asset-base-url=<url>   Base URL used for imported local /uploads URLs.
  --dry-run                       Fetch and plan the import without writing files or DB rows.
  --skip-downloads                Keep legacy remote VRM URLs instead of downloading files locally.
  --limit=<n>                     Import only the first n models.
  --help                          Show this help message.
`)
}

const main = async () => {
  const parsed = parseArgs(process.argv.slice(2))

  if (parsed.command === 'help') {
    printHelp()
    return
  }

  const options = normalizeLegacyImportOptions(parsed.options)
  const result = await runLegacyImport(prisma, options)

  console.log(
    `Importing ${result.stats.scanned} legacy models for ${result.owner.email} (${result.owner.username}, role=${result.owner.role}).`
  )

  if (result.options.dryRun) {
    console.log('Dry run enabled: no files or database rows were written.')
  }

  if (result.options.skipDownloads) {
    console.log('Skip downloads enabled: imported characters keep pointing at legacy VRM URLs.')
  }

  for (const item of result.items) {
    const prefix = result.options.dryRun ? '[dry-run]' : item.action.toUpperCase()
    console.log(
      `${prefix}: ${item.name} | tier=${item.legacyTier} | heywaifu=${item.legacyHeyWaifu} | persona=${item.personaStatus} | vrm=${item.vroidFileUrl}`
    )
  }

  console.log('')
  console.log('Legacy import summary')
  console.log(`- scanned: ${result.stats.scanned}`)
  console.log(`- created: ${result.stats.created}`)
  console.log(`- updated: ${result.stats.updated}`)
  console.log(`- skipped: ${result.stats.skipped}`)
  console.log(`- vrm files downloaded: ${result.stats.downloaded}`)
  console.log(`- persona records fetched: ${result.stats.personaFetched}`)
  console.log(`- persona records missing: ${result.stats.personaMissing}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
