import { PrismaClient } from '@prisma/client'
import { buildUniqueSlug } from './lib/slug'

const prisma = new PrismaClient()

const run = async () => {
  const adminUser = await prisma.user.upsert({
    where: {
      email: 'admin@secretwaifu.com'
    },
    update: {},
    create: {
      email: 'admin@secretwaifu.com',
      username: 'adminsenpai',
      role: 'ADMIN',
      isEmailVerified: true
    }
  })

  const creatorUser = await prisma.user.upsert({
    where: {
      email: 'creator@secretwaifu.com'
    },
    update: {},
    create: {
      email: 'creator@secretwaifu.com',
      username: 'rekengator2',
      role: 'CREATOR',
      isEmailVerified: true
    }
  })

  const existingCharacterCount = await prisma.character.count()

  if (existingCharacterCount === 0) {
    await prisma.character.createMany({
      data: [
        {
          ownerId: creatorUser.id,
          slug: buildUniqueSlug('Airi Akizuki', 'official'),
          name: 'Airi Akizuki',
          tagline: 'Main launch character',
          description: 'Approved official character available in the public gallery.',
          status: 'APPROVED',
          visibility: 'PUBLIC',
          heartsCount: 2400,
          averageRating: 4.8,
          viewsCount: 8900,
          publishedAt: new Date()
        },
        {
          ownerId: creatorUser.id,
          slug: buildUniqueSlug('Dark Elf Queen', 'review'),
          name: 'Dark Elf Queen',
          tagline: 'Awaiting moderation',
          description: 'Community submission waiting for admin approval.',
          status: 'PENDING',
          visibility: 'UNLISTED',
          heartsCount: 0,
          averageRating: 0,
          viewsCount: 0
        }
      ]
    })
  }

  await prisma.patreonAccount.upsert({
    where: {
      userId: creatorUser.id
    },
    update: {
      tierCents: 1799,
      membershipStatus: 'active',
      lastCheckedAt: new Date()
    },
    create: {
      userId: creatorUser.id,
      patreonUserId: 'patreon_creator_001',
      tierCents: 1799,
      membershipStatus: 'active',
      lastCheckedAt: new Date()
    }
  })

  await prisma.entitlement.upsert({
    where: {
      id: 'seed-entitlement-premium'
    },
    update: {
      status: 'ACTIVE',
      validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
    },
    create: {
      id: 'seed-entitlement-premium',
      userId: creatorUser.id,
      source: 'PATREON',
      tierCode: 'valid_1799',
      status: 'ACTIVE',
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
    }
  })

  console.log(`Seed complete. Admin: ${adminUser.email}, Creator: ${creatorUser.email}`)
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
