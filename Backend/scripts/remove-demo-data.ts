/**
 * One-off cleanup: removes legacy seed demo users, entitlements, and sample characters.
 * Run: cd Backend && npx tsx scripts/remove-demo-data.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const DEMO_USER_EMAILS = ['admin@secretwaifu.com', 'creator@secretwaifu.com'] as const

/** Former seed.ts character slugs (buildUniqueSlug + suffix). */
const SEED_CHARACTER_SLUGS = ['airi-akizuki-official', 'dark-elf-queen-review'] as const

const prisma = new PrismaClient()

const run = async () => {
  const characters = await prisma.character.deleteMany({
    where: {
      OR: [
        { slug: { in: [...SEED_CHARACTER_SLUGS] } },
        { name: 'Airi Akizuki', tagline: 'Main launch character' },
        { name: 'Dark Elf Queen', tagline: 'Awaiting moderation' }
      ]
    }
  })
  console.log(`Removed sample characters: ${characters.count}`)

  const entitlements = await prisma.entitlement.deleteMany({
    where: { id: 'seed-entitlement-premium' }
  })
  console.log(`Removed seed entitlement rows: ${entitlements.count}`)

  const users = await prisma.user.deleteMany({
    where: { email: { in: [...DEMO_USER_EMAILS] } }
  })
  console.log(`Removed demo users (${DEMO_USER_EMAILS.join(', ')}): ${users.count}`)
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
