import type express from 'express'
import { ZodError } from 'zod'
import { sendApiError } from '../lib/api-contract'
import { classifyPrismaEngineFatalError } from '../lib/prisma-engine-fatal-error'
import { scheduleFatalShutdown } from '../lib/fatal-shutdown-controller'
import type { ScheduleFatalShutdownInput } from '../lib/fatal-shutdown-controller'

type ApiErrorHandlerOptions = {
  logger?: Pick<Console, 'error'>
  scheduleFatalShutdown?: (input: ScheduleFatalShutdownInput) => unknown
}

const PRISMA_ENGINE_RESTART_MESSAGE = 'Database engine crashed. Service is restarting.'

const createApiErrorHandler = (options: ApiErrorHandlerOptions = {}): express.ErrorRequestHandler => {
  const logger = options.logger ?? console
  const scheduleShutdown = options.scheduleFatalShutdown ?? scheduleFatalShutdown

  return (error, _request, response, next) => {
    if (response.headersSent) {
      next(error)
      return
    }

    if (error instanceof ZodError) {
      const first = error.issues[0]
      sendApiError(response, 400, 'VALIDATION_FAILED', first?.message ?? 'Validation failed.', {
        issues: error.issues
      })
      return
    }

    const fatalClassification = classifyPrismaEngineFatalError(error)
    if (fatalClassification) {
      logger.error('[api-error-handler] Fatal Prisma engine error reached HTTP boundary.', {
        reason: fatalClassification.reason,
        errorName: fatalClassification.errorName,
        clientVersion: fatalClassification.clientVersion
      })
      scheduleShutdown({
        reason: fatalClassification.reason,
        source: 'request',
        diagnostic: fatalClassification
      })
      sendApiError(response, 503, 'SERVICE_UNAVAILABLE', PRISMA_ENGINE_RESTART_MESSAGE)
      return
    }

    logger.error(error)
    sendApiError(response, 500, 'INTERNAL_ERROR', 'Internal server error.')
  }
}

const apiErrorHandler = createApiErrorHandler()

export {
  PRISMA_ENGINE_RESTART_MESSAGE,
  apiErrorHandler,
  createApiErrorHandler
}
