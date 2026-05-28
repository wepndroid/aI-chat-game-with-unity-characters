import { Prisma } from '@prisma/client'

import { postgresJsonbValue } from '../../lib/database/postgres-sql'
import { prisma } from '../../lib/prisma'

type UnitySessionState = {
  sessionId: string
  metadataVersion: number
  metadata: Record<string, unknown>
}

type UnitySessionStateRow = {
  sessionId: string
  metadataVersion: number
  metadataJson: string
}

type PreparedUnitySessionStateUpsert = UnitySessionState & {
  userId: string
  metadataJson: string
}

type RawDb = Pick<Prisma.TransactionClient, '$executeRaw' | '$queryRaw'>

const MAX_METADATA_JSON_BYTES = 64 * 1024

const parseUnityMetadataJson = (value: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Return an empty object for corrupt historical rows; the authenticated
    // session boundary remains valid and Unity will overwrite with a clean
    // metadata snapshot on the next successful commit.
  }

  return {}
}

const buildUnitySessionMetadataJsonSql = (metadataJson: string) => postgresJsonbValue(metadataJson)

const getUnitySessionState = async (sessionId: string, db: RawDb = prisma): Promise<UnitySessionState> => {
  const rows = await db.$queryRaw<UnitySessionStateRow[]>`
    SELECT "sessionId", "metadataVersion", "metadataJson"::text AS "metadataJson"
    FROM "UnitySessionState"
    WHERE "sessionId" = ${sessionId}
    LIMIT 1
  `

  const row = rows[0]
  if (!row) {
    return {
      sessionId,
      metadataVersion: 1,
      metadata: {}
    }
  }

  return {
    sessionId,
    metadataVersion: row.metadataVersion,
    metadata: parseUnityMetadataJson(row.metadataJson)
  }
}

const prepareUnitySessionStateUpsert = (input: {
  sessionId: string
  userId: string
  metadataVersion: number
  metadata: Record<string, unknown>
}): PreparedUnitySessionStateUpsert => {
  if (!Number.isInteger(input.metadataVersion) || input.metadataVersion < 1) {
    throw new Error('Unity metadata_version must be a positive integer.')
  }

  const metadata = input.metadata ?? {}
  const metadataJson = JSON.stringify(metadata)
  const byteLength = Buffer.byteLength(metadataJson, 'utf8')
  if (byteLength > MAX_METADATA_JSON_BYTES) {
    throw new Error(`Unity metadata exceeds ${MAX_METADATA_JSON_BYTES} bytes.`)
  }

  return {
    sessionId: input.sessionId,
    userId: input.userId,
    metadataVersion: input.metadataVersion,
    metadataJson,
    metadata
  }
}

const upsertPreparedUnitySessionState = async (
  db: RawDb,
  preparedState: PreparedUnitySessionStateUpsert
): Promise<UnitySessionState> => {
  await db.$executeRaw`
    INSERT INTO "UnitySessionState" ("sessionId", "userId", "metadataVersion", "metadataJson", "createdAt", "updatedAt")
    VALUES (${preparedState.sessionId}, ${preparedState.userId}, ${preparedState.metadataVersion}, ${buildUnitySessionMetadataJsonSql(preparedState.metadataJson)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT("sessionId") DO UPDATE SET
      "userId" = excluded."userId",
      "metadataVersion" = excluded."metadataVersion",
      "metadataJson" = excluded."metadataJson",
      "updatedAt" = CURRENT_TIMESTAMP
  `

  return {
    sessionId: preparedState.sessionId,
    metadataVersion: preparedState.metadataVersion,
    metadata: preparedState.metadata
  }
}

/**
 * Stores the latest Unity-owned gameplay metadata snapshot. The backend treats
 * the payload as opaque game state, but validates version and size so commit
 * cannot become an unbounded storage sink.
 */
const upsertUnitySessionState = async (
  db: RawDb,
  input: {
    sessionId: string
    userId: string
    metadataVersion: number
    metadata: Record<string, unknown>
  }
): Promise<UnitySessionState> => {
  return upsertPreparedUnitySessionState(db, prepareUnitySessionStateUpsert(input))
}

export {
  buildUnitySessionMetadataJsonSql,
  getUnitySessionState,
  prepareUnitySessionStateUpsert,
  upsertPreparedUnitySessionState,
  upsertUnitySessionState
}
export type { PreparedUnitySessionStateUpsert, UnitySessionState }
