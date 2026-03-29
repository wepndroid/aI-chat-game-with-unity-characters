import os from 'node:os'
import { Router } from 'express'
import { emailConfig, getIsSecureCookie } from '../lib/auth-config'
import { isPatreonOauthEnabled } from '../lib/patreon-config'
import { googleOAuthConfig } from '../lib/oauth-config'
import { requireAdmin } from '../middleware/auth-middleware'
import { prisma } from '../lib/prisma'

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
  const [latestUsers, latestCharacters, latestReviews] = await prisma.$transaction([
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
  const webglEmbedUrl = process.env.NEXT_PUBLIC_WEBGL_EMBED_URL?.trim() || process.env.WEBGL_EMBED_URL?.trim() || ''
  const trailerEmbedUrl = process.env.NEXT_PUBLIC_TRAILER_EMBED_URL?.trim() || process.env.TRAILER_EMBED_URL?.trim() || ''
  const trailerVideoUrl = process.env.NEXT_PUBLIC_TRAILER_VIDEO_URL?.trim() || process.env.TRAILER_VIDEO_URL?.trim() || ''
  const corsOrigin = process.env.CORS_ORIGIN?.trim() || ''
  const patreonEnabled = isPatreonOauthEnabled()
  const googleEnabled = googleOAuthConfig.enabled
  const smtpConfigured = Boolean(emailConfig.smtpHost && emailConfig.smtpUser && emailConfig.smtpPass)
  const secureCookieEnabled = getIsSecureCookie()

  const browserMatrix = ['Chrome', 'Firefox', 'Edge', 'Safari'].map((browserName) => ({
    browser: browserName,
    status: webglEmbedUrl ? 'ready' : 'pending' as const
  }))

  return {
    checks: [
      {
        id: 'webgl',
        label: 'WebGL Embed URL',
        status: webglEmbedUrl ? 'ready' : 'pending',
        detail: webglEmbedUrl || 'Missing NEXT_PUBLIC_WEBGL_EMBED_URL'
      },
      {
        id: 'trailer',
        label: 'Trailer Source',
        status: trailerEmbedUrl || trailerVideoUrl ? 'ready' : 'pending',
        detail: trailerEmbedUrl || trailerVideoUrl || 'Missing trailer embed/video env'
      },
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
        detail: smtpConfigured ? `${emailConfig.smtpHost}:${emailConfig.smtpPort}` : 'Missing SMTP credentials'
      },
      {
        id: 'cookies',
        label: 'Secure Auth Cookies',
        status: secureCookieEnabled ? 'ready' : 'warning',
        detail: secureCookieEnabled ? 'Production secure cookies enabled' : 'NODE_ENV is not production'
      },
      {
        id: 'cors',
        label: 'CORS Origin',
        status: corsOrigin ? 'ready' : 'warning',
        detail: corsOrigin || 'CORS_ORIGIN not explicitly configured'
      }
    ],
    browserMatrix
  }
}

statsRoutes.get('/stats/overview', requireAdmin, async (_request, response, next) => {
  try {
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
          status: 'PENDING'
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

export default statsRoutes
