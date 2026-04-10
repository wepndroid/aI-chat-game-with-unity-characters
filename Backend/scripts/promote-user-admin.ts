/**
 * One-off: set role ADMIN for a user by email.
 * Usage: cd Backend && npx tsx scripts/promote-user-admin.ts ghostlady0613@gmail.com
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const email = process.argv[2]?.trim().toLowerCase()

const prisma = new PrismaClient()

const run = async () => {
  if (!email) {
    console.error('Usage: npx tsx scripts/promote-user-admin.ts <email>')
    process.exitCode = 1
    return
  }

  const result = await prisma.user.updateMany({
    where: { email },
    data: { role: 'ADMIN' }
  })

  if (result.count === 0) {
    console.error(`No user found with email: ${email}`)
    process.exitCode = 1
    return
  }

  console.log(`Updated ${result.count} user(s) to ADMIN: ${email}`)
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
