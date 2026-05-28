import type { PrismaEngineFatalClassification } from './prisma-engine-fatal-error'
import { reportPrismaEngineFatalError } from './prisma-engine-fatal-reporter'
import type { FatalShutdownSource, ScheduleFatalShutdownInput } from './fatal-shutdown-controller'

type PrismaEngineProcessGuardGlobal = typeof globalThis & {
  __secretWaifuPrismaEngineFatalProcessGuardInstalled?: boolean
}

type PrismaEngineFatalProcessErrorOptions = {
  logger?: Pick<Console, 'error'>
  scheduleFatalShutdown?: (input: ScheduleFatalShutdownInput) => unknown
}

const prismaEngineProcessGuardGlobal = globalThis as PrismaEngineProcessGuardGlobal

const handlePrismaEngineFatalProcessError = (
  error: unknown,
  source: FatalShutdownSource,
  options: PrismaEngineFatalProcessErrorOptions = {}
): PrismaEngineFatalClassification | null => {
  return reportPrismaEngineFatalError({
    error,
    source,
    logger: options.logger,
    scheduleFatalShutdown: options.scheduleFatalShutdown
  })
}

/**
 * Installs process-level Prisma panic containment for work that fails outside
 * Express request scope. Runtime log capture still owns the detailed log entry;
 * this guard only decides whether the process must terminate for supervisor
 * restart after a non-recoverable Query Engine panic.
 */
const installPrismaEngineFatalProcessGuard = () => {
  if (prismaEngineProcessGuardGlobal.__secretWaifuPrismaEngineFatalProcessGuardInstalled) {
    return
  }

  prismaEngineProcessGuardGlobal.__secretWaifuPrismaEngineFatalProcessGuardInstalled = true

  process.on('unhandledRejection', (reason) => {
    handlePrismaEngineFatalProcessError(reason, 'unhandled_rejection')
  })

  process.on('uncaughtExceptionMonitor', (error) => {
    handlePrismaEngineFatalProcessError(error, 'uncaught_exception')
  })
}

export {
  handlePrismaEngineFatalProcessError,
  installPrismaEngineFatalProcessGuard
}
