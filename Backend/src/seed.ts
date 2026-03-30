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
          ownerId: adminUser.id,
          slug: buildUniqueSlug('Airi Akizuki', 'official'),
          name: 'Airi Akizuki',
          fullName: 'Airi Akizuki',
          tagline: 'Main launch character',
          description: 'Approved official character available in the public gallery.',
          personality: 'Confident, witty, and slightly teasing while still empathetic.',
          scenario: 'First encounter in the Rift after saving a rookie champion from danger.',
          firstMessage:
            'You really have no idea what you are doing, do you? Come on, get up. I will show you how this place works.',
          exampleDialogs: '',
          status: 'APPROVED',
          visibility: 'PUBLIC',
          legacyTier: 0,
          legacyHeyWaifu: 0,
          heartsCount: 2400,
          officialListing: true,
          viewsCount: 8900,
          publishedAt: new Date()
        },
        {
          ownerId: creatorUser.id,
          slug: buildUniqueSlug('Dark Elf Queen', 'review'),
          name: 'Dark Elf Queen',
          fullName: 'Dark Elf Queen',
          tagline: 'Awaiting moderation',
          description: 'Community submission waiting for admin approval.',
          personality: '',
          scenario: '',
          firstMessage: '',
          exampleDialogs: '',
          status: 'PENDING',
          visibility: 'UNLISTED',
          legacyTier: 1,
          legacyHeyWaifu: 0,
          heartsCount: 0,
          officialListing: false,
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
      tierCents: 1650,
      membershipStatus: 'active_patron',
      lastCheckedAt: new Date()
    },
    create: {
      userId: creatorUser.id,
      patreonUserId: 'patreon_creator_001',
      tierCents: 1650,
      membershipStatus: 'active_patron',
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
      tierCode: 'secretwaifu_access',
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
