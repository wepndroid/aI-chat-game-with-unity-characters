import { ChatMessageRole, Prisma } from '@prisma/client'

import {
  runObservedBackgroundWork as defaultRunObservedBackgroundWork,
  type ObservedBackgroundWorkRunner
} from '../../lib/background-work-monitor'
import { prisma } from '../../lib/prisma'

type CharacterActivityProcessingPrismaClient = {
  $transaction: <T>(
    callback: (tx: CharacterActivityProcessingTransactionClient) => Promise<T>,
    options?: {
      timeout?: number
    }
  ) => Promise<T>
}

type CharacterActivityProcessingTransactionClient = Pick<
  Prisma.TransactionClient,
  | 'character'
  | 'characterActivityDailyMetric'
  | 'characterActivityMessageLedger'
  | 'characterCompletedChatLedger'
  | 'chatMessage'
>

type CharacterActivityMessageLedgerRow = {
  id: string
  messageId: string
  sessionId: string
  characterId: string
  role: ChatMessageRole
  messageCreatedAt: Date
  processedAt: Date | null
}

type CharacterActivityLedgerProcessingResult = {
  processedMessageCount: number
  completedChatCounted: boolean
}

type CharacterActivityLedgerBackgroundProcessingResult = CharacterActivityLedgerProcessingResult

type ProcessCharacterActivityMessageLedgerRowsAsBackgroundWorkInput = {
  limit?: number
  messageIds?: string[]
  operationName?: string
  prismaClient?: CharacterActivityProcessingPrismaClient
  runObservedBackgroundWork?: ObservedBackgroundWorkRunner
}

type DailyActivityIncrement = {
  messageCount: number
  completedChatCount: number
}

const toUtcDayStart = (date: Date) => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

const isUniqueConstraintError = (error: unknown) => {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

const incrementCharacterDailyActivity = (
  dailyIncrements: Map<string, DailyActivityIncrement>,
  characterId: string,
  createdAt: Date,
  increment: DailyActivityIncrement
) => {
  const day = toUtcDayStart(createdAt)
  const key = `${characterId}|${day.toISOString()}`
  const current = dailyIncrements.get(key) ?? {
    messageCount: 0,
    completedChatCount: 0
  }

  dailyIncrements.set(key, {
    messageCount: current.messageCount + increment.messageCount,
    completedChatCount: current.completedChatCount + increment.completedChatCount
  })
}

const toLedgerRowSortValue = (row: CharacterActivityMessageLedgerRow) => {
  return `${row.messageCreatedAt.toISOString()}:${row.id}`
}

const groupLedgerRowsByCharacter = (rows: CharacterActivityMessageLedgerRow[]) => {
  const rowsByCharacterId = new Map<string, CharacterActivityMessageLedgerRow[]>()
  for (const row of rows) {
    const characterRows = rowsByCharacterId.get(row.characterId) ?? []
    characterRows.push(row)
    rowsByCharacterId.set(row.characterId, characterRows)
  }
  return rowsByCharacterId
}

const groupLedgerRowsBySession = (rows: CharacterActivityMessageLedgerRow[]) => {
  const rowsBySessionId = new Map<string, CharacterActivityMessageLedgerRow[]>()
  for (const row of rows) {
    const sessionRows = rowsBySessionId.get(row.sessionId) ?? []
    sessionRows.push(row)
    rowsBySessionId.set(row.sessionId, sessionRows)
  }
  return rowsBySessionId
}

const claimUnprocessedLedgerRows = async (
  tx: CharacterActivityProcessingTransactionClient,
  candidateRows: CharacterActivityMessageLedgerRow[]
) => {
  const processedAt = new Date()
  const claimedRows: CharacterActivityMessageLedgerRow[] = []

  for (const row of candidateRows) {
    const result = await tx.characterActivityMessageLedger.updateMany({
      where: {
        id: row.id,
        processedAt: null
      },
      data: {
        processedAt
      }
    })

    if (result.count === 1) {
      claimedRows.push(row)
    }
  }

  return claimedRows
}

const countCompletedSessionsForClaimedRows = async (
  tx: CharacterActivityProcessingTransactionClient,
  claimedRows: CharacterActivityMessageLedgerRow[],
  dailyIncrements: Map<string, DailyActivityIncrement>
) => {
  let completedChatCounted = false
  const completedCountByCharacterId = new Map<string, number>()

  for (const sessionRows of groupLedgerRowsBySession(claimedRows).values()) {
    const assistantRows = sessionRows
      .filter((row) => row.role === ChatMessageRole.ASSISTANT)
      .sort((left, right) => toLedgerRowSortValue(left).localeCompare(toLedgerRowSortValue(right)))
    if (assistantRows.length === 0) {
      continue
    }

    const firstAssistant = await tx.chatMessage.findFirst({
      where: {
        sessionId: assistantRows[0].sessionId,
        role: ChatMessageRole.ASSISTANT
      },
      orderBy: [
        {
          createdAt: 'asc'
        },
        {
          id: 'asc'
        }
      ],
      select: {
        id: true
      }
    })

    const countedAssistantRow = assistantRows.find((row) => row.messageId === firstAssistant?.id)
    if (!countedAssistantRow) {
      continue
    }

    try {
      await tx.characterCompletedChatLedger.create({
        data: {
          sessionId: countedAssistantRow.sessionId,
          characterId: countedAssistantRow.characterId,
          countedAt: countedAssistantRow.messageCreatedAt
        }
      })
      completedChatCounted = true
      completedCountByCharacterId.set(
        countedAssistantRow.characterId,
        (completedCountByCharacterId.get(countedAssistantRow.characterId) ?? 0) + 1
      )
      incrementCharacterDailyActivity(
        dailyIncrements,
        countedAssistantRow.characterId,
        countedAssistantRow.messageCreatedAt,
        {
          messageCount: 0,
          completedChatCount: 1
        }
      )
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error
      }
    }
  }

  return {
    completedChatCounted,
    completedCountByCharacterId
  }
}

const processClaimedLedgerRows = async (
  tx: CharacterActivityProcessingTransactionClient,
  claimedRows: CharacterActivityMessageLedgerRow[]
): Promise<CharacterActivityLedgerProcessingResult> => {
  if (claimedRows.length === 0) {
    return {
      processedMessageCount: 0,
      completedChatCounted: false
    }
  }

  const dailyIncrements = new Map<string, DailyActivityIncrement>()
  for (const row of claimedRows) {
    incrementCharacterDailyActivity(dailyIncrements, row.characterId, row.messageCreatedAt, {
      messageCount: 1,
      completedChatCount: 0
    })
  }

  const completedSessionResult = await countCompletedSessionsForClaimedRows(tx, claimedRows, dailyIncrements)
  const rowsByCharacterId = groupLedgerRowsByCharacter(claimedRows)

  for (const [characterId, characterRows] of rowsByCharacterId.entries()) {
    await tx.character.update({
      where: {
        id: characterId
      },
      data: {
        messageCount: {
          increment: characterRows.length
        },
        completedChatCount: {
          increment: completedSessionResult.completedCountByCharacterId.get(characterId) ?? 0
        }
      }
    })
  }

  const orderedDailyIncrements = [...dailyIncrements.entries()].sort(([left], [right]) => left.localeCompare(right))
  for (const [dayKey, increment] of orderedDailyIncrements) {
    const [characterId, dayIso] = dayKey.split('|')
    const day = new Date(dayIso)
    await tx.characterActivityDailyMetric.upsert({
      where: {
        characterId_day: {
          characterId,
          day
        }
      },
      create: {
        characterId,
        day,
        messageCount: increment.messageCount,
        completedChatCount: increment.completedChatCount
      },
      update: {
        messageCount: {
          increment: increment.messageCount
        },
        completedChatCount: {
          increment: increment.completedChatCount
        }
      }
    })
  }

  return {
    processedMessageCount: claimedRows.length,
    completedChatCounted: completedSessionResult.completedChatCounted
  }
}

const processCharacterActivityMessageLedgerRows = async (
  prismaClient: CharacterActivityProcessingPrismaClient,
  input: {
    messageIds?: string[]
    limit?: number
  } = {}
): Promise<CharacterActivityLedgerProcessingResult> => {
  if (input.messageIds && input.messageIds.length === 0) {
    return {
      processedMessageCount: 0,
      completedChatCounted: false
    }
  }

  return prismaClient.$transaction(
    async (tx) => {
      const candidateRows = await tx.characterActivityMessageLedger.findMany({
        where: {
          processedAt: null,
          ...(input.messageIds ? { messageId: { in: input.messageIds } } : {})
        },
        orderBy: [
          {
            createdAt: 'asc'
          },
          {
            id: 'asc'
          }
        ],
        take: input.limit ?? 100
      })
      const claimedRows = await claimUnprocessedLedgerRows(tx, candidateRows)
      return processClaimedLedgerRows(tx, claimedRows)
    },
    {
      timeout: 30000
    }
  )
}

const processPendingCharacterActivityBatch = async (input: { limit?: number } = {}) => {
  return processCharacterActivityMessageLedgerRows(prisma, {
    limit: input.limit ?? 100
  })
}

const processCharacterActivityMessageLedgerRowsAsBackgroundWork = async (
  input: ProcessCharacterActivityMessageLedgerRowsAsBackgroundWorkInput = {}
): Promise<CharacterActivityLedgerBackgroundProcessingResult> => {
  const {
    operationName = 'character_activity_ledger',
    prismaClient = prisma,
    runObservedBackgroundWork = defaultRunObservedBackgroundWork,
    ...processingInput
  } = input

  return runObservedBackgroundWork(
    operationName,
    () => processCharacterActivityMessageLedgerRows(prismaClient, processingInput),
    { logger: console }
  )
}

const processPendingCharacterActivityBatchAsBackgroundWork = async (
  input: Omit<ProcessCharacterActivityMessageLedgerRowsAsBackgroundWorkInput, 'messageIds' | 'operationName'> = {}
) => {
  return processCharacterActivityMessageLedgerRowsAsBackgroundWork({
    ...input,
    operationName: 'character_activity_batch',
    limit: input.limit ?? 100
  })
}

export {
  processCharacterActivityMessageLedgerRowsAsBackgroundWork,
  processCharacterActivityMessageLedgerRows,
  processPendingCharacterActivityBatchAsBackgroundWork,
  processPendingCharacterActivityBatch,
  toUtcDayStart
}
export type {
  CharacterActivityLedgerBackgroundProcessingResult,
  CharacterActivityLedgerProcessingResult,
  CharacterActivityMessageLedgerRow
}
