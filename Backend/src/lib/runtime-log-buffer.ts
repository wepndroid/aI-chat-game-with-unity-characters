import util from 'node:util'
import { redactLogText } from './log-redaction'

type RuntimeLogLevel = 'error' | 'warn' | 'info'

type RuntimeLogEntry = {
  id: string
  level: RuntimeLogLevel
  message: string
  createdAt: string
}

type RuntimeLogGlobal = typeof globalThis & {
  __secretWaifuRuntimeLogCaptureInstalled?: boolean
  __secretWaifuRuntimeLogEntryList?: RuntimeLogEntry[]
}

const MAX_RUNTIME_LOG_ENTRIES = 200

const runtimeGlobal = globalThis as RuntimeLogGlobal

const getRuntimeLogStore = () => {
  runtimeGlobal.__secretWaifuRuntimeLogEntryList ??= []
  return runtimeGlobal.__secretWaifuRuntimeLogEntryList
}

const stringifyLogArgument = (value: unknown) => {
  if (value instanceof Error) {
    return value.stack ?? value.message
  }

  if (typeof value === 'string') {
    return value
  }

  return util.inspect(value, {
    depth: 5,
    breakLength: 120,
    maxArrayLength: 50,
    maxStringLength: 12000
  })
}

const recordRuntimeLogEntry = (level: RuntimeLogLevel, args: unknown[]) => {
  const store = getRuntimeLogStore()

  store.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    level,
    message: redactLogText(args.map(stringifyLogArgument).join(' ')),
    createdAt: new Date().toISOString()
  })

  if (store.length > MAX_RUNTIME_LOG_ENTRIES) {
    store.splice(0, store.length - MAX_RUNTIME_LOG_ENTRIES)
  }
}

const stringifyAndRedactLogArguments = (args: unknown[]) => redactLogText(args.map(stringifyLogArgument).join(' '))

const getRuntimeLogEntries = (maxEntryCount: number) => {
  return getRuntimeLogStore()
    .slice(-maxEntryCount)
    .map((entry) => ({
      ...entry,
      message: redactLogText(entry.message)
    }))
}

const installRuntimeLogCapture = () => {
  if (runtimeGlobal.__secretWaifuRuntimeLogCaptureInstalled) {
    return
  }

  runtimeGlobal.__secretWaifuRuntimeLogCaptureInstalled = true

  const originalConsoleError = console.error.bind(console)
  const originalConsoleWarn = console.warn.bind(console)

  console.error = (...args: unknown[]) => {
    recordRuntimeLogEntry('error', args)
    originalConsoleError(stringifyAndRedactLogArguments(args))
  }

  console.warn = (...args: unknown[]) => {
    recordRuntimeLogEntry('warn', args)
    originalConsoleWarn(stringifyAndRedactLogArguments(args))
  }

  process.on('uncaughtExceptionMonitor', (error) => {
    recordRuntimeLogEntry('error', ['[process] Uncaught exception.', error])
  })

  process.on('unhandledRejection', (reason) => {
    recordRuntimeLogEntry('error', ['[process] Unhandled rejection.', reason])
    originalConsoleError(stringifyAndRedactLogArguments(['[process] Unhandled rejection.', reason]))
  })

  process.on('warning', (warning) => {
    recordRuntimeLogEntry('warn', ['[process] Warning.', warning])
  })
}

export { getRuntimeLogEntries, installRuntimeLogCapture, recordRuntimeLogEntry }
export type { RuntimeLogEntry, RuntimeLogLevel }
