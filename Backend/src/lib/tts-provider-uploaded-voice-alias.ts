import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import path from 'node:path'
import { prisma } from './prisma'
import { classifyPrismaDatabasePressureError } from './prisma-database-pressure'
import {
  reportPrismaEngineFatalError,
  type ReportPrismaEngineFatalErrorInput
} from './prisma-engine-fatal-reporter'
import type { PrismaEngineFatalClassification } from './prisma-engine-fatal-error'
import { calculateDatabasePressureBackoffMs } from './database-workload-policy'
import { postgresTimestamptzValue } from './database/postgres-sql'
import { buildTtsProviderHttpUrl, readTtsProviderBearerToken } from './tts-provider-config'
import { normalizeUploadRelativePath, resolveUploadPath } from './upload-paths'

type ProviderUploadedVoiceAliasStatus = 'pending' | 'ready' | 'failed' | 'refreshing'

type ProviderUploadedVoiceAliasRow = {
  id: string
  uploadedRelativePath: string
  fileSignature: string
  providerAlias: string
  providerVoiceRefPath: string
  status: ProviderUploadedVoiceAliasStatus
  attemptCount: number
  lastAttemptAt: Date | string | null
  nextRetryAt: Date | string | null
  lastError: string | null
  leaseOwner: string | null
  leaseExpiresAt: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string
}

type RuntimeProviderUploadedVoiceAlias = {
  id: string
  providerAlias: string
  providerVoiceRefPath: string
}

type ProviderUploadedVoiceWorkerBackoffState = {
  getBackoffUntilMs: () => number
  recordCleanTick: () => void
  recordDatabasePressure: () => void
  shouldSkipTick: () => boolean
}

type ProviderUploadedVoiceWorkerBackoffStateInput = {
  calculateBackoffMs?: (attemptCount: number) => number
  nowMs?: () => number
}

type ProviderUploadedVoiceDatabaseWorkRunner = <T>(
  operationName: string,
  work: () => Promise<T>
) => Promise<T | null>

type ProviderUploadedVoiceFatalReporter = (
  input: ReportPrismaEngineFatalErrorInput
) => PrismaEngineFatalClassification | null

type ProviderUploadedVoiceRegistrationFailureResult = 'recorded_failure' | 'fatal_prisma_engine_panic'

const PROVIDER_UPLOAD_TIMEOUT_MS = 30_000
const PROVIDER_UPLOAD_MAX_BYTES = 25 * 1024 * 1024
const REGISTRATION_RETRY_DELAY_MS = 60_000
const WORKER_INTERVAL_MS = 10_000
const WORKER_LEASE_MS = 45_000
const MAX_DUE_REGISTRATIONS_PER_TICK = 3
const uploadedVoiceTimestamp = postgresTimestamptzValue

let bProviderUploadedVoiceWorkerStarted = false
let bProviderUploadedVoiceWorkerRunning = false
let workerTimer: ReturnType<typeof setInterval> | null = null

const createProviderUploadedVoiceWorkerBackoffState = (
  input: ProviderUploadedVoiceWorkerBackoffStateInput = {}
): ProviderUploadedVoiceWorkerBackoffState => {
  const nowMs = input.nowMs ?? Date.now
  const calculateBackoffMs = input.calculateBackoffMs ?? calculateDatabasePressureBackoffMs
  let pressureAttemptCount = 0
  let backoffUntilMs = 0

  return {
    getBackoffUntilMs: () => backoffUntilMs,
    recordCleanTick: () => {
      pressureAttemptCount = 0
      backoffUntilMs = 0
    },
    recordDatabasePressure: () => {
      backoffUntilMs = nowMs() + calculateBackoffMs(pressureAttemptCount)
      pressureAttemptCount += 1
    },
    shouldSkipTick: () => nowMs() < backoffUntilMs
  }
}

const uploadedVoiceWorkerBackoff = createProviderUploadedVoiceWorkerBackoffState()

class ProviderUploadedVoiceRegistrationError extends Error {
  constructor(
    public readonly code:
      | 'UPLOADED_VOICE_ALIAS_REGISTRATION_FAILED'
      | 'UPLOADED_VOICE_NOT_READY'
      | 'UPLOADED_VOICE_REGISTRATION_FAILED',
    message: string
  ) {
    super(message)
    this.name = 'ProviderUploadedVoiceRegistrationError'
  }
}

const toDateOrNull = (value: Date | string | null) => {
  if (!value) {
    return null
  }

  return value instanceof Date ? value : new Date(value)
}

const sanitizeRegistrationError = (error: unknown) => {
  const rawMessage = error instanceof Error ? error.message : String(error)
  return rawMessage.replace(/\b(Bearer\s+)[a-z0-9._~+/-]+=*/gi, '$1[REDACTED]').slice(0, 1000)
}

const buildUploadedVoiceAlias = (relativePath: string, fileSignature: string) => {
  const hash = createHash('sha256').update(`${relativePath}:${fileSignature}`).digest('hex').slice(0, 40)
  return `secretwaifu_upload_${hash}`
}

const readFileSignature = async (absolutePath: string) => {
  const stat = await fsp.stat(absolutePath)
  if (!stat.isFile()) {
    throw new ProviderUploadedVoiceRegistrationError(
      'UPLOADED_VOICE_ALIAS_REGISTRATION_FAILED',
      'Uploaded voice reference is not a file.'
    )
  }

  if (stat.size > PROVIDER_UPLOAD_MAX_BYTES) {
    throw new ProviderUploadedVoiceRegistrationError(
      'UPLOADED_VOICE_ALIAS_REGISTRATION_FAILED',
      'Uploaded voice exceeds the provider registration limit (25 MiB).'
    )
  }

  return `${stat.size}:${Math.trunc(stat.mtimeMs)}`
}

const getUploadTarget = async (relativePath: string) => {
  const normalizedRelativePath = normalizeUploadRelativePath(relativePath)
  if (!normalizedRelativePath) {
    throw new ProviderUploadedVoiceRegistrationError(
      'UPLOADED_VOICE_ALIAS_REGISTRATION_FAILED',
      'Uploaded voice reference path is invalid.'
    )
  }

  const absolutePath = resolveUploadPath(normalizedRelativePath)
  if (!absolutePath) {
    throw new ProviderUploadedVoiceRegistrationError(
      'UPLOADED_VOICE_ALIAS_REGISTRATION_FAILED',
      'Uploaded voice reference path is outside the upload root.'
    )
  }

  const fileSignature = await readFileSignature(absolutePath)
  const providerAlias = buildUploadedVoiceAlias(normalizedRelativePath, fileSignature)

  return {
    normalizedRelativePath,
    absolutePath,
    fileSignature,
    providerAlias
  }
}

const findRegistrationByRelativePath = async (relativePath: string) => {
  const rows = await prisma.$queryRaw<ProviderUploadedVoiceAliasRow[]>`
    SELECT * FROM "TtsProviderUploadedVoiceAlias"
    WHERE "uploadedRelativePath" = ${relativePath}
    LIMIT 1
  `
  return rows[0] ?? null
}

const findRegistrationById = async (id: string) => {
  const rows = await prisma.$queryRaw<ProviderUploadedVoiceAliasRow[]>`
    SELECT * FROM "TtsProviderUploadedVoiceAlias"
    WHERE "id" = ${id}
    LIMIT 1
  `
  return rows[0] ?? null
}

const findDueRegistrations = async (limit: number) => {
  const now = new Date()
  return prisma.$queryRaw<ProviderUploadedVoiceAliasRow[]>`
    SELECT * FROM "TtsProviderUploadedVoiceAlias"
    WHERE "status" IN ('pending', 'refreshing', 'failed')
      AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= ${uploadedVoiceTimestamp(now)})
      AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= ${uploadedVoiceTimestamp(now)})
    ORDER BY "updatedAt" ASC
    LIMIT ${limit}
  `
}

const upsertRegistration = async (input: {
  normalizedRelativePath: string
  fileSignature: string
  providerAlias: string
}) => {
  const id = randomUUID()
  const now = new Date()

  await prisma.$executeRaw`
    INSERT INTO "TtsProviderUploadedVoiceAlias" (
      "id",
      "uploadedRelativePath",
      "fileSignature",
      "providerAlias",
      "providerVoiceRefPath",
      "status",
      "attemptCount",
      "nextRetryAt",
      "lastError",
      "leaseOwner",
      "leaseExpiresAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${input.normalizedRelativePath},
      ${input.fileSignature},
      ${input.providerAlias},
      ${input.providerAlias},
      'pending',
      0,
      ${uploadedVoiceTimestamp(now)},
      NULL,
      NULL,
      NULL,
      ${uploadedVoiceTimestamp(now)},
      ${uploadedVoiceTimestamp(now)}
    )
    ON CONFLICT ("uploadedRelativePath") DO UPDATE SET
      "fileSignature" = excluded."fileSignature",
      "providerAlias" = excluded."providerAlias",
      "providerVoiceRefPath" = excluded."providerVoiceRefPath",
      "status" = CASE
        WHEN "TtsProviderUploadedVoiceAlias"."fileSignature" = excluded."fileSignature"
          AND "TtsProviderUploadedVoiceAlias"."status" = 'ready'
        THEN "TtsProviderUploadedVoiceAlias"."status"
        ELSE 'pending'
      END,
      "attemptCount" = CASE
        WHEN "TtsProviderUploadedVoiceAlias"."fileSignature" = excluded."fileSignature"
        THEN "TtsProviderUploadedVoiceAlias"."attemptCount"
        ELSE 0
      END,
      "nextRetryAt" = CASE
        WHEN "TtsProviderUploadedVoiceAlias"."fileSignature" = excluded."fileSignature"
          AND "TtsProviderUploadedVoiceAlias"."status" = 'ready'
        THEN "TtsProviderUploadedVoiceAlias"."nextRetryAt"
        ELSE ${uploadedVoiceTimestamp(now)}
      END,
      "lastError" = CASE
        WHEN "TtsProviderUploadedVoiceAlias"."fileSignature" = excluded."fileSignature"
        THEN "TtsProviderUploadedVoiceAlias"."lastError"
        ELSE NULL
      END,
      "leaseOwner" = NULL,
      "leaseExpiresAt" = NULL,
      "updatedAt" = ${uploadedVoiceTimestamp(now)}
  `

  const row = await findRegistrationByRelativePath(input.normalizedRelativePath)
  if (!row) {
    throw new ProviderUploadedVoiceRegistrationError(
      'UPLOADED_VOICE_ALIAS_REGISTRATION_FAILED',
      'Uploaded voice registration could not be persisted.'
    )
  }
  return row
}

const createFileBlob = async (absolutePath: string) => {
  const fsWithOpenAsBlob = fs as typeof fs & {
    openAsBlob?: (path: string, options?: { type?: string }) => Promise<Blob>
  }

  if (typeof fsWithOpenAsBlob.openAsBlob === 'function') {
    return fsWithOpenAsBlob.openAsBlob(absolutePath, { type: 'audio/wav' })
  }

  const buffer = await fsp.readFile(absolutePath)
  return new Blob([buffer], { type: 'audio/wav' })
}

const postVoiceAliasUpload = async (absolutePath: string, alias: string) => {
  await readFileSignature(absolutePath)

  const uploadUrl = buildTtsProviderHttpUrl('/tts/upload-voice/')
  if (!uploadUrl) {
    throw new Error('TTS provider HTTP upload endpoint is not configured.')
  }

  const formData = new FormData()
  formData.append('file', await createFileBlob(absolutePath), path.basename(absolutePath))
  formData.append('alias', alias)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVIDER_UPLOAD_TIMEOUT_MS)

  try {
    const bearerToken = readTtsProviderBearerToken()
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: bearerToken
        ? {
            Authorization: `Bearer ${bearerToken}`
          }
        : undefined,
      body: formData,
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`TTS provider voice upload failed with HTTP ${response.status}.`)
    }
  } finally {
    clearTimeout(timeout)
  }
}

const markRegistrationAttemptStarted = async (row: ProviderUploadedVoiceAliasRow, workerId: string) => {
  const now = new Date()
  const leaseExpiresAt = new Date(now.getTime() + WORKER_LEASE_MS)

  const updated = await prisma.$executeRaw`
    UPDATE "TtsProviderUploadedVoiceAlias"
    SET "status" = 'refreshing',
        "leaseOwner" = ${workerId},
        "leaseExpiresAt" = ${uploadedVoiceTimestamp(leaseExpiresAt)},
        "updatedAt" = ${uploadedVoiceTimestamp(now)}
    WHERE "id" = ${row.id}
      AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= ${uploadedVoiceTimestamp(now)} OR "leaseOwner" = ${workerId})
  `

  return Number(updated) > 0
}

const markRegistrationReady = async (row: ProviderUploadedVoiceAliasRow) => {
  const now = new Date()
  await prisma.$executeRaw`
    UPDATE "TtsProviderUploadedVoiceAlias"
    SET "status" = 'ready',
        "providerVoiceRefPath" = ${row.providerAlias},
        "lastAttemptAt" = ${uploadedVoiceTimestamp(now)},
        "nextRetryAt" = NULL,
        "lastError" = NULL,
        "leaseOwner" = NULL,
        "leaseExpiresAt" = NULL,
        "updatedAt" = ${uploadedVoiceTimestamp(now)}
    WHERE "id" = ${row.id}
  `
}

const markRegistrationFailed = async (row: ProviderUploadedVoiceAliasRow, error: unknown) => {
  const now = new Date()
  const nextRetryAt = new Date(now.getTime() + REGISTRATION_RETRY_DELAY_MS)
  const nextAttemptCount = Number(row.attemptCount ?? 0) + 1

  await prisma.$executeRaw`
    UPDATE "TtsProviderUploadedVoiceAlias"
    SET "status" = 'failed',
        "attemptCount" = ${nextAttemptCount},
        "lastAttemptAt" = ${uploadedVoiceTimestamp(now)},
        "nextRetryAt" = ${uploadedVoiceTimestamp(nextRetryAt)},
        "lastError" = ${sanitizeRegistrationError(error)},
        "leaseOwner" = NULL,
        "leaseExpiresAt" = NULL,
        "updatedAt" = ${uploadedVoiceTimestamp(now)}
    WHERE "id" = ${row.id}
  `
}

const handleProviderUploadedVoiceRegistrationFailure = async (input: {
  row: ProviderUploadedVoiceAliasRow
  error: unknown
  databaseWork: ProviderUploadedVoiceDatabaseWorkRunner
  onDatabasePressure?: () => void
  fatalReporter?: ProviderUploadedVoiceFatalReporter
  logger?: Pick<Console, 'warn'>
}): Promise<ProviderUploadedVoiceRegistrationFailureResult> => {
  const fatalReporter = input.fatalReporter ?? reportPrismaEngineFatalError
  const fatalClassification = fatalReporter({
    error: input.error,
    source: 'handled_background',
    logContext: {
      component: 'tts-provider-uploaded-voice-alias',
      operation: 'process_registration_row',
      registrationId: input.row.id,
      uploadedRelativePath: input.row.uploadedRelativePath,
      status: input.row.status
    }
  })
  if (fatalClassification) {
    // The Prisma engine is already invalid. Persisting another failure row
    // would reuse the crashed engine and delay the supervisor restart.
    return 'fatal_prisma_engine_panic'
  }

  if (classifyPrismaDatabasePressureError(input.error)) {
    input.onDatabasePressure?.()
  }

  await input.databaseWork(
    'mark_failed',
    () => markRegistrationFailed(input.row, input.error)
  )
  const logger = input.logger ?? console
  logger.warn('[tts] Uploaded voice provider registration failed.', {
    relativePath: input.row.uploadedRelativePath,
    status: input.row.status,
    error: sanitizeRegistrationError(input.error)
  })
  return 'recorded_failure'
}

const processRegistrationRow = async (
  row: ProviderUploadedVoiceAliasRow,
  options: {
    databaseWork?: ProviderUploadedVoiceDatabaseWorkRunner
    force?: boolean
    onDatabasePressure?: () => void
  } = {}
) => {
  const workerId = `provider-voice-${process.pid}-${randomUUID()}`
  const databaseWork = options.databaseWork ?? (async (_operationName, work) => work())
  const locked = await databaseWork(
    'mark_attempt_started',
    () => markRegistrationAttemptStarted(row, workerId)
  )
  if (!locked) {
    return null
  }

  try {
    const target = await getUploadTarget(row.uploadedRelativePath)
    if (!options?.force && row.status === 'ready' && row.fileSignature === target.fileSignature) {
      return row
    }

    if (row.fileSignature !== target.fileSignature || row.providerAlias !== target.providerAlias) {
      const updatedRow = await databaseWork(
        'upsert_registration',
        () => upsertRegistration({
          normalizedRelativePath: target.normalizedRelativePath,
          fileSignature: target.fileSignature,
          providerAlias: target.providerAlias
        })
      )
      if (!updatedRow) {
        return null
      }
      row = updatedRow

      const refreshedLock = await databaseWork(
        'mark_refreshed_attempt_started',
        () => markRegistrationAttemptStarted(row, workerId)
      )
      if (!refreshedLock) {
        return null
      }
    }

    await postVoiceAliasUpload(target.absolutePath, target.providerAlias)
    const markedReady = await databaseWork(
      'mark_ready',
      () => markRegistrationReady({
        ...row,
        providerAlias: target.providerAlias,
        providerVoiceRefPath: target.providerAlias
      })
    )
    if (markedReady === null) {
      return null
    }

    return databaseWork(
      'find_registered_alias',
      () => findRegistrationByRelativePath(target.normalizedRelativePath)
    )
  } catch (error) {
    await handleProviderUploadedVoiceRegistrationFailure({
      row,
      error,
      databaseWork,
      onDatabasePressure: options.onDatabasePressure
    })
    return null
  }
}

const runProviderUploadedVoiceRegistrationWorkerTick = async () => {
  if (bProviderUploadedVoiceWorkerRunning) {
    return
  }

  if (uploadedVoiceWorkerBackoff.shouldSkipTick()) {
    return
  }

  bProviderUploadedVoiceWorkerRunning = true
  let bDatabasePressureDetected = false
  try {
    const rows = await findDueRegistrations(MAX_DUE_REGISTRATIONS_PER_TICK)

    for (const row of rows) {
      await processRegistrationRow(row, {
        databaseWork: async (_operationName, work) => work(),
        onDatabasePressure: () => {
          bDatabasePressureDetected = true
          uploadedVoiceWorkerBackoff.recordDatabasePressure()
        }
      })
    }

    if (!bDatabasePressureDetected) {
      uploadedVoiceWorkerBackoff.recordCleanTick()
    }
  } catch (error) {
    const fatalClassification = reportPrismaEngineFatalError({
      error,
      source: 'handled_background',
      logContext: {
        component: 'tts-provider-uploaded-voice-alias',
        operation: 'worker_tick'
      }
    })
    if (fatalClassification) {
      return
    }

    if (classifyPrismaDatabasePressureError(error)) {
      uploadedVoiceWorkerBackoff.recordDatabasePressure()
    }
    console.warn('[tts] Uploaded voice provider registration worker failed.', sanitizeRegistrationError(error))
  } finally {
    bProviderUploadedVoiceWorkerRunning = false
  }
}

const scheduleProviderUploadedVoiceRegistrationWorker = () => {
  setTimeout(() => {
    void runProviderUploadedVoiceRegistrationWorkerTick()
  }, 0)
}

/**
 * Starts the process-local dispatcher that turns trusted SecretWaifu uploads
 * into provider aliases before Unity asks for TTS. Registration state is
 * persisted by Prisma, so this worker is only an executor; the durable
 * record is the source of truth after restarts.
 */
const startProviderUploadedVoiceRegistrationWorker = () => {
  if (bProviderUploadedVoiceWorkerStarted) {
    return
  }

  bProviderUploadedVoiceWorkerStarted = true
  scheduleProviderUploadedVoiceRegistrationWorker()
  workerTimer = setInterval(() => {
    void runProviderUploadedVoiceRegistrationWorkerTick()
  }, WORKER_INTERVAL_MS)
  workerTimer.unref?.()
}

const enqueueUploadedVoiceProviderRegistration = async (relativePath: string) => {
  const target = await getUploadTarget(relativePath)
  const row = await upsertRegistration({
    normalizedRelativePath: target.normalizedRelativePath,
    fileSignature: target.fileSignature,
    providerAlias: target.providerAlias
  })

  if (row.status !== 'ready') {
    scheduleProviderUploadedVoiceRegistrationWorker()
  }

  return row
}

const resolveUploadedVoiceProviderAliasForRuntime = async (
  relativePath: string
): Promise<RuntimeProviderUploadedVoiceAlias> => {
  const row = await enqueueUploadedVoiceProviderRegistration(relativePath)

  if (row.status === 'ready') {
    return {
      id: row.id,
      providerAlias: row.providerAlias,
      providerVoiceRefPath: row.providerVoiceRefPath
    }
  }

  if (row.status === 'failed') {
    const nextRetryAt = toDateOrNull(row.nextRetryAt)
    throw new ProviderUploadedVoiceRegistrationError(
      'UPLOADED_VOICE_REGISTRATION_FAILED',
      nextRetryAt
        ? `Uploaded voice is not ready for TTS yet. Provider registration will retry after ${nextRetryAt.toISOString()}.`
        : 'Uploaded voice provider registration failed.'
    )
  }

  throw new ProviderUploadedVoiceRegistrationError(
    'UPLOADED_VOICE_NOT_READY',
    'Uploaded voice is still being prepared for TTS. Try again shortly.'
  )
}

const forceRefreshUploadedVoiceProviderAlias = async (
  registrationId: string
): Promise<RuntimeProviderUploadedVoiceAlias> => {
  const row = await findRegistrationById(registrationId)
  if (!row) {
    throw new ProviderUploadedVoiceRegistrationError(
      'UPLOADED_VOICE_ALIAS_REGISTRATION_FAILED',
      'Uploaded voice provider registration no longer exists.'
    )
  }

  const refreshed = await processRegistrationRow(row, { force: true })
  if (!refreshed || refreshed.status !== 'ready') {
    throw new ProviderUploadedVoiceRegistrationError(
      'UPLOADED_VOICE_REGISTRATION_FAILED',
      'Uploaded voice provider alias could not be refreshed.'
    )
  }

  return {
    id: refreshed.id,
    providerAlias: refreshed.providerAlias,
    providerVoiceRefPath: refreshed.providerVoiceRefPath
  }
}

const deleteUploadedVoiceProviderRegistration = async (relativePath: string | null | undefined) => {
  const normalizedRelativePath = normalizeUploadRelativePath(relativePath)
  if (!normalizedRelativePath) {
    return
  }

  await prisma.$executeRaw`
    DELETE FROM "TtsProviderUploadedVoiceAlias"
    WHERE "uploadedRelativePath" = ${normalizedRelativePath}
  `
}

const getUploadedVoiceProviderRegistrationStatus = async (relativePath: string | null | undefined) => {
  const normalizedRelativePath = normalizeUploadRelativePath(relativePath)
  if (!normalizedRelativePath) {
    return null
  }

  const row = await findRegistrationByRelativePath(normalizedRelativePath)
  if (!row) {
    return null
  }

  return {
    id: row.id,
    uploadedRelativePath: row.uploadedRelativePath,
    providerAlias: row.providerAlias,
    providerVoiceRefPath: row.providerVoiceRefPath,
    status: row.status,
    attemptCount: Number(row.attemptCount ?? 0),
    lastAttemptAt: row.lastAttemptAt,
    nextRetryAt: row.nextRetryAt,
    lastError: row.lastError
  }
}

const clearUploadedVoiceAliasCacheForTests = async () => {
  if (workerTimer) {
    clearInterval(workerTimer)
    workerTimer = null
  }
  uploadedVoiceWorkerBackoff.recordCleanTick()
  bProviderUploadedVoiceWorkerStarted = false
  bProviderUploadedVoiceWorkerRunning = false
}

export {
  clearUploadedVoiceAliasCacheForTests,
  createProviderUploadedVoiceWorkerBackoffState,
  deleteUploadedVoiceProviderRegistration,
  enqueueUploadedVoiceProviderRegistration,
  forceRefreshUploadedVoiceProviderAlias,
  getUploadedVoiceProviderRegistrationStatus,
  handleProviderUploadedVoiceRegistrationFailure,
  PROVIDER_UPLOAD_MAX_BYTES,
  ProviderUploadedVoiceRegistrationError,
  resolveUploadedVoiceProviderAliasForRuntime,
  startProviderUploadedVoiceRegistrationWorker
}
export type { RuntimeProviderUploadedVoiceAlias }
