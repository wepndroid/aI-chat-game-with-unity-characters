import type { PrismaEngineFatalClassification, PrismaEngineFatalReason } from './prisma-engine-fatal-error'

type FatalShutdownSource =
  | 'request'
  | 'unhandled_rejection'
  | 'uncaught_exception'
  | 'handled_background'
  | 'startup'

type FatalShutdownState = {
  reason: PrismaEngineFatalReason
  source: FatalShutdownSource
  scheduledAt: string
  exitCode: 1
  responseGraceMs: number
  forceExitMs: number
  diagnostic?: PrismaEngineFatalClassification
}

type FatalShutdownHttpServer = {
  close: (callback?: (error?: Error) => void) => unknown
  closeIdleConnections?: () => void
}

type FatalShutdownRuntime = {
  now: () => Date
  setTimeout: (callback: () => void, ms: number) => unknown
  exit: (code: number) => void
  logger: Pick<Console, 'error'>
}

type ScheduleFatalShutdownInput = {
  reason: PrismaEngineFatalReason
  source: FatalShutdownSource
  diagnostic?: PrismaEngineFatalClassification
}

type ResetFatalShutdownForTestsOptions = {
  runtime?: Partial<FatalShutdownRuntime>
}

const DEFAULT_RESPONSE_GRACE_MS = 1000
const DEFAULT_FORCE_EXIT_MS = 10000

const parsePositiveIntegerEnv = (name: string, fallback: number) => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const getResponseGraceMs = () =>
  parsePositiveIntegerEnv('FATAL_SHUTDOWN_RESPONSE_GRACE_MS', DEFAULT_RESPONSE_GRACE_MS)

const getForceExitMs = () => parsePositiveIntegerEnv('FATAL_SHUTDOWN_FORCE_EXIT_MS', DEFAULT_FORCE_EXIT_MS)

let registeredServer: FatalShutdownHttpServer | null = null
let fatalState: FatalShutdownState | null = null
let b_exitRequested = false
let b_responseGraceElapsed = false
let b_httpServerDrained = true

let runtime: FatalShutdownRuntime = {
  now: () => new Date(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  exit: (code) => {
    process.exit(code)
  },
  logger: console
}

const exitOnce = (code: 1) => {
  if (b_exitRequested) {
    return
  }

  b_exitRequested = true
  runtime.exit(code)
}

const exitAfterGraceIfReady = () => {
  if (b_responseGraceElapsed && b_httpServerDrained) {
    exitOnce(1)
  }
}

const closeRegisteredServer = () => {
  if (!registeredServer) {
    b_httpServerDrained = true
    return
  }

  b_httpServerDrained = false

  try {
    registeredServer.close((error?: Error) => {
      if (error) {
        runtime.logger.error('[fatal-shutdown] HTTP server close reported an error.', {
          errorName: error.name
        })
      }
      b_httpServerDrained = true
      exitAfterGraceIfReady()
    })
    registeredServer.closeIdleConnections?.()
  } catch (error) {
    runtime.logger.error('[fatal-shutdown] Failed to close HTTP server during fatal shutdown.', {
        errorName: error instanceof Error ? error.name : typeof error
      })
    b_httpServerDrained = true
    exitAfterGraceIfReady()
  }
}

/**
 * Registers the process HTTP server with the fatal shutdown coordinator.
 *
 * This module is intentionally not a general-purpose shutdown framework. It is
 * only for non-recoverable Prisma Query Engine panics where continuing to serve
 * traffic risks repeated 500s from a crashed engine.
 */
const registerFatalShutdownHttpServer = (server: FatalShutdownHttpServer) => {
  registeredServer = server
}

const getFatalShutdownState = () => fatalState

const scheduleFatalShutdown = (input: ScheduleFatalShutdownInput) => {
  if (fatalState) {
    return fatalState
  }

  const responseGraceMs = getResponseGraceMs()
  const forceExitMs = getForceExitMs()

  fatalState = {
    reason: input.reason,
    source: input.source,
    scheduledAt: runtime.now().toISOString(),
    exitCode: 1,
    responseGraceMs,
    forceExitMs,
    ...(input.diagnostic ? { diagnostic: input.diagnostic } : {})
  }

  runtime.logger.error('[fatal-shutdown] Fatal backend shutdown scheduled.', {
    reason: fatalState.reason,
    source: fatalState.source,
    exitCode: fatalState.exitCode,
    responseGraceMs: fatalState.responseGraceMs,
    forceExitMs: fatalState.forceExitMs,
    diagnostic: fatalState.diagnostic
  })

  closeRegisteredServer()
  runtime.setTimeout(() => {
    b_responseGraceElapsed = true
    exitAfterGraceIfReady()
  }, responseGraceMs)
  runtime.setTimeout(() => exitOnce(1), forceExitMs)

  return fatalState
}

const resetFatalShutdownForTests = (options: ResetFatalShutdownForTestsOptions = {}) => {
  registeredServer = null
  fatalState = null
  b_exitRequested = false
  b_responseGraceElapsed = false
  b_httpServerDrained = true
  runtime = {
    now: options.runtime?.now ?? (() => new Date()),
    setTimeout: options.runtime?.setTimeout ?? ((callback, ms) => setTimeout(callback, ms)),
    exit:
      options.runtime?.exit ??
      ((code) => {
        process.exit(code)
      }),
    logger: options.runtime?.logger ?? console
  }
}

export {
  getFatalShutdownState,
  registerFatalShutdownHttpServer,
  resetFatalShutdownForTests,
  scheduleFatalShutdown
}
export type {
  FatalShutdownHttpServer,
  FatalShutdownSource,
  FatalShutdownState,
  ScheduleFatalShutdownInput
}
