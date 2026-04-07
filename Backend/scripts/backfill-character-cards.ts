/**
 * One-time backfill: create CharacterCard rows from existing Character persona fields (PDF alignment).
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const main = async () => {
  const characters = await prisma.character.findMany({
    select: {
      id: true,
      ownerId: true,
      fullName: true,
      description: true,
      personality: true,
      scenario: true,
      firstMessage: true,
      exampleDialogs: true,
      visibility: true,
      updatedAt: true
    }
  })

  let created = 0

  for (const c of characters) {
    const existing = await prisma.characterCard.findUnique({
      where: { characterId: c.id },
      select: { id: true }
    })

    if (existing) {
      continue
    }

    await prisma.characterCard.create({
      data: {
        characterId: c.id,
        creatorUserId: c.ownerId,
        fullName: c.fullName,
        description: c.description,
        personality: c.personality,
        scenario: c.scenario,
        firstMessage: c.firstMessage,
        exampleDialogs: c.exampleDialogs,
        isPublic: c.visibility === 'PUBLIC',
        updatedAt: c.updatedAt
      }
    })
    created += 1
  }

  console.log(`CharacterCard backfill: ${created} created, ${characters.length - created} already existed.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
