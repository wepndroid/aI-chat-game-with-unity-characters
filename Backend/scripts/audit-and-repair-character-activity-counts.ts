import 'dotenv/config'
import { ChatMessageRole, PrismaClient } from '@prisma/client'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const prisma = new PrismaClient()

const PRODUCTION_CONFIRMATION = 'repair-character-activity-counts'

type ParsedArgs = {
  apply: boolean
  confirm: string | null
  jsonPath: string | null
}

type SqlDateValue = Date | string | number | bigint

type CharacterCounterRow = {
  id: string
  name: string
  messageCount: number
  completedChatCount: number
}

type LegacyCharacterChatCountRow = {
  id: string
  chatCount: number
}

type TranscriptMessageRow = {
  id: string
  sessionId: string
  characterId: string
  role: string
  createdAt: SqlDateValue
}

type CompletedChatSessionRow = {
  sessionId: string
  characterId: string
  firstAssistantAt: SqlDateValue
}

type DailyMetricRow = {
  characterId: string
  day: SqlDateValue
  messageCount: number
  completedChatCount: number
}

type LegacyDailyMetricRow = {
  characterId: string
  day: SqlDateValue
  chatCount: number
}

type CounterChange = {
  characterId: string
  characterName: string
  current: number
  expected: number
  delta: number
}

type DailyMetricEntry = {
  characterId: string
  day: string
  currentMessageCount: number
  expectedMessageCount: number
  currentCompletedChatCount: number
  expectedCompletedChatCount: number
}

type ExpectedDailyMetric = {
  messageCount: number
  completedChatCount: number
}

type RepairReport = {
  generatedAt: string
  retainedTranscriptMessageCount: number
  missingMessageLedgerRowCount: number
  unprocessedMessageLedgerRowCount: number
  retainedCompletedSessionCount: number
  sessionsMissingCompletedLedger: number
  characterMessageCountChanges: CounterChange[]
  characterCompletedChatCountChanges: CounterChange[]
  dailyMetric: {
    currentRows: number
    expectedRows: number
    changedRows: DailyMetricEntry[]
  }
}

const parseArgs = (): ParsedArgs => {
  const args = process.argv.slice(2)
  const confirmArg = args.find((arg) => arg.startsWith('--confirm='))
  const jsonArg = args.find((arg) => arg.startsWith('--json='))

  return {
    apply: args.includes('--apply'),
    confirm: confirmArg ? confirmArg.slice('--confirm='.length) : null,
    jsonPath: jsonArg ? jsonArg.slice('--json='.length) : null
  }
}

const tableExists = async (tableName: string) => {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ${tableName}
    ) AS "exists"
  `
  return rows[0]?.exists ?? false
}

const columnExists = async (tableName: string, columnName: string) => {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS "exists"
  `
  return rows[0]?.exists ?? false
}

const toDateFromEpoch = (value: number | bigint) => {
  const numericValue = Number(value)
  const absoluteValue = Math.abs(numericValue)
  const milliseconds = absoluteValue < 10_000_000_000 ? numericValue * 1000 : numericValue
  return new Date(milliseconds)
}

const toDate = (value: SqlDateValue) => {
  if (value instanceof Date) {
    return value
  }

  if (typeof value === 'bigint' || typeof value === 'number') {
    const date = toDateFromEpoch(value)
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid numeric timestamp: ${String(value)}`)
    }
    return date
  }

  const trimmedValue = value.trim()
  const date = /^-?\d+$/.test(trimmedValue) ? toDateFromEpoch(Number(trimmedValue)) : new Date(trimmedValue)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${value}`)
  }
  return date
}

const toUtcDayStart = (date: Date) => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

const toDayKey = (characterId: string, day: SqlDateValue) => {
  return `${characterId}|${toUtcDayStart(toDate(day)).toISOString()}`
}

const parseDayKey = (key: string) => {
  const separatorIndex = key.indexOf('|')
  return {
    characterId: key.slice(0, separatorIndex),
    day: key.slice(separatorIndex + 1)
  }
}

const addToCountMap = (countMap: Map<string, number>, key: string, amount = 1) => {
  countMap.set(key, (countMap.get(key) ?? 0) + amount)
}

const loadRetainedTranscriptMessages = async () => {
  return prisma.$queryRaw<TranscriptMessageRow[]>`
    SELECT
      chat_message."id" AS "id",
      chat_message."sessionId" AS "sessionId",
      chat_session."characterId" AS "characterId",
      chat_message."role" AS "role",
      chat_message."createdAt" AS "createdAt"
    FROM "ChatMessage" AS chat_message
    INNER JOIN "ChatSession" AS chat_session ON chat_session."id" = chat_message."sessionId"
    WHERE chat_message."role" IN ('USER', 'ASSISTANT')
  `
}

const loadRetainedCompletedSessions = async () => {
  return prisma.$queryRaw<CompletedChatSessionRow[]>`
    SELECT
      chat_session."id" AS "sessionId",
      chat_session."characterId" AS "characterId",
      MIN(chat_message."createdAt") AS "firstAssistantAt"
    FROM "ChatSession" AS chat_session
    INNER JOIN "ChatMessage" AS chat_message ON chat_message."sessionId" = chat_session."id"
    WHERE chat_message."role" = 'ASSISTANT'
    GROUP BY chat_session."id", chat_session."characterId"
  `
}

const loadLegacyCharacterChatCounts = async () => {
  if (!(await columnExists('Character', 'chatCount'))) {
    return []
  }

  return prisma.$queryRaw<LegacyCharacterChatCountRow[]>`
    SELECT "id" AS "id", "chatCount" AS "chatCount"
    FROM "Character"
  `
}

const loadLegacyDailyCompletedChatCounts = async () => {
  if (!(await tableExists('CharacterChatDailyMetric'))) {
    return []
  }

  return prisma.$queryRaw<LegacyDailyMetricRow[]>`
    SELECT "characterId" AS "characterId", "day" AS "day", "chatCount" AS "chatCount"
    FROM "CharacterChatDailyMetric"
  `
}

const buildReport = async (): Promise<{
  report: RepairReport
  transcriptMessages: TranscriptMessageRow[]
  completedSessions: CompletedChatSessionRow[]
  expectedMessageCountByCharacterId: Map<string, number>
  expectedCompletedChatCountByCharacterId: Map<string, number>
  expectedDailyMetricByKey: Map<string, ExpectedDailyMetric>
  existingLedgerSessionIds: Set<string>
  existingMessageLedgerMessageIds: Set<string>
}> => {
  if (!(await tableExists('CharacterActivityDailyMetric')) || !(await tableExists('CharacterCompletedChatLedger'))) {
    throw new Error('Character activity tables are missing. Run Prisma migrations before running this repair.')
  }

  if (!(await tableExists('CharacterActivityMessageLedger'))) {
    throw new Error('Character activity message ledger table is missing. Run Prisma migrations before running this repair.')
  }

  const [
    characters,
    transcriptMessages,
    completedSessions,
    currentDailyRows,
    legacyCharacterChatCountRows,
    legacyDailyRows,
    ledgerRows,
    messageLedgerRows,
    unprocessedMessageLedgerRows
  ] = await Promise.all([
    prisma.$queryRaw<CharacterCounterRow[]>`
      SELECT
        "id" AS "id",
        "name" AS "name",
        "messageCount" AS "messageCount",
        "completedChatCount" AS "completedChatCount"
      FROM "Character"
    `,
    loadRetainedTranscriptMessages(),
    loadRetainedCompletedSessions(),
    prisma.characterActivityDailyMetric.findMany({
      select: {
        characterId: true,
        day: true,
        messageCount: true,
        completedChatCount: true
      }
    }),
    loadLegacyCharacterChatCounts(),
    loadLegacyDailyCompletedChatCounts(),
    prisma.characterCompletedChatLedger.findMany({
      select: {
        sessionId: true
      }
    }),
    prisma.characterActivityMessageLedger.findMany({
      select: {
        messageId: true
      }
    }),
    prisma.characterActivityMessageLedger.findMany({
      where: {
        processedAt: null
      },
      select: {
        messageId: true
      }
    })
  ])

  const characterById = new Map<string, CharacterCounterRow>(characters.map((character) => [character.id, character]))
  const existingLedgerSessionIds = new Set(ledgerRows.map((row) => row.sessionId))
  const existingMessageLedgerMessageIds = new Set(messageLedgerRows.map((row) => row.messageId))
  const legacyChatCountByCharacterId = new Map(
    legacyCharacterChatCountRows.map((row) => [row.id, Number(row.chatCount)])
  )

  const transcriptDailyMessageByKey = new Map<string, number>()
  for (const message of transcriptMessages) {
    addToCountMap(transcriptDailyMessageByKey, toDayKey(message.characterId, message.createdAt))
  }

  const completedSessionDailyByKey = new Map<string, number>()
  const completedSessionCountByCharacterId = new Map<string, number>()
  for (const session of completedSessions) {
    addToCountMap(completedSessionDailyByKey, toDayKey(session.characterId, session.firstAssistantAt))
    addToCountMap(completedSessionCountByCharacterId, session.characterId)
  }

  const legacyDailyCompletedByKey = new Map<string, number>()
  for (const legacyDailyRow of legacyDailyRows) {
    legacyDailyCompletedByKey.set(
      toDayKey(legacyDailyRow.characterId, legacyDailyRow.day),
      Number(legacyDailyRow.chatCount)
    )
  }

  const currentDailyByKey = new Map<string, ExpectedDailyMetric>()
  for (const row of currentDailyRows) {
    currentDailyByKey.set(toDayKey(row.characterId, row.day), {
      messageCount: row.messageCount,
      completedChatCount: row.completedChatCount
    })
  }

  const expectedDailyMetricByKey = new Map<string, ExpectedDailyMetric>()
  const allDailyKeys = new Set([
    ...currentDailyByKey.keys(),
    ...transcriptDailyMessageByKey.keys(),
    ...completedSessionDailyByKey.keys(),
    ...legacyDailyCompletedByKey.keys()
  ])

  for (const key of allDailyKeys) {
    const current = currentDailyByKey.get(key)
    expectedDailyMetricByKey.set(key, {
      messageCount: Math.max(current?.messageCount ?? 0, transcriptDailyMessageByKey.get(key) ?? 0),
      completedChatCount: Math.max(
        current?.completedChatCount ?? 0,
        completedSessionDailyByKey.get(key) ?? 0,
        legacyDailyCompletedByKey.get(key) ?? 0
      )
    })
  }

  const expectedMessageCountByCharacterId = new Map<string, number>()
  const dailyCompletedTotalByCharacterId = new Map<string, number>()
  for (const [key, expectedDailyMetric] of expectedDailyMetricByKey.entries()) {
    const parsedKey = parseDayKey(key)
    addToCountMap(expectedMessageCountByCharacterId, parsedKey.characterId, expectedDailyMetric.messageCount)
    addToCountMap(dailyCompletedTotalByCharacterId, parsedKey.characterId, expectedDailyMetric.completedChatCount)
  }

  const expectedCompletedChatCountByCharacterId = new Map<string, number>()
  for (const character of characters) {
    expectedMessageCountByCharacterId.set(
      character.id,
      Math.max(character.messageCount, expectedMessageCountByCharacterId.get(character.id) ?? 0)
    )
    expectedCompletedChatCountByCharacterId.set(
      character.id,
      Math.max(
        character.completedChatCount,
        legacyChatCountByCharacterId.get(character.id) ?? 0,
        completedSessionCountByCharacterId.get(character.id) ?? 0,
        dailyCompletedTotalByCharacterId.get(character.id) ?? 0
      )
    )
  }

  const characterMessageCountChanges: CounterChange[] = []
  const characterCompletedChatCountChanges: CounterChange[] = []
  for (const character of characters) {
    const expectedMessageCount = expectedMessageCountByCharacterId.get(character.id) ?? 0
    if (character.messageCount !== expectedMessageCount) {
      characterMessageCountChanges.push({
        characterId: character.id,
        characterName: character.name,
        current: character.messageCount,
        expected: expectedMessageCount,
        delta: expectedMessageCount - character.messageCount
      })
    }

    const expectedCompletedChatCount = expectedCompletedChatCountByCharacterId.get(character.id) ?? 0
    if (character.completedChatCount !== expectedCompletedChatCount) {
      characterCompletedChatCountChanges.push({
        characterId: character.id,
        characterName: character.name,
        current: character.completedChatCount,
        expected: expectedCompletedChatCount,
        delta: expectedCompletedChatCount - character.completedChatCount
      })
    }
  }

  const changedRows: DailyMetricEntry[] = []
  for (const [key, expected] of expectedDailyMetricByKey.entries()) {
    const current = currentDailyByKey.get(key) ?? {
      messageCount: 0,
      completedChatCount: 0
    }

    if (current.messageCount !== expected.messageCount || current.completedChatCount !== expected.completedChatCount) {
      const parsedKey = parseDayKey(key)
      changedRows.push({
        characterId: parsedKey.characterId,
        day: parsedKey.day,
        currentMessageCount: current.messageCount,
        expectedMessageCount: expected.messageCount,
        currentCompletedChatCount: current.completedChatCount,
        expectedCompletedChatCount: expected.completedChatCount
      })
    }
  }

  for (const change of [...characterMessageCountChanges, ...characterCompletedChatCountChanges]) {
    if (!characterById.has(change.characterId)) {
      throw new Error(`Repair report referenced unknown character ${change.characterId}.`)
    }
  }

  return {
    report: {
      generatedAt: new Date().toISOString(),
      retainedTranscriptMessageCount: transcriptMessages.length,
      missingMessageLedgerRowCount: transcriptMessages.filter((message) => !existingMessageLedgerMessageIds.has(message.id)).length,
      unprocessedMessageLedgerRowCount: unprocessedMessageLedgerRows.length,
      retainedCompletedSessionCount: completedSessions.length,
      sessionsMissingCompletedLedger: completedSessions.filter((session) => !existingLedgerSessionIds.has(session.sessionId)).length,
      characterMessageCountChanges,
      characterCompletedChatCountChanges,
      dailyMetric: {
        currentRows: currentDailyRows.length,
        expectedRows: expectedDailyMetricByKey.size,
        changedRows
      }
    },
    transcriptMessages,
    completedSessions,
    expectedMessageCountByCharacterId,
    expectedCompletedChatCountByCharacterId,
    expectedDailyMetricByKey,
    existingLedgerSessionIds,
    existingMessageLedgerMessageIds
  }
}

const writeJsonReport = async (jsonPath: string, report: RepairReport) => {
  const absolutePath = resolve(jsonPath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`Wrote JSON report: ${absolutePath}`)
}

const applyRepair = async (params: {
  transcriptMessages: TranscriptMessageRow[]
  completedSessions: CompletedChatSessionRow[]
  expectedMessageCountByCharacterId: Map<string, number>
  expectedCompletedChatCountByCharacterId: Map<string, number>
  expectedDailyMetricByKey: Map<string, ExpectedDailyMetric>
  existingLedgerSessionIds: Set<string>
  existingMessageLedgerMessageIds: Set<string>
}) => {
  await prisma.$transaction(
    async (tx) => {
      const processedAt = new Date()
      for (const message of params.transcriptMessages) {
        if (!params.existingMessageLedgerMessageIds.has(message.id)) {
          await tx.characterActivityMessageLedger.create({
            data: {
              messageId: message.id,
              sessionId: message.sessionId,
              characterId: message.characterId,
              role: message.role === 'ASSISTANT' ? ChatMessageRole.ASSISTANT : ChatMessageRole.USER,
              messageCreatedAt: toDate(message.createdAt),
              processedAt
            }
          })
        }
      }
      await tx.characterActivityMessageLedger.updateMany({
        where: {
          processedAt: null
        },
        data: {
          processedAt
        }
      })

      for (const session of params.completedSessions) {
        if (!params.existingLedgerSessionIds.has(session.sessionId)) {
          await tx.characterCompletedChatLedger.create({
            data: {
              sessionId: session.sessionId,
              characterId: session.characterId,
              countedAt: toDate(session.firstAssistantAt)
            }
          })
        }
      }

      const characters = await tx.character.findMany({
        select: {
          id: true
        }
      })

      for (const character of characters) {
        await tx.character.update({
          where: {
            id: character.id
          },
          data: {
            messageCount: params.expectedMessageCountByCharacterId.get(character.id) ?? 0,
            completedChatCount: params.expectedCompletedChatCountByCharacterId.get(character.id) ?? 0
          }
        })
      }

      for (const [key, expectedDailyMetric] of params.expectedDailyMetricByKey.entries()) {
        const parsedKey = parseDayKey(key)
        await tx.characterActivityDailyMetric.upsert({
          where: {
            characterId_day: {
              characterId: parsedKey.characterId,
              day: new Date(parsedKey.day)
            }
          },
          create: {
            characterId: parsedKey.characterId,
            day: new Date(parsedKey.day),
            messageCount: expectedDailyMetric.messageCount,
            completedChatCount: expectedDailyMetric.completedChatCount
          },
          update: {
            messageCount: expectedDailyMetric.messageCount,
            completedChatCount: expectedDailyMetric.completedChatCount
          }
        })
      }
    },
    {
      timeout: 120000
    }
  )
}

const main = async () => {
  const args = parseArgs()
  const repairState = await buildReport()
  const report = repairState.report

  console.log(`Character message count audit found ${report.characterMessageCountChanges.length} character message-count change(s).`)
  console.log(`Character completed-chat audit found ${report.characterCompletedChatCountChanges.length} completed-chat change(s).`)
  console.log(`${report.retainedTranscriptMessageCount} retained visible transcript message(s) are available for message-count baseline.`)
  console.log(`${report.missingMessageLedgerRowCount} retained visible transcript message(s) are missing activity message ledger rows.`)
  console.log(`${report.unprocessedMessageLedgerRowCount} activity message ledger row(s) are unprocessed.`)
  console.log(`${report.retainedCompletedSessionCount} retained completed session(s) are available for ledger reconstruction.`)
  console.log(`${report.sessionsMissingCompletedLedger} retained completed session(s) are missing completed-chat ledger rows.`)
  console.log(
    `Daily aggregate repair: ${report.dailyMetric.expectedRows} expected row(s), ${report.dailyMetric.changedRows.length} changed.`
  )

  for (const change of report.characterMessageCountChanges) {
    console.log(
      [
        `messageCount ${change.current} -> ${change.expected}`,
        `character=${change.characterId}`,
        `name=${change.characterName}`,
        `delta=${change.delta}`
      ].join(' | ')
    )
  }

  for (const change of report.characterCompletedChatCountChanges) {
    console.log(
      [
        `completedChatCount ${change.current} -> ${change.expected}`,
        `character=${change.characterId}`,
        `name=${change.characterName}`,
        `delta=${change.delta}`
      ].join(' | ')
    )
  }

  if (args.jsonPath) {
    await writeJsonReport(args.jsonPath, report)
  }

  if (!args.apply) {
    console.log(`Dry run only. Re-run with --apply --confirm=${PRODUCTION_CONFIRMATION} to repair character activity counts.`)
    return
  }

  if (args.confirm !== PRODUCTION_CONFIRMATION) {
    throw new Error(`Repair requires --confirm=${PRODUCTION_CONFIRMATION}`)
  }

  await applyRepair(repairState)
  console.log('Character message counts, completed-chat ledgers, and activity daily metrics were repaired.')
}

main()
  .catch((error) => {
    console.error('Character activity count repair failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
