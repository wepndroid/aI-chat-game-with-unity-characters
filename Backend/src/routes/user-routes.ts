import { Prisma, UserRole } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { requireAdmin, requireAuth } from '../middleware/auth-middleware'
import { appendPatreonSyncLog, listPatreonSyncLogsForUser } from '../lib/patreon-sync-log'
import { syncPatreonMembership } from '../lib/patreon-sync'
import { prisma } from '../lib/prisma'
import { hashPassword } from '../lib/password-hash'
import { calculateMonthlyEquivalentCents, resolveBillingPeriodMonths } from '../lib/subscription-billing'
import { normalizeMembershipTierCode } from '../lib/membership-tier-policy'
import {
  buildAdminUserQuotaSummaries,
  type AdminUserQuotaSummary
} from '../services/admin/admin-user-quota-summary-service'

const userRoutes = Router()

const listUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: z.nativeEnum(UserRole).optional(),
  sortBy: z
    .enum(['joined', 'username', 'email', 'role', 'status', 'uploads'])
    .default('joined'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
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
    playerName: z.string().trim().min(1).max(40).optional().nullable(),
    password: z.string().min(8).max(128).optional(),
    tierCode: z.enum(['free', 'basic', 'premium']).nullable().optional()
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided.'
  })

const updateMyProfileSchema = z.object({
  player_name: z.string().trim().min(1).max(40)
})

const userListSelect = {
  id: true,
  email: true,
  username: true,
  avatarUrl: true,
  role: true,
  tierCode: true,
  isEmailVerified: true,
  isBanned: true,
  createdAt: true,
  updatedAt: true,
  patreonAccount: {
    select: {
      id: true,
      tierCents: true,
      pledgeCadenceMonths: true,
      membershipStatus: true,
      lastChargeDate: true,
      nextChargeDate: true,
      lastCheckedAt: true
    }
  },
  activityState: {
    select: {
      lastSeenAt: true
    }
  },
  _count: {
    select: {
      characters: true
    }
  }
} satisfies Prisma.UserSelect

type UserListRow = Prisma.UserGetPayload<{ select: typeof userListSelect }>
type UserSortBy = z.infer<typeof listUsersQuerySchema>['sortBy']
type UserSortDirection = z.infer<typeof listUsersQuerySchema>['sortDirection']

const resolveUserOrderBy = (sortBy: UserSortBy, sortDirection: UserSortDirection): Prisma.UserOrderByWithRelationInput[] => {
  switch (sortBy) {
    case 'username':
      return [{ username: sortDirection }, { createdAt: 'desc' }]
    case 'email':
      return [{ email: sortDirection }, { createdAt: 'desc' }]
    case 'role':
      return [{ role: sortDirection }, { createdAt: 'desc' }]
    case 'status':
      return sortDirection === 'asc'
        ? [{ isBanned: 'asc' }, { isEmailVerified: 'desc' }, { createdAt: 'desc' }]
        : [{ isBanned: 'desc' }, { isEmailVerified: 'asc' }, { createdAt: 'desc' }]
    case 'uploads':
      return [{ characters: { _count: sortDirection } }, { createdAt: 'desc' }]
    case 'joined':
    default:
      return [{ createdAt: sortDirection }, { id: 'asc' }]
  }
}

const resolveMonthlyTierCents = (user: UserListRow) =>
  user.patreonAccount
    ? calculateMonthlyEquivalentCents(
        user.patreonAccount.tierCents ?? 0,
        resolveBillingPeriodMonths({
          pledgeCadenceMonths: user.patreonAccount.pledgeCadenceMonths,
          lastChargeDate: user.patreonAccount.lastChargeDate,
          nextChargeDate: user.patreonAccount.nextChargeDate
        })
      )
    : null

const serializeUserQuota = (quota: AdminUserQuotaSummary) => ({
  tierCode: quota.tierCode,
  periodEndsAt: quota.periodEndsAt,
  message: {
    limit: quota.message.limit,
    used: quota.message.used,
    reserved: quota.message.reserved,
    remaining: quota.message.remaining,
    unlimited: quota.message.unlimited
  },
  voice: {
    enabled: quota.voice.enabled,
    limit: quota.voice.limit,
    used: quota.voice.used,
    reserved: quota.voice.reserved,
    remaining: quota.voice.remaining,
    unlimited: quota.voice.unlimited
  }
})

const serializeAdminUserRecord = (user: UserListRow, quota: AdminUserQuotaSummary) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  avatarUrl: user.avatarUrl,
  role: user.role,
  isEmailVerified: user.isEmailVerified,
  isBanned: user.isBanned,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  uploadsCount: user._count.characters,
  patreonLinked: Boolean(user.patreonAccount?.id),
  patreonMembershipStatus: user.patreonAccount?.membershipStatus ?? null,
  patreonLastCheckedAt: user.patreonAccount?.lastCheckedAt ?? null,
  tierCents: resolveMonthlyTierCents(user),
  tierCode: quota.tierCode,
  manualTierCode: user.tierCode,
  lastSeenAt: user.activityState?.lastSeenAt ?? null,
  quota: serializeUserQuota(quota)
})

const attachQuotaSummaries = async (userList: UserListRow[]) => {
  // Admin list quota display is a read-only view: it must not materialize
  // quota periods or usage rows while an admin browses users.
  const quotaSummaries = await buildAdminUserQuotaSummaries(userList.map((user) => user.id))
  const quotaByUserId = new Map(quotaSummaries.map((quota) => [quota.userId, quota]))

  return userList.map((user) => {
    const quota = quotaByUserId.get(user.id)
    if (!quota) {
      throw new Error(`Admin quota summary missing for user ${user.id}.`)
    }

    return {
      user,
      quota
    }
  })
}

userRoutes.get('/users', requireAdmin, async (request, response, next) => {
  try {
    const query = listUsersQuerySchema.parse(request.query)
    const normalizedSearch = query.search?.trim()
    const skip = (query.page - 1) * query.limit

    const whereClause: Prisma.UserWhereInput = {
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

    const [totalUsers, rawUserList] = await prisma.$transaction([
      prisma.user.count({
        where: whereClause
      }),
      prisma.user.findMany({
        where: whereClause,
        skip,
        take: query.limit,
        orderBy: resolveUserOrderBy(query.sortBy, query.sortDirection),
        select: userListSelect
      })
    ])

    const usersWithQuota = await attachQuotaSummaries(rawUserList)
    const totalPages = Math.max(1, Math.ceil(totalUsers / query.limit))

    response.json({
      data: {
        records: usersWithQuota.map(({ user, quota }) => serializeAdminUserRecord(user, quota)),
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

userRoutes.get('/users/:userId/patreon-debug', requireAdmin, async (request, response, next) => {
  try {
    const { userId } = userParamsSchema.parse(request.params)

    const user = await prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        id: true,
        email: true,
        username: true,
        patreonAccount: true,
        entitlementGrants: {
          where: {
            source: 'PATREON'
          },
          orderBy: {
            updatedAt: 'desc'
          }
        }
      }
    })

    if (!user) {
      response.status(404).json({
        message: 'User not found.'
      })
      return
    }

    const logs = await listPatreonSyncLogsForUser(userId, 30)

    response.json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username
        },
        patreonAccount: user.patreonAccount
          ? {
              id: user.patreonAccount.id,
              patreonUserId: user.patreonAccount.patreonUserId,
              campaignMemberId: user.patreonAccount.campaignMemberId,
              tierCents: user.patreonAccount.tierCents,
              monthlyTierCents: calculateMonthlyEquivalentCents(
                user.patreonAccount.tierCents ?? 0,
                resolveBillingPeriodMonths({
                  pledgeCadenceMonths: user.patreonAccount.pledgeCadenceMonths,
                  lastChargeDate: user.patreonAccount.lastChargeDate,
                  nextChargeDate: user.patreonAccount.nextChargeDate
                })
              ),
              pledgeCadenceMonths: user.patreonAccount.pledgeCadenceMonths,
              membershipStatus: user.patreonAccount.membershipStatus,
              lastChargeStatus: user.patreonAccount.lastChargeStatus,
              lastChargeDate: user.patreonAccount.lastChargeDate?.toISOString() ?? null,
              nextChargeDate: user.patreonAccount.nextChargeDate?.toISOString() ?? null,
              tokenExpiresAt: user.patreonAccount.tokenExpiresAt?.toISOString() ?? null,
              lastCheckedAt: user.patreonAccount.lastCheckedAt?.toISOString() ?? null,
              createdAt: user.patreonAccount.createdAt.toISOString(),
              updatedAt: user.patreonAccount.updatedAt.toISOString()
            }
          : null,
        entitlements: user.entitlementGrants.map((entitlement) => ({
          id: entitlement.id,
          tierCode: entitlement.tierCode,
          status: entitlement.status,
          validFrom: entitlement.validFrom?.toISOString() ?? null,
          validUntil: entitlement.validUntil?.toISOString() ?? null,
          updatedAt: entitlement.updatedAt.toISOString()
        })),
        logs
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
    const nextPlayerName = payload.playerName === null ? null : payload.playerName?.trim()
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
          ...(payload.playerName !== undefined ? { playerName: nextPlayerName } : {}),
          ...(nextPasswordHash ? { passwordHash: nextPasswordHash } : {})
        },
        select: {
          id: true,
          email: true,
          username: true
        }
      })

      if (payload.tierCode !== undefined) {
        await tx.user.update({
          where: {
            id: userId
          },
          data: {
            tierCode: payload.tierCode === null ? null : normalizeMembershipTierCode(payload.tierCode)
          }
        })
      }

      const tierUser = await tx.user.findUnique({
        where: {
          id: userId
        },
        select: {
          tierCode: true
        }
      })

      return {
        ...user,
        tierCode: tierUser?.tierCode ?? null
      }
    })

    response.json({
      data: updatedUser
    })
  } catch (error) {
    next(error)
  }
})

userRoutes.post('/users/:userId/patreon/sync', requireAdmin, async (request, response, next) => {
  try {
    const { userId } = userParamsSchema.parse(request.params)
    const actingAdmin = request.authUser

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

    const syncResult = await syncPatreonMembership({
      userId,
      logSource: 'admin_sync',
      logActorUserId: actingAdmin?.userId ?? null,
      logActorLabel: actingAdmin?.email ?? 'admin',
      logTrigger: 'admin_force_sync'
    })

    response.json({
      data: syncResult
    })
  } catch (error) {
    const actingAdmin = request.authUser
    const userId = typeof request.params.userId === 'string' ? request.params.userId : null
    if (userId) {
      await appendPatreonSyncLog({
        userId,
        source: 'admin_sync',
        eventType: 'sync_error',
        level: 'ERROR',
        message: error instanceof Error ? error.message : 'Admin Patreon sync failed.',
        actorUserId: actingAdmin?.userId ?? null,
        actorLabel: actingAdmin?.email ?? 'admin',
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      }).catch(() => {})
    }
    next(error)
  }
})

userRoutes.post('/users/:userId/patreon/disconnect', requireAdmin, async (request, response, next) => {
  try {
    const { userId } = userParamsSchema.parse(request.params)
    const actingAdmin = request.authUser

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

    await prisma.$transaction([
      prisma.patreonOAuthState.deleteMany({
        where: {
          userId
        }
      }),
      prisma.patreonAccount.deleteMany({
        where: {
          userId
        }
      }),
      prisma.entitlement.updateMany({
        where: {
          userId,
          source: 'PATREON'
        },
        data: {
          status: 'INACTIVE',
          tierCode: 'inactive',
          validUntil: new Date()
        }
      })
    ])

    await appendPatreonSyncLog({
      userId,
      source: 'admin_disconnect',
      eventType: 'disconnect',
      level: 'WARN',
      message: 'Patreon account was disconnected by an admin.',
      actorUserId: actingAdmin?.userId ?? null,
      actorLabel: actingAdmin?.email ?? 'admin'
    })

    response.json({
      data: {
        disconnected: true
      }
    })
  } catch (error) {
    next(error)
  }
})

userRoutes.patch('/users/me/profile', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser
    if (!authUser) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const payload = updateMyProfileSchema.parse(request.body ?? {})
    const nextPlayerName = payload.player_name.trim()

    const updatedUser = await prisma.user.update({
      where: {
        id: authUser.userId
      },
      data: {
        playerName: nextPlayerName
      },
      select: {
        id: true,
        username: true,
        playerName: true,
        updatedAt: true
      }
    })

    response.json({
      data: {
        id: updatedUser.id,
        username: updatedUser.username,
        player_name: updatedUser.playerName ?? updatedUser.username,
        updated_at: updatedUser.updatedAt
      }
    })
  } catch (error) {
    next(error)
  }
})

export default userRoutes
