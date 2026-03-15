import { Router } from 'express'
import { prisma } from '../lib/prisma'

const statsRoutes = Router()

statsRoutes.get('/stats/overview', async (_request, response, next) => {
  try {
    const [
      totalUsers,
      totalCharacters,
      approvedCharacters,
      pendingCharacters,
      totalReviews,
      totalHeartsResult,
      patreonLinkedUsers
    ] = await prisma.$transaction([
      prisma.user.count(),
      prisma.character.count(),
      prisma.character.count({
        where: {
          status: 'APPROVED',
          visibility: 'PUBLIC'
        }
      }),
      prisma.character.count({
        where: {
          status: 'PENDING'
        }
      }),
      prisma.review.count(),
      prisma.character.aggregate({
        _sum: {
          heartsCount: true
        }
      }),
      prisma.patreonAccount.count()
    ])

    response.json({
      data: {
        totalUsers,
        totalCharacters,
        approvedCharacters,
        pendingCharacters,
        totalReviews,
        totalHearts: totalHeartsResult._sum.heartsCount ?? 0,
        patreonLinkedUsers,
        updatedAt: new Date().toISOString()
      }
    })
  } catch (error) {
    next(error)
  }
})

export default statsRoutes
