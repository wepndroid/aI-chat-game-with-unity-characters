import {
  classifyPrismaEngineFatalError,
  type PrismaEngineFatalClassification
} from './prisma-engine-fatal-error'
import {
  scheduleFatalShutdown,
  type FatalShutdownSource,
  type ScheduleFatalShutdownInput
} from './fatal-shutdown-controller'

type ReportPrismaEngineFatalErrorInput = {
  error: unknown
  source: FatalShutdownSource
  logger?: Pick<Console, 'error'>
  scheduleFatalShutdown?: (input: ScheduleFatalShutdownInput) => unknown
  logContext?: Record<string, unknown>
}

/**
 * Reports handled Prisma Query Engine panics through the same fatal shutdown
 * path used by request and process-level boundaries.
 *
 * Prisma rust panics invalidate the engine process. Callers must not attempt
 * compensating Prisma writes after this returns a classification; the external
 * supervisor restart is the recovery mechanism.
 */
const reportPrismaEngineFatalError = (
  input: ReportPrismaEngineFatalErrorInput
): PrismaEngineFatalClassification | null => {
  const classification = classifyPrismaEngineFatalError(input.error)
  if (!classification) {
    return null
  }

  const logger = input.logger ?? console
  const scheduleShutdown = input.scheduleFatalShutdown ?? scheduleFatalShutdown

  logger.error('[prisma-engine-fatal] Fatal Prisma Query Engine error reported.', {
    source: input.source,
    reason: classification.reason,
    errorName: classification.errorName,
    ...(classification.clientVersion ? { clientVersion: classification.clientVersion } : {}),
    ...(input.logContext ? { context: input.logContext } : {})
  })

  scheduleShutdown({
    reason: classification.reason,
    source: input.source,
    diagnostic: classification
  })

  return classification
}

export { reportPrismaEngineFatalError }
export type { ReportPrismaEngineFatalErrorInput }
