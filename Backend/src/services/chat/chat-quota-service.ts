import { ChatQuotaReservationStatus, Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { resolveTierQuotaForUser } from '../../lib/tier-quota'
import { resolveCurrentQuotaPeriod } from './chat-quota-period-service'

const GAMEPLAY_CLIENT_MESSAGE_PREFIX = 'event:'
const GAMEPLAY_REQUEST_ID_PREFIX = 'gameplay:'

type VoiceStatus = 'not_requested' | 'disabled' | 'quota_exhausted' | 'generated' | 'generation_failed' | 'not_generated'
type QuotaExhaustionReason = 'message_quota_exhausted' | 'voice_quota_exhausted' | null
type QuotaKind = 'text' | 'voice'

type QuotaSnapshotInput = {
  userId: string
  tierCode: string
  periodEnd: Date
  messageLimit: number
  messageUsed: number
  messageReserved: number
  unlimitedMessages: boolean
  voiceEnabled: boolean
  voiceLimit: number | null
  voiceUsed: number
  voiceReserved: number
  unlimitedVoice: boolean
  voiceRequested: boolean
  voiceAllowed: boolean
  voiceStatus: VoiceStatus
  voiceAudioUrl: string | null
  exhaustionReason: QuotaExhaustionReason
}

const getOrCreateUsageRecord = async (userId: string, periodStart: Date, periodEnd: Date) => {
  const existing = await prisma.chatMessageUsage.findUnique({
    where: { userId_periodStartAt: { userId, periodStartAt: periodStart } }
  })

  if (existing) {
    return existing
  }

  return prisma.chatMessageUsage.create({
    data: {
      userId,
      periodStartAt: periodStart,
      periodEndAt: periodEnd,
      messagesUsed: 0
    }
  })
}

const getUserMessageCountForPeriod = async (userId: string, periodStart: Date, periodEnd: Date) => {
  return prisma.chatMessage.count({
    where: {
      role: 'USER',
      OR: [{ clientMessageId: null }, { clientMessageId: { not: { startsWith: GAMEPLAY_CLIENT_MESSAGE_PREFIX } } }],
      createdAt: {
        gte: periodStart,
        lt: periodEnd
      },
      session: {
        userId
      }
    }
  })
}

const getAssistantVoiceCountForPeriod = async (userId: string, periodStart: Date, periodEnd: Date) => {
  return prisma.chatMessage.count({
    where: {
      role: 'ASSISTANT',
      audioUrl: {
        not: null
      },
      OR: [{ clientMessageId: null }, { clientMessageId: { not: { startsWith: GAMEPLAY_CLIENT_MESSAGE_PREFIX } } }],
      createdAt: {
        gte: periodStart,
        lt: periodEnd
      },
      session: {
        userId
      }
    }
  })
}

const getEffectiveUsageForPeriod = async (userId: string, periodStart: Date, periodEnd: Date) => {
  const usageRecord = await getOrCreateUsageRecord(userId, periodStart, periodEnd)

  return {
    usageRecordId: usageRecord.id,
    effectiveMessagesUsed: usageRecord.messagesUsed,
    effectiveVoiceUsed: usageRecord.voiceMessagesUsed
  }
}

const getTranscriptUsageDiagnosticsForPeriod = async (userId: string, periodStart: Date, periodEnd: Date) => {
  const [userMessageCount, assistantVoiceCount] = await Promise.all([
    getUserMessageCountForPeriod(userId, periodStart, periodEnd),
    getAssistantVoiceCountForPeriod(userId, periodStart, periodEnd)
  ])

  return {
    transcriptMessagesUsed: userMessageCount,
    transcriptVoiceMessagesUsed: assistantVoiceCount
  }
}

const getReservedCountsForPeriod = async (userId: string, periodStart: Date, requestIdToExclude?: string) => {
  const baseWhere: Prisma.ChatQuotaReservationWhereInput = {
    userId,
    periodStartAt: periodStart,
    status: ChatQuotaReservationStatus.RESERVED,
    AND: [
      {
        requestId: {
          not: {
            startsWith: GAMEPLAY_REQUEST_ID_PREFIX
          }
        }
      },
      ...(requestIdToExclude
        ? [
            {
              requestId: {
                not: requestIdToExclude
              }
            }
          ]
        : [])
    ]
  }

  const [messageReserved, voiceReserved] = await Promise.all([
    prisma.chatQuotaReservation.count({
      where: baseWhere
    }),
    prisma.chatQuotaReservation.count({
      where: {
        ...baseWhere,
        voiceRequested: true
      }
    })
  ])

  return {
    messageReserved,
    voiceReserved
  }
}

const resolveMessageRemaining = (input: {
  limit: number
  used: number
  reserved: number
  unlimited: boolean
}) => {
  if (input.unlimited) {
    return null
  }
  return Math.max(0, input.limit - input.used - input.reserved)
}

const resolveVoiceRemaining = (input: {
  enabled: boolean
  limit: number | null
  used: number
  reserved: number
  unlimited: boolean
}) => {
  if (!input.enabled) {
    return 0
  }
  if (input.unlimited || input.limit === null) {
    return null
  }
  return Math.max(0, input.limit - input.used - input.reserved)
}

const buildQuotaSnapshotData = (input: QuotaSnapshotInput) => {
  const messageRemaining = resolveMessageRemaining({
    limit: input.messageLimit,
    used: input.messageUsed,
    reserved: input.messageReserved,
    unlimited: input.unlimitedMessages
  })

  const voiceRemaining = resolveVoiceRemaining({
    enabled: input.voiceEnabled,
    limit: input.voiceLimit,
    used: input.voiceUsed,
    reserved: input.voiceReserved,
    unlimited: input.unlimitedVoice
  })

  const hardQuotaMessage =
    input.exhaustionReason === 'message_quota_exhausted'
      ? input.tierCode === 'free'
        ? 'You have used all your free messages this period. Please upgrade your plan to continue chatting.'
        : 'You have reached your message limit for this billing period. Your quota resets soon.'
      : null

  const voiceQuotaMessage =
    input.voiceStatus === 'disabled'
      ? 'Voice is not available on your current plan.'
      : input.voiceStatus === 'quota_exhausted'
      ? 'Your voice quota is exhausted. Continue with text-only or upgrade for more voice.'
      : input.voiceStatus === 'generation_failed'
      ? 'Voice generation failed for this reply. Text response is still available.'
      : null

  return {
    allowed: input.exhaustionReason === null,
    exhaustion_reason: input.exhaustionReason,
    can_send_text: input.exhaustionReason !== 'message_quota_exhausted',
    can_generate_voice: input.voiceEnabled && input.voiceAllowed,
    user_id: input.userId,
    tier_code: input.tierCode,
    // Legacy top-level fields retained for existing clients that read message quota directly.
    limit: input.messageLimit,
    remaining: messageRemaining,
    period_ends_at: input.periodEnd.toISOString(),
    user_message: hardQuotaMessage,
    message_quota: {
      limit: input.unlimitedMessages ? null : input.messageLimit,
      used: input.messageUsed,
      reserved: input.messageReserved,
      remaining: messageRemaining,
      unlimited: input.unlimitedMessages
    },
    voice_quota: {
      enabled: input.voiceEnabled,
      requested: input.voiceRequested,
      allowed: input.voiceEnabled && input.voiceAllowed,
      status: input.voiceStatus,
      limit: input.voiceEnabled ? (input.unlimitedVoice ? null : input.voiceLimit ?? 0) : 0,
      used: input.voiceUsed,
      reserved: input.voiceReserved,
      remaining: voiceRemaining,
      unlimited: input.voiceEnabled ? input.unlimitedVoice : false,
      audio_url: input.voiceAudioUrl,
      user_message: voiceQuotaMessage
    }
  }
}

const hasReachedMessageLimit = (input: {
  unlimitedMessages: boolean
  used: number
  reserved: number
  limit: number
}) => {
  if (input.unlimitedMessages) {
    return false
  }
  return input.used + input.reserved >= input.limit
}

const hasReachedVoiceLimit = (input: {
  voiceEnabled: boolean
  unlimitedVoice: boolean
  used: number
  reserved: number
  limit: number | null
}) => {
  if (!input.voiceEnabled || input.unlimitedVoice) {
    return false
  }
  if (input.limit === null) {
    return false
  }
  return input.used + input.reserved >= input.limit
}

const buildQuotaExceededData = (input: {
  userId: string
  tierCode: string
  periodEnd: Date
  messageLimit: number
  messageUsed: number
  messageReserved: number
  unlimitedMessages: boolean
  voiceEnabled: boolean
  voiceLimit: number | null
  voiceUsed: number
  voiceReserved: number
  unlimitedVoice: boolean
}) =>
  buildQuotaSnapshotData({
    userId: input.userId,
    tierCode: input.tierCode,
    periodEnd: input.periodEnd,
    messageLimit: input.messageLimit,
    messageUsed: input.messageUsed,
    messageReserved: input.messageReserved,
    unlimitedMessages: input.unlimitedMessages,
    voiceEnabled: input.voiceEnabled,
    voiceLimit: input.voiceLimit,
    voiceUsed: input.voiceUsed,
    voiceReserved: input.voiceReserved,
    unlimitedVoice: input.unlimitedVoice,
    voiceRequested: false,
    voiceAllowed: false,
    voiceStatus: 'not_requested',
    voiceAudioUrl: null,
    exhaustionReason: 'message_quota_exhausted'
  })

const buildVoiceQuotaExceededData = (input: {
  userId: string
  tierCode: string
  periodEnd: Date
  messageLimit: number
  messageUsed: number
  messageReserved: number
  unlimitedMessages: boolean
  voiceEnabled: boolean
  voiceLimit: number | null
  voiceUsed: number
  voiceReserved: number
  unlimitedVoice: boolean
  voiceStatus: Extract<VoiceStatus, 'disabled' | 'quota_exhausted'>
}) =>
  buildQuotaSnapshotData({
    userId: input.userId,
    tierCode: input.tierCode,
    periodEnd: input.periodEnd,
    messageLimit: input.messageLimit,
    messageUsed: input.messageUsed,
    messageReserved: input.messageReserved,
    unlimitedMessages: input.unlimitedMessages,
    voiceEnabled: input.voiceEnabled,
    voiceLimit: input.voiceLimit,
    voiceUsed: input.voiceUsed,
    voiceReserved: input.voiceReserved,
    unlimitedVoice: input.unlimitedVoice,
    voiceRequested: true,
    voiceAllowed: false,
    voiceStatus: input.voiceStatus,
    voiceAudioUrl: null,
    exhaustionReason: 'voice_quota_exhausted'
  })

const buildQuotaAllowedData = (input: {
  userId: string
  tierCode: string
  periodEnd: Date
  messageLimit: number
  messageUsed: number
  messageReserved: number
  unlimitedMessages: boolean
  voiceEnabled: boolean
  voiceLimit: number | null
  voiceUsed: number
  voiceReserved: number
  unlimitedVoice: boolean
  voiceRequested: boolean
  voiceAllowed: boolean
  voiceStatus: VoiceStatus
  voiceAudioUrl: string | null
}) =>
  buildQuotaSnapshotData({
    userId: input.userId,
    tierCode: input.tierCode,
    periodEnd: input.periodEnd,
    messageLimit: input.messageLimit,
    messageUsed: input.messageUsed,
    messageReserved: input.messageReserved,
    unlimitedMessages: input.unlimitedMessages,
    voiceEnabled: input.voiceEnabled,
    voiceLimit: input.voiceLimit,
    voiceUsed: input.voiceUsed,
    voiceReserved: input.voiceReserved,
    unlimitedVoice: input.unlimitedVoice,
    voiceRequested: input.voiceRequested,
    voiceAllowed: input.voiceAllowed,
    voiceStatus: input.voiceStatus,
    voiceAudioUrl: input.voiceAudioUrl,
    exhaustionReason: null
  })

const buildQuotaSnapshotForUser = async (
  userId: string,
  input?: {
    voiceRequested?: boolean
    voiceStatus?: VoiceStatus
    voiceAudioUrl?: string | null
    requestIdToExclude?: string
  }
) => {
  const tierQuota = await resolveTierQuotaForUser(userId)
  const quotaPeriod = await resolveCurrentQuotaPeriod(userId, tierQuota)
  const usageSnapshot = await getEffectiveUsageForPeriod(userId, quotaPeriod.periodStart, quotaPeriod.periodEnd)
  const reservedCounts = await getReservedCountsForPeriod(userId, quotaPeriod.periodStart, input?.requestIdToExclude)
  const voiceRequested = input?.voiceRequested === true
  const voiceQuotaReached = hasReachedVoiceLimit({
    voiceEnabled: tierQuota.voiceEnabled,
    unlimitedVoice: tierQuota.unlimitedVoice,
    used: usageSnapshot.effectiveVoiceUsed,
    reserved: reservedCounts.voiceReserved,
    limit: tierQuota.voiceLimit
  })
  const voiceAllowed = voiceRequested && tierQuota.voiceEnabled && !voiceQuotaReached
  const voiceStatus: VoiceStatus =
    input?.voiceStatus ??
    (!voiceRequested
      ? 'not_requested'
      : !tierQuota.voiceEnabled
      ? 'disabled'
      : voiceQuotaReached
      ? 'quota_exhausted'
      : 'not_generated')

  return buildQuotaAllowedData({
    userId,
    tierCode: tierQuota.tierCode,
    periodEnd: quotaPeriod.periodEnd,
    messageLimit: tierQuota.limit,
    messageUsed: usageSnapshot.effectiveMessagesUsed,
    messageReserved: reservedCounts.messageReserved,
    unlimitedMessages: tierQuota.unlimitedMessages,
    voiceEnabled: tierQuota.voiceEnabled,
    voiceLimit: tierQuota.voiceLimit,
    voiceUsed: usageSnapshot.effectiveVoiceUsed,
    voiceReserved: reservedCounts.voiceReserved,
    unlimitedVoice: tierQuota.unlimitedVoice,
    voiceRequested,
    voiceAllowed,
    voiceStatus,
    voiceAudioUrl: input?.voiceAudioUrl ?? null
  })
}

const buildQuotaDeniedDetails = (quotaKind: QuotaKind, quota: Record<string, unknown>) => ({
  quota_kind: quotaKind,
  quota
})

const setQuotaUsageForCurrentPeriod = async (
  userId: string,
  input: {
    messagesUsed?: number
    voiceMessagesUsed?: number
  }
) => {
  const tierQuota = await resolveTierQuotaForUser(userId)
  const quotaPeriod = await resolveCurrentQuotaPeriod(userId, tierQuota)
  const usageRecord = await getOrCreateUsageRecord(userId, quotaPeriod.periodStart, quotaPeriod.periodEnd)
  const updated = await prisma.chatMessageUsage.update({
    where: {
      id: usageRecord.id
    },
    data: {
      ...(input.messagesUsed !== undefined ? { messagesUsed: Math.max(0, input.messagesUsed) } : {}),
      ...(input.voiceMessagesUsed !== undefined ? { voiceMessagesUsed: Math.max(0, input.voiceMessagesUsed) } : {})
    }
  })

  return {
    usageRecordId: updated.id,
    periodStart: quotaPeriod.periodStart,
    periodEnd: quotaPeriod.periodEnd,
    messagesUsed: updated.messagesUsed,
    voiceMessagesUsed: updated.voiceMessagesUsed
  }
}

export {
  buildQuotaAllowedData,
  buildQuotaDeniedDetails,
  buildQuotaExceededData,
  buildQuotaSnapshotForUser,
  buildVoiceQuotaExceededData,
  getEffectiveUsageForPeriod,
  getReservedCountsForPeriod,
  getTranscriptUsageDiagnosticsForPeriod,
  hasReachedMessageLimit,
  hasReachedVoiceLimit,
  setQuotaUsageForCurrentPeriod
}
export type { QuotaExhaustionReason, QuotaKind, VoiceStatus }
