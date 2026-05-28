import 'dotenv/config'
import { ChatSessionPreviewRefreshJobStatus } from '@prisma/client'

import { prisma } from '../src/lib/prisma'
import {
  processDueChatSessionPreviewRefreshJobs,
  resetFailedChatSessionPreviewRefreshJobs,
  type ProcessDueChatSessionPreviewRefreshJobsResult
} from '../src/services/chat/chat-session-preview-refresh-service'

const PRODUCTION_CONFIRMATION = 'repair-chat-session-previews'

type ParsedArgs = {
  apply: boolean
  confirm: string | null
  resetFailed: boolean
  batchSize: number
  maxBatches: number
}

type PreviewRefreshReport = {
  generatedAt: string
  pendingDue: number
  pendingFuture: number
  processingExpired: number
  processingActive: number
  failed: number
  succeeded: number
}

const parseIntegerArg = (name: string, fallback: number) => {
  const arg = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
  if (!arg) {
    return fallback
  }

  const parsed = Number.parseInt(arg.slice(name.length + 3), 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer.`)
  }

  return parsed
}

const parseArgs = (): ParsedArgs => {
  const args = process.argv.slice(2)
  const confirmArg = args.find((arg) => arg.startsWith('--confirm='))

  return {
    apply: args.includes('--apply'),
    confirm: confirmArg ? confirmArg.slice('--confirm='.length) : null,
    resetFailed: args.includes('--reset-failed'),
    batchSize: parseIntegerArg('batch-size', 25),
    maxBatches: parseIntegerArg('max-batches', 20)
  }
}

const buildReport = async (now: Date): Promise<PreviewRefreshReport> => {
  const [
    pendingDue,
    pendingFuture,
    processingExpired,
    processingActive,
    failed,
    succeeded
  ] = await Promise.all([
    prisma.chatSessionPreviewRefreshJob.count({
      where: {
        status: ChatSessionPreviewRefreshJobStatus.PENDING,
        nextAttemptAt: {
          lte: now
        }
      }
    }),
    prisma.chatSessionPreviewRefreshJob.count({
      where: {
        status: ChatSessionPreviewRefreshJobStatus.PENDING,
        nextAttemptAt: {
          gt: now
        }
      }
    }),
    prisma.chatSessionPreviewRefreshJob.count({
      where: {
        status: ChatSessionPreviewRefreshJobStatus.PROCESSING,
        leaseExpiresAt: {
          lte: now
        }
      }
    }),
    prisma.chatSessionPreviewRefreshJob.count({
      where: {
        status: ChatSessionPreviewRefreshJobStatus.PROCESSING,
        OR: [
          {
            leaseExpiresAt: null
          },
          {
            leaseExpiresAt: {
              gt: now
            }
          }
        ]
      }
    }),
    prisma.chatSessionPreviewRefreshJob.count({
      where: {
        status: ChatSessionPreviewRefreshJobStatus.FAILED
      }
    }),
    prisma.chatSessionPreviewRefreshJob.count({
      where: {
        status: ChatSessionPreviewRefreshJobStatus.SUCCEEDED
      }
    })
  ])

  return {
    generatedAt: now.toISOString(),
    pendingDue,
    pendingFuture,
    processingExpired,
    processingActive,
    failed,
    succeeded
  }
}

const mergeProcessingResult = (
  aggregate: ProcessDueChatSessionPreviewRefreshJobsResult,
  next: ProcessDueChatSessionPreviewRefreshJobsResult
) => {
  aggregate.inspectedJobs += next.inspectedJobs
  aggregate.claimedJobs += next.claimedJobs
  aggregate.succeededJobs += next.succeededJobs
  aggregate.retryScheduledJobs += next.retryScheduledJobs
  aggregate.failedJobs += next.failedJobs
  aggregate.skippedJobs += next.skippedJobs
}

const processDueBatches = async (args: ParsedArgs) => {
  const aggregate: ProcessDueChatSessionPreviewRefreshJobsResult = {
    inspectedJobs: 0,
    claimedJobs: 0,
    succeededJobs: 0,
    retryScheduledJobs: 0,
    failedJobs: 0,
    skippedJobs: 0
  }

  for (let batchIndex = 0; batchIndex < args.maxBatches; batchIndex += 1) {
    const batchResult = await processDueChatSessionPreviewRefreshJobs({
      batchSize: args.batchSize,
      leaseOwner: 'repair-chat-session-previews'
    })
    mergeProcessingResult(aggregate, batchResult)

    if (batchResult.claimedJobs === 0) {
      break
    }
  }

  return aggregate
}

const main = async () => {
  const args = parseArgs()
  const beforeReport = await buildReport(new Date())

  console.log('Chat session preview refresh job report:')
  console.log(JSON.stringify(beforeReport, null, 2))

  if (!args.apply) {
    const resetText = args.resetFailed ? ' The --reset-failed flag was ignored because this is a dry run.' : ''
    console.log(
      `Dry run only. Re-run with --apply --confirm=${PRODUCTION_CONFIRMATION} to process due jobs.${resetText}`
    )
    return
  }

  if (args.confirm !== PRODUCTION_CONFIRMATION) {
    throw new Error(`Repair requires --confirm=${PRODUCTION_CONFIRMATION}`)
  }

  let resetCount = 0
  if (args.resetFailed) {
    resetCount = await resetFailedChatSessionPreviewRefreshJobs()
    console.log(`Reset failed preview refresh job(s): ${resetCount}`)
  }

  const processingResult = await processDueBatches(args)
  console.log('Preview refresh processing result:')
  console.log(JSON.stringify(processingResult, null, 2))

  const afterReport = await buildReport(new Date())
  console.log('Chat session preview refresh job report after repair:')
  console.log(JSON.stringify(afterReport, null, 2))
}

main()
  .catch((error) => {
    console.error('Chat session preview repair failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
