type PrismaEngineFatalReason = 'prisma_engine_panic'

type PrismaEngineFatalClassification = {
  reason: PrismaEngineFatalReason
  errorName: string | null
  clientVersion?: string
}

const PRISMA_RUST_PANIC_ERROR_NAME = 'PrismaClientRustPanicError'
const RECOVERABLE_PRISMA_ERROR_CODES = new Set(['P1008', 'P2028', 'P2002'])

const getErrorObjectValue = (error: unknown, key: string) => {
  if (!error || typeof error !== 'object') {
    return null
  }

  return (error as Record<string, unknown>)[key] ?? null
}

const getStringErrorObjectValue = (error: unknown, key: string) => {
  const value = getErrorObjectValue(error, key)
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

const getErrorName = (error: unknown) => {
  const directName = getStringErrorObjectValue(error, 'name')
  if (directName) {
    return directName
  }

  if (error && typeof error === 'object') {
    const constructorName = error.constructor?.name
    return typeof constructorName === 'string' && constructorName.trim().length > 0 ? constructorName : null
  }

  return null
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  const message = getStringErrorObjectValue(error, 'message')
  return message ?? ''
}

const getErrorCode = (error: unknown) => getStringErrorObjectValue(error, 'code')

const getClientVersion = (error: unknown) => getStringErrorObjectValue(error, 'clientVersion') ?? undefined

const hasPrismaRustPanicSignature = (error: unknown) => {
  const message = getErrorMessage(error)
  return message.includes('PANIC in ') && message.includes(PRISMA_RUST_PANIC_ERROR_NAME)
}

const classifyPrismaEngineFatalError = (error: unknown): PrismaEngineFatalClassification | null => {
  const errorCode = getErrorCode(error)
  if (errorCode && RECOVERABLE_PRISMA_ERROR_CODES.has(errorCode)) {
    return null
  }

  const errorName = getErrorName(error)
  const isDirectRustPanic =
    errorName === PRISMA_RUST_PANIC_ERROR_NAME ||
    (error && typeof error === 'object' && error.constructor?.name === PRISMA_RUST_PANIC_ERROR_NAME)

  if (!isDirectRustPanic && !hasPrismaRustPanicSignature(error)) {
    return null
  }

  return {
    reason: 'prisma_engine_panic',
    errorName,
    ...(getClientVersion(error) ? { clientVersion: getClientVersion(error) } : {})
  }
}

const isPrismaEngineFatalError = (error: unknown) => classifyPrismaEngineFatalError(error) !== null

export {
  classifyPrismaEngineFatalError,
  isPrismaEngineFatalError
}
export type {
  PrismaEngineFatalClassification,
  PrismaEngineFatalReason
}
