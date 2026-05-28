import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { sendApiData, sendApiError } from '../lib/api-contract'
import { prisma } from '../lib/prisma'
import { resolveTierQuotaForUser } from '../lib/tier-quota'
import { requireAdmin } from '../middleware/auth-middleware'
import {
  buildQuotaSnapshotForUser,
  setQuotaUsageForCurrentPeriod
} from '../services/chat/chat-quota-service'
import { resetQuotaPeriodForUser } from '../services/chat/chat-quota-period-service'

const unityQuotaFixtureRoutes = Router()

const fixtureOperations = [
  'status',
  'set_text_exhausted',
  'set_voice_exhausted',
  'set_both_exhausted',
  'set_text_one_remaining',
  'set_voice_one_remaining',
  'reset_current_period'
] as const

const fixtureRequestSchema = z
  .object({
    operation: z.enum(fixtureOperations),
    target_user_id: z.string().trim().min(1).optional(),
    target_email: z.string().trim().email().optional()
  })
  .strict()

const fixtureStatusQuerySchema = z
  .object({
    target_user_id: z.string().trim().min(1).optional(),
    target_email: z.string().trim().email().optional()
  })
  .strict()

const b_quotaFixturesEnabled = () => process.env.UNITY_QUOTA_TEST_FIXTURES_ENABLED?.trim().toLowerCase() === 'true'

const requireQuotaFixturesEnabled = (_request: Request, response: Response, next: NextFunction) => {
  if (!b_quotaFixturesEnabled()) {
    sendApiError(response, 404, 'NOT_FOUND', 'Route not found.')
    return
  }

  next()
}

const resolveTargetUser = async (input: {
  fallbackUserId: string
  targetUserId?: string
  targetEmail?: string
}) => {
  if (input.targetUserId && input.targetEmail) {
    return {
      ok: false as const,
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Specify target_user_id or target_email, not both.'
    }
  }

  const where = input.targetUserId
    ? { id: input.targetUserId }
    : input.targetEmail
      ? { email: input.targetEmail }
      : { id: input.fallbackUserId }

  const user = await prisma.user.findUnique({
    where,
    select: {
      id: true,
      email: true,
      role: true
    }
  })

  if (!user) {
    return {
      ok: false as const,
      status: 404,
      code: 'NOT_FOUND',
      message: 'Target user not found.'
    }
  }

  return {
    ok: true as const,
    user
  }
}

const buildFixtureResponse = async (input: {
  operation: (typeof fixtureOperations)[number]
  targetUserId: string
}) => {
  const quota = await buildQuotaSnapshotForUser(input.targetUserId, {
    voiceRequested: true
  })

  return {
    operation: input.operation,
    target_user_id: input.targetUserId,
    quota
  }
}

const ensureFiniteTextQuota = (tierQuota: Awaited<ReturnType<typeof resolveTierQuotaForUser>>) => {
  if (tierQuota.unlimitedMessages) {
    return {
      ok: false as const,
      message: 'Target user has unlimited text quota; choose a finite-tier account for this fixture.'
    }
  }

  return { ok: true as const }
}

const ensureFiniteVoiceQuota = (tierQuota: Awaited<ReturnType<typeof resolveTierQuotaForUser>>) => {
  if (!tierQuota.voiceEnabled) {
    return {
      ok: false as const,
      message: 'Target user has voice disabled by tier; choose a voice-enabled finite-tier account for this fixture.'
    }
  }

  if (tierQuota.unlimitedVoice || tierQuota.voiceLimit === null) {
    return {
      ok: false as const,
      message: 'Target user has unlimited voice quota; choose a finite-tier account for this fixture.'
    }
  }

  return { ok: true as const }
}

const applyFixtureOperation = async (input: {
  operation: (typeof fixtureOperations)[number]
  targetUserId: string
  actorUserId: string
}) => {
  const tierQuota = await resolveTierQuotaForUser(input.targetUserId)

  switch (input.operation) {
    case 'status':
      return null
    case 'reset_current_period':
      await resetQuotaPeriodForUser({
        userId: input.targetUserId,
        tierCode: tierQuota.tierCode,
        periodDays: tierQuota.periodDays,
        resetReason: 'admin_fixture_reset',
        actorUserId: input.actorUserId
      })
      await setQuotaUsageForCurrentPeriod(input.targetUserId, {
        messagesUsed: 0,
        voiceMessagesUsed: 0
      })
      return null
    case 'set_text_exhausted': {
      const finiteText = ensureFiniteTextQuota(tierQuota)
      if (!finiteText.ok) {
        return finiteText
      }
      await setQuotaUsageForCurrentPeriod(input.targetUserId, {
        messagesUsed: tierQuota.limit
      })
      return null
    }
    case 'set_text_one_remaining': {
      const finiteText = ensureFiniteTextQuota(tierQuota)
      if (!finiteText.ok) {
        return finiteText
      }
      await setQuotaUsageForCurrentPeriod(input.targetUserId, {
        messagesUsed: Math.max(0, tierQuota.limit - 1)
      })
      return null
    }
    case 'set_voice_exhausted': {
      const finiteVoice = ensureFiniteVoiceQuota(tierQuota)
      if (!finiteVoice.ok) {
        return finiteVoice
      }
      const voiceLimit = tierQuota.voiceLimit ?? 0
      await setQuotaUsageForCurrentPeriod(input.targetUserId, {
        voiceMessagesUsed: voiceLimit
      })
      return null
    }
    case 'set_voice_one_remaining': {
      const finiteVoice = ensureFiniteVoiceQuota(tierQuota)
      if (!finiteVoice.ok) {
        return finiteVoice
      }
      const voiceLimit = tierQuota.voiceLimit ?? 0
      await setQuotaUsageForCurrentPeriod(input.targetUserId, {
        voiceMessagesUsed: Math.max(0, voiceLimit - 1)
      })
      return null
    }
    case 'set_both_exhausted': {
      const finiteText = ensureFiniteTextQuota(tierQuota)
      if (!finiteText.ok) {
        return finiteText
      }
      const finiteVoice = ensureFiniteVoiceQuota(tierQuota)
      if (!finiteVoice.ok) {
        return finiteVoice
      }
      const voiceLimit = tierQuota.voiceLimit ?? 0
      await setQuotaUsageForCurrentPeriod(input.targetUserId, {
        messagesUsed: tierQuota.limit,
        voiceMessagesUsed: voiceLimit
      })
      return null
    }
  }
}

/**
 * Admin-only Unity quota fixture surface. It is hidden behind an explicit env
 * gate and never mutates local Unity state; it writes the same backend quota
 * ledger used by production chat and TTS gates so Play Mode exhaustion checks
 * exercise real server behavior.
 */
unityQuotaFixtureRoutes.get(
  '/admin/unity/quota-fixtures/status',
  requireQuotaFixturesEnabled,
  requireAdmin,
  async (request, response, next) => {
    try {
      const authUser = request.authUser
      if (!authUser) {
        sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
        return
      }

      const query = fixtureStatusQuerySchema.parse(request.query)
      const target = await resolveTargetUser({
        fallbackUserId: authUser.userId,
        targetUserId: query.target_user_id,
        targetEmail: query.target_email
      })

      if (!target.ok) {
        sendApiError(response, target.status, target.code, target.message)
        return
      }

      sendApiData(
        response,
        await buildFixtureResponse({
          operation: 'status',
          targetUserId: target.user.id
        })
      )
    } catch (error) {
      next(error)
    }
  }
)

unityQuotaFixtureRoutes.post(
  '/admin/unity/quota-fixtures',
  requireQuotaFixturesEnabled,
  requireAdmin,
  async (request, response, next) => {
    try {
      const authUser = request.authUser
      if (!authUser) {
        sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
        return
      }

      const payload = fixtureRequestSchema.parse(request.body ?? {})
      const target = await resolveTargetUser({
        fallbackUserId: authUser.userId,
        targetUserId: payload.target_user_id,
        targetEmail: payload.target_email
      })

      if (!target.ok) {
        sendApiError(response, target.status, target.code, target.message)
        return
      }

      const rejected = await applyFixtureOperation({
        operation: payload.operation,
        targetUserId: target.user.id,
        actorUserId: authUser.userId
      })

      if (rejected?.ok === false) {
        sendApiError(response, 409, 'BAD_REQUEST', rejected.message)
        return
      }

      sendApiData(
        response,
        await buildFixtureResponse({
          operation: payload.operation,
          targetUserId: target.user.id
        })
      )
    } catch (error) {
      next(error)
    }
  }
)

export default unityQuotaFixtureRoutes
