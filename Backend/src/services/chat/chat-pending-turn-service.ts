import { createHash, randomUUID } from 'node:crypto'
import { ChatQuotaReservationStatus, Prisma } from '@prisma/client'

import { postgresEnumValue, postgresJsonbValue, postgresTimestamptzValue } from '../../lib/database/postgres-sql'
import { prisma } from '../../lib/prisma'

type PendingTurnKind = 'normal' | 'gameplay'
type PendingTurnStatus = 'PENDING' | 'COMMITTED' | 'ABORTED' | 'EXPIRED'

type PendingTurnInput = {
  userId: string
  sessionId: string
  storyId: string
  kind: PendingTurnKind
  clientTurnId: string
  requestId: string
  requestFingerprint: string
  messageText?: string | null
  gameplayEventType?: string | null
  gameplayEventPayload?: Record<string, unknown> | null
  gameplayDisplayText?: string | null
  assistantText: string
  provider: string
  reservationId: string
  voiceRequested: boolean
  voiceConsumed: boolean
  voiceAudioUrl?: string | null
  voiceTaskId?: string | null
}

type PendingTurnRow = {
  id: string
  userId: string
  sessionId: string
  storyId: string
  kind: string
  clientTurnId: string
  requestId: string
  requestFingerprint: string
  messageText: string | null
  gameplayEventType: string | null
  gameplayEventPayloadJson: string | null
  gameplayDisplayText: string | null
  assistantText: string
  assistantSha256: string
  provider: string
  reservationId: string
  voiceRequested: boolean | number
  voiceConsumed: boolean | number
  voiceAudioUrl: string | null
  voiceTaskId: string | null
  status: string
  expiresAt: string | Date
  committedUserMessageId: string | null
  committedAssistantMessageId: string | null
  abortReason: string | null
  createdAt: string | Date
  updatedAt: string | Date
  committedAt: string | Date | null
  abortedAt: string | Date | null
  expiredAt: string | Date | null
}

type PendingTurn = {
  id: string
  userId: string
  sessionId: string
  storyId: string
  kind: PendingTurnKind
  clientTurnId: string
  requestId: string
  requestFingerprint: string
  messageText: string | null
  gameplayEventType: string | null
  gameplayEventPayload: Record<string, unknown>
  gameplayDisplayText: string | null
  assistantText: string
  assistantSha256: string
  provider: string
  reservationId: string
  voiceRequested: boolean
  voiceConsumed: boolean
  voiceAudioUrl: string | null
  voiceTaskId: string | null
  status: PendingTurnStatus
  expiresAt: Date
  committedUserMessageId: string | null
  committedAssistantMessageId: string | null
  abortReason: string | null
  createdAt: Date
  updatedAt: Date
  committedAt: Date | null
  abortedAt: Date | null
  expiredAt: Date | null
}

type RawDb = Pick<Prisma.TransactionClient, '$executeRaw' | '$queryRaw'>

const PENDING_TURN_TTL_MS = 10 * 60 * 1000

const toDate = (value: string | Date | null): Date | null => {
  if (value === null) {
    return null
  }
  return value instanceof Date ? value : new Date(value)
}

const toBoolean = (value: boolean | number) => value === true || value === 1

const parseObjectJson = (value: string | null): Record<string, unknown> => {
  if (!value) {
    return {}
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Malformed pending payloads are treated as empty payloads. The row still
    // belongs to its authenticated pending turn and commit/abort validation
    // remains authoritative.
  }

  return {}
}

const fromRow = (row: PendingTurnRow): PendingTurn => ({
  id: row.id,
  userId: row.userId,
  sessionId: row.sessionId,
  storyId: row.storyId,
  kind: row.kind === 'gameplay' ? 'gameplay' : 'normal',
  clientTurnId: row.clientTurnId,
  requestId: row.requestId,
  requestFingerprint: row.requestFingerprint,
  messageText: row.messageText,
  gameplayEventType: row.gameplayEventType,
  gameplayEventPayload: parseObjectJson(row.gameplayEventPayloadJson),
  gameplayDisplayText: row.gameplayDisplayText,
  assistantText: row.assistantText,
  assistantSha256: row.assistantSha256,
  provider: row.provider,
  reservationId: row.reservationId,
  voiceRequested: toBoolean(row.voiceRequested),
  voiceConsumed: toBoolean(row.voiceConsumed),
  voiceAudioUrl: row.voiceAudioUrl,
  voiceTaskId: row.voiceTaskId,
  status: row.status as PendingTurnStatus,
  expiresAt: toDate(row.expiresAt) ?? new Date(0),
  committedUserMessageId: row.committedUserMessageId,
  committedAssistantMessageId: row.committedAssistantMessageId,
  abortReason: row.abortReason,
  createdAt: toDate(row.createdAt) ?? new Date(0),
  updatedAt: toDate(row.updatedAt) ?? new Date(0),
  committedAt: toDate(row.committedAt),
  abortedAt: toDate(row.abortedAt),
  expiredAt: toDate(row.expiredAt)
})

const assistantSha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

const pendingTurnRowSelectSql = Prisma.sql`
  SELECT
    "id",
    "userId",
    "sessionId",
    "storyId",
    "kind",
    "clientTurnId",
    "requestId",
    "requestFingerprint",
    "messageText",
    "gameplayEventType",
    "gameplayEventPayloadJson"::text AS "gameplayEventPayloadJson",
    "gameplayDisplayText",
    "assistantText",
    "assistantSha256",
    "provider",
    "reservationId",
    "voiceRequested",
    "voiceConsumed",
    "voiceAudioUrl",
    "voiceTaskId",
    "status",
    "expiresAt",
    "committedUserMessageId",
    "committedAssistantMessageId",
    "abortReason",
    "createdAt",
    "updatedAt",
    "committedAt",
    "abortedAt",
    "expiredAt"
  FROM "ChatPendingTurn"
`

const buildChatPendingTurnGameplayPayloadSql = (payloadJson: string) => postgresJsonbValue(payloadJson)

const buildChatPendingTurnTimestampSql = (timestamp: Date) => postgresTimestamptzValue(timestamp)

const buildChatPendingTurnKindSql = (kind: PendingTurnKind) => postgresEnumValue(kind, 'ChatPendingTurnKind')

const buildChatPendingTurnStatusSql = (status: PendingTurnStatus) => postgresEnumValue(status, 'ChatPendingTurnStatus')

const findPendingTurnById = async (pendingTurnId: string, db: RawDb = prisma): Promise<PendingTurn | null> => {
  const rows = await db.$queryRaw<PendingTurnRow[]>`
    ${pendingTurnRowSelectSql}
    WHERE "id" = ${pendingTurnId}
    LIMIT 1
  `

  return rows[0] ? fromRow(rows[0]) : null
}

const findPendingTurnByRequest = async (
  userId: string,
  requestId: string,
  db: RawDb = prisma
): Promise<PendingTurn | null> => {
  const rows = await db.$queryRaw<PendingTurnRow[]>`
    ${pendingTurnRowSelectSql}
    WHERE "userId" = ${userId} AND "requestId" = ${requestId}
    LIMIT 1
  `

  return rows[0] ? fromRow(rows[0]) : null
}

const createPendingTurn = async (input: PendingTurnInput): Promise<PendingTurn> => {
  const id = randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + PENDING_TURN_TTL_MS)
  const gameplayPayloadJson = JSON.stringify(input.gameplayEventPayload ?? {})
  const hash = assistantSha256(input.assistantText)

  await prisma.$executeRaw`
    INSERT INTO "ChatPendingTurn" (
      "id",
      "userId",
      "sessionId",
      "storyId",
      "kind",
      "clientTurnId",
      "requestId",
      "requestFingerprint",
      "messageText",
      "gameplayEventType",
      "gameplayEventPayloadJson",
      "gameplayDisplayText",
      "assistantText",
      "assistantSha256",
      "provider",
      "reservationId",
      "voiceRequested",
      "voiceConsumed",
      "voiceAudioUrl",
      "voiceTaskId",
      "status",
      "expiresAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${input.userId},
      ${input.sessionId},
      ${input.storyId},
      ${buildChatPendingTurnKindSql(input.kind)},
      ${input.clientTurnId},
      ${input.requestId},
      ${input.requestFingerprint},
      ${input.messageText ?? null},
      ${input.gameplayEventType ?? null},
      ${buildChatPendingTurnGameplayPayloadSql(gameplayPayloadJson)},
      ${input.gameplayDisplayText ?? null},
      ${input.assistantText},
      ${hash},
      ${input.provider},
      ${input.reservationId},
      ${input.voiceRequested},
      ${input.voiceConsumed},
      ${input.voiceAudioUrl ?? null},
      ${input.voiceTaskId ?? null},
      ${buildChatPendingTurnStatusSql('PENDING')},
      ${buildChatPendingTurnTimestampSql(expiresAt)},
      ${buildChatPendingTurnTimestampSql(now)},
      ${buildChatPendingTurnTimestampSql(now)}
    )
  `

  const created = await findPendingTurnById(id)
  if (!created) {
    throw new Error('Pending turn insert did not return a row.')
  }

  return created
}

const markPendingTurnCommitted = async (
  db: RawDb,
  input: {
    pendingTurnId: string
    userMessageId: string
    assistantMessageId: string
  }
) => {
  const now = new Date()
  await db.$executeRaw`
    UPDATE "ChatPendingTurn"
    SET
      "status" = ${buildChatPendingTurnStatusSql('COMMITTED')},
      "committedUserMessageId" = ${input.userMessageId},
      "committedAssistantMessageId" = ${input.assistantMessageId},
      "committedAt" = ${buildChatPendingTurnTimestampSql(now)},
      "updatedAt" = ${buildChatPendingTurnTimestampSql(now)}
    WHERE "id" = ${input.pendingTurnId} AND "status" = ${buildChatPendingTurnStatusSql('PENDING')}
  `
}

const claimPendingTurnForCommit = async (db: RawDb, pendingTurnId: string): Promise<boolean> => {
  const now = new Date()
  const changed = await db.$executeRaw`
    UPDATE "ChatPendingTurn"
    SET "updatedAt" = ${buildChatPendingTurnTimestampSql(now)}
    WHERE "id" = ${pendingTurnId} AND "status" = ${buildChatPendingTurnStatusSql('PENDING')}
  `

  return changed === 1
}

const markPendingTurnAborted = async (
  db: RawDb,
  input: {
    pendingTurnId: string
    reason: string
  }
) => {
  const now = new Date()
  await db.$executeRaw`
    UPDATE "ChatPendingTurn"
    SET
      "status" = ${buildChatPendingTurnStatusSql('ABORTED')},
      "abortReason" = ${input.reason},
      "abortedAt" = ${buildChatPendingTurnTimestampSql(now)},
      "updatedAt" = ${buildChatPendingTurnTimestampSql(now)}
    WHERE "id" = ${input.pendingTurnId} AND "status" = ${buildChatPendingTurnStatusSql('PENDING')}
  `
}

/**
 * Marks a pending turn as having accepted at least one Unity-orchestrated TTS
 * segment. The chat route can create the pending row before all sentence chunks
 * have been requested, so `/api/tts/request` must be able to attach voice
 * accounting to the durable parent turn without creating transcript rows early.
 */
const markPendingTurnVoiceAccepted = async (
  db: RawDb,
  input: {
    pendingTurnId: string
    voiceTaskId: string
    consumeVoiceQuotaOnCommit: boolean
  }
) => {
  const now = new Date()
  await db.$executeRaw`
    UPDATE "ChatPendingTurn"
    SET
      "voiceRequested" = ${true},
      "voiceConsumed" = ${input.consumeVoiceQuotaOnCommit},
      "voiceTaskId" = CASE
        WHEN "voiceRequested" = ${false} THEN ${input.voiceTaskId}
        ELSE COALESCE("voiceTaskId", ${input.voiceTaskId})
      END,
      "updatedAt" = ${buildChatPendingTurnTimestampSql(now)}
    WHERE "id" = ${input.pendingTurnId}
      AND "status" = ${buildChatPendingTurnStatusSql('PENDING')}
      AND (
        "voiceRequested" = ${false}
        OR "voiceConsumed" <> ${input.consumeVoiceQuotaOnCommit}
        OR "voiceTaskId" IS NULL
      )
  `
}

/**
 * Clears pending-turn voice acceptance only when the durable row still points
 * at the failed voice task. This protects concurrent retry writes from being
 * reverted by stale rollback attempts.
 */
const rollbackPendingTurnVoiceAccepted = async (
  db: RawDb,
  input: {
    pendingTurnId: string
    failedVoiceTaskId: string
  }
) => {
  const now = new Date()
  await db.$executeRaw`
    UPDATE "ChatPendingTurn"
    SET
      "voiceRequested" = ${false},
      "voiceConsumed" = ${false},
      "voiceTaskId" = ${null},
      "updatedAt" = ${buildChatPendingTurnTimestampSql(now)}
    WHERE "id" = ${input.pendingTurnId}
      AND "status" = ${buildChatPendingTurnStatusSql('PENDING')}
      AND "voiceTaskId" = ${input.failedVoiceTaskId}
  `
}

/**
 * Releases stale pending turns. This is deliberately lazy and called by chat
 * entry points so normal production traffic repairs abandoned reservations even
 * when Unity crashed before it could call abort.
 */
const cleanupExpiredPendingTurnsForUser = async (userId: string) => {
  const now = new Date()
  const rows = await prisma.$queryRaw<Array<{ id: string; reservationId: string }>>`
    SELECT "id", "reservationId"
    FROM "ChatPendingTurn"
    WHERE "userId" = ${userId}
      AND "status" = ${buildChatPendingTurnStatusSql('PENDING')}
      AND "expiresAt" <= ${buildChatPendingTurnTimestampSql(now)}
  `

  for (const row of rows) {
    await prisma.$transaction(async (tx) => {
      await tx.chatQuotaReservation.updateMany({
        where: {
          id: row.reservationId,
          status: ChatQuotaReservationStatus.RESERVED
        },
        data: {
          status: ChatQuotaReservationStatus.RELEASED,
          releasedAt: now,
          errorReason: 'pending_turn_expired'
        }
      })

      await tx.$executeRaw`
        UPDATE "ChatPendingTurn"
        SET
          "status" = ${buildChatPendingTurnStatusSql('EXPIRED')},
          "expiredAt" = ${buildChatPendingTurnTimestampSql(now)},
          "updatedAt" = ${buildChatPendingTurnTimestampSql(now)}
        WHERE "id" = ${row.id} AND "status" = ${buildChatPendingTurnStatusSql('PENDING')}
      `
    })
  }
}

const hasActivePendingTurnForSession = async (input: { userId: string; sessionId: string }) => {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "ChatPendingTurn"
    WHERE "userId" = ${input.userId}
      AND "sessionId" = ${input.sessionId}
      AND "status" = ${buildChatPendingTurnStatusSql('PENDING')}
      AND "expiresAt" > ${buildChatPendingTurnTimestampSql(new Date())}
    LIMIT 1
  `

  return rows.length > 0
}

export {
  assistantSha256,
  buildChatPendingTurnGameplayPayloadSql,
  buildChatPendingTurnKindSql,
  buildChatPendingTurnStatusSql,
  claimPendingTurnForCommit,
  cleanupExpiredPendingTurnsForUser,
  createPendingTurn,
  findPendingTurnById,
  findPendingTurnByRequest,
  hasActivePendingTurnForSession,
  markPendingTurnAborted,
  markPendingTurnCommitted,
  markPendingTurnVoiceAccepted,
  rollbackPendingTurnVoiceAccepted,
  PENDING_TURN_TTL_MS
}
export type { PendingTurn, PendingTurnInput, PendingTurnKind, PendingTurnStatus }
