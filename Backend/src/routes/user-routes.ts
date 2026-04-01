import { UserRole } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { requireAdmin } from '../middleware/auth-middleware'
import { prisma } from '../lib/prisma'
import { hashPassword } from '../lib/password-hash'

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

const updateUserAccountSchema = z
  .object({
    email: z.string().email().optional(),
    username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
    password: z.string().min(8).max(128).optional(),
    tierCents: z.number().int().min(0).max(100000).nullable().optional()
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided.'
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
              id: true,
              tierCents: true
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
          tierCents: user.patreonAccount?.tierCents ?? null,
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
        id: true,
        username: true
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

    const actingAdminProfile = await prisma.user.findUnique({
      where: {
        id: actingAdmin.userId
      },
      select: {
        username: true
      }
    })

    const adminLabel = actingAdminProfile?.username ?? 'admin'

    await prisma.systemActivityLog.create({
      data: {
        message: payload.banned
          ? `User ${existingUser.username} was banned by ${adminLabel}.`
          : `User ${existingUser.username} was unbanned by ${adminLabel}.`,
        tone: payload.banned ? 'red' : 'green'
      }
    })

    response.json({
      data: updatedUser
    })
  } catch (error) {
    next(error)
  }
})

userRoutes.patch('/users/:userId/account', requireAdmin, async (request, response, next) => {
  try {
    const { userId } = userParamsSchema.parse(request.params)
    const payload = updateUserAccountSchema.parse(request.body)

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

    const nextEmail = payload.email?.trim().toLowerCase()
    const nextUsername = payload.username?.trim()
    const nextPasswordHash = payload.password ? await hashPassword(payload.password) : undefined

    if (nextEmail) {
      const conflictUser = await prisma.user.findUnique({
        where: {
          email: nextEmail
        },
        select: {
          id: true
        }
      })

      if (conflictUser && conflictUser.id !== userId) {
        response.status(409).json({
          message: 'An account with this e-mail already exists.'
        })
        return
      }
    }

    if (nextUsername) {
      const conflictUser = await prisma.user.findUnique({
        where: {
          username: nextUsername
        },
        select: {
          id: true
        }
      })

      if (conflictUser && conflictUser.id !== userId) {
        response.status(409).json({
          message: 'This username is already taken.'
        })
        return
      }
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: {
          id: userId
        },
        data: {
          ...(nextEmail ? { email: nextEmail } : {}),
          ...(nextUsername ? { username: nextUsername } : {}),
          ...(nextPasswordHash ? { passwordHash: nextPasswordHash } : {})
        },
        select: {
          id: true,
          email: true,
          username: true
        }
      })

      if (payload.tierCents !== undefined) {
        if (payload.tierCents === null) {
          await tx.patreonAccount.deleteMany({
            where: {
              userId
            }
          })
        } else {
          await tx.patreonAccount.upsert({
            where: {
              userId
            },
            create: {
              userId,
              patreonUserId: `admin-override-${userId}`,
              membershipStatus: payload.tierCents > 0 ? 'active_patron' : 'former_patron',
              tierCents: payload.tierCents,
              nextChargeDate: null,
              lastCheckedAt: new Date()
            },
            update: {
              membershipStatus: payload.tierCents > 0 ? 'active_patron' : 'former_patron',
              tierCents: payload.tierCents,
              nextChargeDate: null,
              lastCheckedAt: new Date()
            }
          })
        }
      }

      const patreonAccount = await tx.patreonAccount.findUnique({
        where: {
          userId
        },
        select: {
          tierCents: true
        }
      })

      return {
        ...user,
        tierCents: patreonAccount?.tierCents ?? null
      }
    })

    response.json({
      data: updatedUser
    })
  } catch (error) {
    next(error)
  }
})

export default userRoutes
