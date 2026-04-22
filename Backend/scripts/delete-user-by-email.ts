/**
 * Delete a user and cascaded rows. Clears LandingPageVisit.signedUpUserId (not a Prisma FK).
 * Usage: cd Backend && npx tsx scripts/delete-user-by-email.ts <email>
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const email = process.argv[2]?.trim().toLowerCase()

const prisma = new PrismaClient()

const run = async () => {
  if (!email) {
    console.error('Usage: npx tsx scripts/delete-user-by-email.ts <email>')
    process.exitCode = 1
    return
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, username: true }
  })

  if (!user) {
    console.error(`No user found with email: ${email}`)
    process.exitCode = 1
    return
  }

  await prisma.$transaction(async (tx) => {
    await tx.landingPageVisit.updateMany({
      where: { signedUpUserId: user.id },
      data: { signedUpUserId: null }
    })

    await tx.user.delete({ where: { id: user.id } })
  })

  console.log(`Deleted user id=${user.id} email=${user.email} username=${user.username}`)
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
