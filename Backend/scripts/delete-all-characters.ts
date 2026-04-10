/**
 * Deletes every Character row (cascades to hearts, reviews, cards, chat sessions, etc.).
 * StoryPost.characterId is set to null (onDelete: SetNull).
 * Run: cd Backend && npx tsx scripts/delete-all-characters.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const run = async () => {
  const result = await prisma.character.deleteMany({})
  console.log(`Deleted ${result.count} character(s).`)
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
