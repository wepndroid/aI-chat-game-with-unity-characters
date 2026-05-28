import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { runLegacyTaglineBackfill } from '../src/lib/legacy-character-import'

const prisma = new PrismaClient()

const forceUpdate = process.argv.includes('--force')

const run = async () => {
  const result = await runLegacyTaglineBackfill(prisma, { forceUpdate })

  for (const item of result.items) {
    if (item.status === 'updated') {
      console.log(`UPDATED: ${item.name} -> ${item.resolvedTagline}`)
    }
  }

  console.log('')
  console.log('Legacy tagline backfill summary')
  console.log(`- updated: ${result.updated}`)
  console.log(`- skipped: ${result.skipped}`)
  console.log(`- unresolved: ${result.unresolved}`)
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
