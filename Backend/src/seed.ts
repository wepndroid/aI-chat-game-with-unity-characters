import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/** Only this account may have ADMIN in the database (enforced on each seed run). */
const SOLE_ADMIN_EMAIL = 'ghostlady0613@gmail.com'

const run = async () => {
  await prisma.user.updateMany({
    where: {
      role: 'ADMIN',
      NOT: {
        email: SOLE_ADMIN_EMAIL
      }
    },
    data: {
      role: 'USER'
    }
  })

  const soleAdmin = await prisma.user.findUnique({
    where: {
      email: SOLE_ADMIN_EMAIL
    },
    select: {
      id: true,
      email: true
    }
  })

  if (soleAdmin) {
    await prisma.user.update({
      where: {
        id: soleAdmin.id
      },
      data: {
        role: 'ADMIN',
        isEmailVerified: true
      }
    })
  } else {
    console.warn(
      `Seed: no user with email ${SOLE_ADMIN_EMAIL}. Sign up that address first, then re-run seed to grant ADMIN.`
    )
  }

  console.log(
    `Seed complete. Sole admin: ${SOLE_ADMIN_EMAIL}${soleAdmin ? ' (updated)' : ' (missing — see warning)'}. No demo users or sample content are created.`
  )
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
