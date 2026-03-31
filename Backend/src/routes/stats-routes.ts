import os from 'node:os'
import { Router } from 'express'
import { z } from 'zod'
import { getEmailConfig } from '../lib/auth-config'
import { applyApiKeysToProcessEnv, writeApiKeysToEnvFile } from '../lib/env-file-sync'
import { isPatreonOauthEnabled } from '../lib/patreon-config'
import { getGoogleOAuthConfig } from '../lib/oauth-config'
import { requireAdmin } from '../middleware/auth-middleware'
import { prisma } from '../lib/prisma'
import { getRuntimeAdminSettings, updateRuntimeAdminSettings } from '../lib/runtime-admin-settings'

const statsRoutes = Router()

type ActivityTone = 'yellow' | 'red' | 'green' | 'blue'

const toRelativeTimeLabel = (value: Date) => {
  const diffMs = Date.now() - value.getTime()
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000))

  if (diffMinutes < 60) {
    return `${diffMinutes} mins ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours} hours ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} days ago`
}

const buildRecentActivity = async () => {
  const [latestUsers, latestCharacters, latestReviews, systemLogs] = await prisma.$transaction([
    prisma.user.findMany({
      take: 4,
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        id: true,
        username: true,
        createdAt: true
      }
    }),
    prisma.character.findMany({
      take: 5,
      orderBy: {
        updatedAt: 'desc'
      },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
        owner: {
          select: {
            username: true
          }
        }
      }
    }),
    prisma.review.findMany({
      take: 4,
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        id: true,
        createdAt: true,
        user: {
          select: {
            username: true
          }
        },
        character: {
          select: {
            name: true
          }
        }
      }
    }),
    prisma.systemActivityLog.findMany({
      take: 8,
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        id: true,
        message: true,
        tone: true,
        createdAt: true
      }
    })
  ])

  const activityList: Array<{ id: string; message: string; timeLabel: string; tone: ActivityTone; timestampMs: number }> = []

  for (const user of latestUsers) {
    activityList.push({
      id: `user-${user.id}`,
      message: `New user registered: ${user.username}.`,
      timeLabel: toRelativeTimeLabel(user.createdAt),
      tone: 'green',
      timestampMs: user.createdAt.getTime()
    })
  }

  for (const character of latestCharacters) {
    const statusText = character.status.toLowerCase()
    const tone: ActivityTone = character.status === 'REJECTED' ? 'red' : character.status === 'PENDING' ? 'yellow' : 'blue'

    activityList.push({
      id: `character-${character.id}`,
      message: `Character "${character.name}" by ${character.owner.username} is now ${statusText}.`,
      timeLabel: toRelativeTimeLabel(character.updatedAt),
      tone,
      timestampMs: character.updatedAt.getTime()
    })
  }

  for (const review of latestReviews) {
    activityList.push({
      id: `review-${review.id}`,
      message: `${review.user.username} posted a new review on "${review.character.name}".`,
      timeLabel: toRelativeTimeLabel(review.createdAt),
      tone: 'blue',
      timestampMs: review.createdAt.getTime()
    })
  }

  const logToneSet = new Set<ActivityTone>(['yellow', 'red', 'green', 'blue'])

  for (const log of systemLogs) {
    const tone = logToneSet.has(log.tone as ActivityTone) ? (log.tone as ActivityTone) : 'blue'

    activityList.push({
      id: `log-${log.id}`,
      message: log.message,
      timeLabel: toRelativeTimeLabel(log.createdAt),
      tone,
      timestampMs: log.createdAt.getTime()
    })
  }

  return activityList
    .sort((a, b) => b.timestampMs - a.timestampMs)
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      message: item.message,
      timeLabel: item.timeLabel,
      tone: item.tone
    }))
}

const buildDeploymentChecks = () => {
  const patreonEnabled = isPatreonOauthEnabled()
  const googleEnabled = getGoogleOAuthConfig().enabled
  const emailCfg = getEmailConfig()
  const smtpConfigured = Boolean(emailCfg.smtpHost && emailCfg.smtpUser && emailCfg.smtpPass)

  return {
    checks: [
      {
        id: 'patreon',
        label: 'Patreon OAuth',
        status: patreonEnabled ? 'ready' : 'pending',
        detail: patreonEnabled ? 'Configured' : 'PATREON_OAUTH_ENABLED is false'
      },
      {
        id: 'google',
        label: 'Google OAuth',
        status: googleEnabled ? 'ready' : 'pending',
        detail: googleEnabled ? 'Configured' : 'Google OAuth credentials are incomplete'
      },
      {
        id: 'smtp',
        label: 'SMTP',
        status: smtpConfigured ? 'ready' : 'pending',
        detail: smtpConfigured ? `${emailCfg.smtpHost}:${emailCfg.smtpPort}` : 'Missing SMTP credentials'
      }
    ],
    browserMatrix: []
  }
}

const adminSettingsPatchSchema = z.object({
  uploadLimits: z
    .object({
      maxVrmSizeMb: z.number().int().min(1).max(1024),
      maxPreviewImageSizeMb: z.number().int().min(1).max(100),
      allowedPreviewMimeTypes: z.array(z.string().min(1)).min(1)
    })
    .optional(),
  requestLimits: z
    .object({
      generalPerMinute: z.number().int().min(10).max(10000),
      authPerMinute: z.number().int().min(5).max(5000),
      uploadPerMinute: z.number().int().min(1).max(5000)
    })
    .optional(),
  sessionLogin: z
    .object({
      sessionTtlMinutes: z.number().int().min(10).max(60 * 24 * 90)
    })
    .optional(),
  featureSwitches: z
    .object({
      publicUploadsEnabled: z.boolean(),
      communityPageEnabled: z.boolean()
    })
    .optional(),
  maintenance: z
    .object({
      enabled: z.boolean(),
      message: z.string().min(1).max(500),
      startAtIso: z.string().nullable(),
      endAtIso: z.string().nullable(),
      adminBypass: z.boolean(),
      readOnlyMode: z.boolean(),
      blockedRoutePrefixes: z.array(z.string())
    })
    .optional(),
  apiKeys: z
    .object({
      googleClientId: z.string(),
      googleClientSecret: z.string(),
      googleRedirectUri: z.string(),
      patreonClientId: z.string(),
      patreonClientSecret: z.string(),
      patreonRedirectUri: z.string(),
      smtpHost: z.string(),
      smtpPort: z.number().int().min(1).max(65535),
      smtpUser: z.string(),
      smtpPass: z.string(),
      smtpFrom: z.string()
    })
    .optional()
})

statsRoutes.get('/stats/overview', requireAdmin, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [
      totalUsers,
      newUsersToday,
      totalCharacters,
      approvedCharacters,
      pendingCharacters,
      totalReviews,
      totalHeartsResult,
      patreonLinkedUsers,
      activePatrons,
      totalViewsResult,
      dau7dRecords,
      dau30dRecords
    ] = await prisma.$transaction([
      prisma.user.count(),
      prisma.user.count({
        where: {
          createdAt: {
            gte: startOfToday
          }
        }
      }),
      prisma.character.count(),
      prisma.character.count({
        where: {
          status: 'APPROVED',
          visibility: 'PUBLIC'
        }
      }),
      prisma.character.count({
        where: {
          status: 'PENDING',
          owner: {
            role: {
              not: 'ADMIN'
            }
          }
        }
      }),
      prisma.review.count(),
      prisma.character.aggregate({
        _sum: {
          heartsCount: true
        }
      }),
      prisma.patreonAccount.count(),
      prisma.patreonAccount.count({
        where: {
          membershipStatus: 'active_patron',
          OR: [{ nextChargeDate: null }, { nextChargeDate: { gt: now } }]
        }
      }),
      prisma.character.aggregate({
        _sum: {
          viewsCount: true
        }
      }),
      prisma.session.findMany({
        where: {
          revokedAt: null,
          lastSeenAt: {
            gte: sevenDaysAgo
          }
        },
        distinct: ['userId'],
        select: {
          userId: true
        }
      }),
      prisma.session.findMany({
        where: {
          revokedAt: null,
          lastSeenAt: {
            gte: thirtyDaysAgo
          }
        },
        distinct: ['userId'],
        select: {
          userId: true
        }
      })
    ])

    const adminSeenRecord = await prisma.user.findUnique({
      where: {
        id: authUser.userId
      },
      select: {
        officialVrmsListSeenAt: true,
        communityVrmsListSeenAt: true
      }
    })

    const newOfficialVrmsCount = await prisma.character.count({
      where: {
        owner: {
          role: 'ADMIN'
        },
        ...(adminSeenRecord?.officialVrmsListSeenAt
          ? {
              createdAt: {
                gt: adminSeenRecord.officialVrmsListSeenAt
              }
            }
          : {})
      }
    })

    /** Matches admin Community VRMs list: non-admin-owned rows not stuck in pending review.
     *  Use createdAt OR updatedAt vs last-seen: approvals only bump updatedAt, so the badge must rise
     *  when a pending row is approved even if createdAt predates the last list visit. */
    const newCommunityVrmsCount = await prisma.character.count({
      where: {
        owner: {
          role: {
            not: 'ADMIN'
          }
        },
        status: {
          not: 'PENDING'
        },
        ...(adminSeenRecord?.communityVrmsListSeenAt
          ? {
              OR: [
                {
                  createdAt: {
                    gt: adminSeenRecord.communityVrmsListSeenAt
                  }
                },
                {
                  updatedAt: {
                    gt: adminSeenRecord.communityVrmsListSeenAt
                  }
                }
              ]
            }
          : {})
      }
    })

    const topCharacters = await prisma.character.findMany({
      where: {
        status: 'APPROVED',
        visibility: 'PUBLIC'
      },
      take: 8,
      orderBy: [{ viewsCount: 'desc' }, { heartsCount: 'desc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        previewImageUrl: true,
        viewsCount: true,
        heartsCount: true,
        minimumTierCents: true,
        isPatreonGated: true
      }
    })

    const tierDistributionRaw = await prisma.patreonAccount.findMany({
      where: {
        tierCents: {
          not: null
        }
      },
      select: {
        tierCents: true
      }
    })

    const tierDistributionMap = new Map<number, number>()

    for (const account of tierDistributionRaw) {
      const tierCents = account.tierCents ?? 0
      tierDistributionMap.set(tierCents, (tierDistributionMap.get(tierCents) ?? 0) + 1)
    }

    const tierDistribution = [...tierDistributionMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([tierCents, users]) => ({
        tierCents,
        users
      }))

    const recentActivity = await buildRecentActivity()
    const deployment = await buildDeploymentChecks()

    const [loadAvg1m, loadAvg5m, loadAvg15m] = os.loadavg()

    response.json({
      data: {
        totalUsers,
        newUsersToday,
        totalCharacters,
        approvedCharacters,
        pendingCharacters,
        newOfficialVrmsCount,
        newCommunityVrmsCount,
        totalReviews,
        totalHearts: totalHeartsResult._sum.heartsCount ?? 0,
        totalViews: totalViewsResult._sum.viewsCount ?? 0,
        patreonLinkedUsers,
        activePatrons,
        dau7d: dau7dRecords.length,
        dau30d: dau30dRecords.length,
        serverLoad1m: Math.round(loadAvg1m * 1000) / 1000,
        serverLoad5m: Math.round(loadAvg5m * 1000) / 1000,
        serverLoad15m: Math.round(loadAvg15m * 1000) / 1000,
        topCharacters,
        pledgeTrends: {
          linkedUsers: patreonLinkedUsers,
          activePatrons,
          tierDistribution
        },
        recentActivity,
        deployment,
        updatedAt: new Date().toISOString()
      }
    })
  } catch (error) {
    next(error)
  }
})

statsRoutes.get('/stats/activity', requireAdmin, async (_request, response, next) => {
  try {
    const recentActivity = await buildRecentActivity()

    response.json({
      data: recentActivity
    })
  } catch (error) {
    next(error)
  }
})

statsRoutes.get('/stats/deployment-checks', requireAdmin, async (_request, response, next) => {
  try {
    const deploymentChecks = await buildDeploymentChecks()

    response.json({
      data: deploymentChecks
    })
  } catch (error) {
    next(error)
  }
})

statsRoutes.get('/admin/global-settings', requireAdmin, async (_request, response, next) => {
  try {
    const settings = await getRuntimeAdminSettings()
    response.json({
      data: settings
    })
  } catch (error) {
    next(error)
  }
})

statsRoutes.patch('/admin/global-settings', requireAdmin, async (request, response, next) => {
  try {
    const payload = adminSettingsPatchSchema.parse(request.body)
    const previous = await getRuntimeAdminSettings()

    const nextSettings = await updateRuntimeAdminSettings({
      uploadLimits: payload.uploadLimits ?? previous.uploadLimits,
      requestLimits: payload.requestLimits ?? previous.requestLimits,
      sessionLogin: payload.sessionLogin ?? previous.sessionLogin,
      featureSwitches: payload.featureSwitches ?? previous.featureSwitches,
      maintenance: payload.maintenance ?? previous.maintenance,
      apiKeys: payload.apiKeys
        ? {
            ...previous.apiKeys,
            ...payload.apiKeys,
            googleClientSecret:
              payload.apiKeys.googleClientSecret.trim().length > 0 ? payload.apiKeys.googleClientSecret : previous.apiKeys.googleClientSecret,
            patreonClientSecret:
              payload.apiKeys.patreonClientSecret.trim().length > 0
                ? payload.apiKeys.patreonClientSecret
                : previous.apiKeys.patreonClientSecret,
            smtpPass: payload.apiKeys.smtpPass.trim().length > 0 ? payload.apiKeys.smtpPass : previous.apiKeys.smtpPass
          }
        : previous.apiKeys
    })

    applyApiKeysToProcessEnv(nextSettings.apiKeys)
    writeApiKeysToEnvFile(nextSettings.apiKeys)

    const refreshed = await getRuntimeAdminSettings()

    response.json({
      data: refreshed
    })
  } catch (error) {
    next(error)
  }
})

export default statsRoutes
