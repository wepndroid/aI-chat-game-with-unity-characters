import { randomUUID } from 'node:crypto'
import { prisma } from './prisma'
import { postgresEnumValue, postgresJsonbValue, postgresTimestamptzValue } from './database/postgres-sql'

type PatreonSyncLogLevel = 'INFO' | 'WARN' | 'ERROR'

type PatreonSyncLogRecord = {
  id: string
  userId: string
  source: string
  eventType: string
  level: PatreonSyncLogLevel
  message: string
  actorUserId: string | null
  actorLabel: string | null
  detailsJson: string | null
  createdAt: string | Date
}

type CreatePatreonSyncLogInput = {
  userId: string
  source: string
  eventType: string
  level?: PatreonSyncLogLevel
  message: string
  actorUserId?: string | null
  actorLabel?: string | null
  details?: unknown
}

const serializeDetails = (details: unknown) => {
  if (details === undefined) {
    return null
  }

  try {
    return JSON.stringify(details)
  } catch {
    return JSON.stringify({
      serializationError: true
    })
  }
}

const appendPatreonSyncLog = async (input: CreatePatreonSyncLogInput) => {
  const id = randomUUID()
  const createdAt = new Date()
  const level = input.level ?? 'INFO'
  const detailsJson = serializeDetails(input.details)

  await prisma.$executeRaw`
    INSERT INTO "PatreonSyncLog"
      ("id", "userId", "source", "eventType", "level", "message", "actorUserId", "actorLabel", "detailsJson", "createdAt")
    VALUES
      (${id}, ${input.userId}, ${input.source}, ${input.eventType}, ${postgresEnumValue(level, 'PatreonSyncLogLevel')}, ${input.message}, ${input.actorUserId ?? null}, ${input.actorLabel ?? null}, ${postgresJsonbValue(detailsJson)}, ${postgresTimestamptzValue(createdAt)})
  `
}

const safeParseDetailsJson = (value: string | null) => {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

const listPatreonSyncLogsForUser = async (userId: string, limit = 20) => {
  const rows = await prisma.$queryRaw<PatreonSyncLogRecord[]>`
    SELECT "id", "userId", "source", "eventType", "level", "message", "actorUserId", "actorLabel", "detailsJson"::text AS "detailsJson", "createdAt"
    FROM "PatreonSyncLog"
    WHERE "userId" = ${userId}
    ORDER BY "createdAt" DESC
    LIMIT ${Math.max(1, Math.min(limit, 100))}
  `

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    source: row.source,
    eventType: row.eventType,
    level: row.level,
    message: row.message,
    actorUserId: row.actorUserId,
    actorLabel: row.actorLabel,
    details: safeParseDetailsJson(row.detailsJson),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt
  }))
}

export { appendPatreonSyncLog, listPatreonSyncLogsForUser }
export type { PatreonSyncLogLevel }
