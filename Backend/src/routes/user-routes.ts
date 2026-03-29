import { UserRole } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { requireAdmin } from '../middleware/auth-middleware'
import { prisma } from '../lib/prisma'
import { revokeAllSessionsForUser } from '../services/auth-service'

const userRoutes = Router()

const listUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: z.nativeEnum(UserRole).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
})

const userParamsSchema = z.object({
  userId: z.string().min(1)
})

const updateUserRoleSchema = z.object({
  role: z.nativeEnum(UserRole)
})

const updateUserBannedSchema = z.object({
  banned: z.boolean()
})

userRoutes.get('/users', requireAdmin, async (request, response, next) => {
  try {
    const query = listUsersQuerySchema.parse(request.query)
    const normalizedSearch = query.search?.trim()
    const skip = (query.page - 1) * query.limit

    const whereClause = {
      ...(query.role ? { role: query.role } : {}),
      ...(normalizedSearch
        ? {
          OR: [
            {
              username: {
                contains: normalizedSearch
              }
            },
            {
              email: {
                contains: normalizedSearch
              }
            }
          ]
        }
        : {})
    }

    const [totalUsers, userList] = await prisma.$transaction([
      prisma.user.count({
        where: whereClause
      }),
      prisma.user.findMany({
        where: whereClause,
        skip,
        take: query.limit,
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isEmailVerified: true,
          isBanned: true,
          createdAt: true,
          updatedAt: true,
          patreonAccount: {
            select: {
              id: true
            }
          },
          sessions: {
            where: {
              revokedAt: null
            },
            orderBy: {
              lastSeenAt: 'desc'
            },
            take: 1,
            select: {
              lastSeenAt: true
            }
          },
          _count: {
            select: {
              characters: true
            }
          }
        }
      })
    ])

    const totalPages = Math.max(1, Math.ceil(totalUsers / query.limit))

    response.json({
      data: {
        records: userList.map((user) => ({
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          isBanned: user.isBanned,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          uploadsCount: user._count.characters,
          patreonLinked: Boolean(user.patreonAccount?.id),
          lastSeenAt: user.sessions[0]?.lastSeenAt ?? null
        })),
        pagination: {
          page: query.page,
          limit: query.limit,
          total: totalUsers,
          totalPages
        }
      }
    })
  } catch (error) {
    next(error)
  }
})

userRoutes.patch('/users/:userId/role', requireAdmin, async (request, response, next) => {
  try {
    const { userId } = userParamsSchema.parse(request.params)
    const payload = updateUserRoleSchema.parse(request.body)
    const actingAdmin = request.authUser

    if (!actingAdmin) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    if (actingAdmin.userId === userId && payload.role !== 'ADMIN') {
      response.status(400).json({
        message: 'You cannot remove your own admin role.'
      })
      return
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        id: true
      }
    })

    if (!existingUser) {
      response.status(404).json({
        message: 'User not found.'
      })
      return
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: userId
      },
      data: {
        role: payload.role
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        updatedAt: true
      }
    })

    response.json({
      data: updatedUser
    })
  } catch (error) {
    next(error)
  }
})

userRoutes.patch('/users/:userId/banned', requireAdmin, async (request, response, next) => {
  try {
    const { userId } = userParamsSchema.parse(request.params)
    const payload = updateUserBannedSchema.parse(request.body)
    const actingAdmin = request.authUser

    if (!actingAdmin) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    if (actingAdmin.userId === userId && payload.banned) {
      response.status(400).json({
        message: 'You cannot ban your own account.'
      })
      return
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        id: true
      }
    })

    if (!existingUser) {
      response.status(404).json({
        message: 'User not found.'
      })
      return
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: userId
      },
      data: {
        isBanned: payload.banned
      },
      select: {
        id: true,
        isBanned: true
      }
    })

    if (payload.banned) {
      await revokeAllSessionsForUser(userId, new Date())
    }

    response.json({
      data: updatedUser
    })
  } catch (error) {
    next(error)
  }
})

export default userRoutes
