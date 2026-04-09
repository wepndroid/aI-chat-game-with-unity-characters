/** Wipe all StoryPost / StoryPostLike rows. Run: `npx tsx scripts/clear-story-posts.ts` */
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

async function main() {
  const likes = await prisma.storyPostLike.deleteMany({})
  const posts = await prisma.storyPost.deleteMany({})
  console.log(`Removed ${likes.count} story like(s) and ${posts.count} story post(s).`)
}

void main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
