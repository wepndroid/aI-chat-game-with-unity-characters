type PublicTrackingWarningDetails = Record<string, string>

type PublicTrackingPersistenceOptions = {
  operationName: string
  warn?: (message: string, details: PublicTrackingWarningDetails) => void
}

export type PublicTrackingPersistenceFailure = {
  tracked: false
}

const WARNING_MESSAGE = '[landing] Public tracking persistence failed; returning fail-open response.'

const resolveErrorCode = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null
  }

  const code = (error as { code?: unknown }).code
  if (typeof code !== 'string' && typeof code !== 'number') {
    return null
  }

  return String(code)
}

const buildWarningDetails = (operationName: string, error: unknown): PublicTrackingWarningDetails => {
  const errorName = error instanceof Error ? error.name : typeof error
  const errorCode = resolveErrorCode(error)

  return {
    operationName,
    errorName,
    ...(errorCode ? { errorCode } : {})
  }
}

export const runPublicTrackingPersistence = async <TResult>(
  operation: () => Promise<TResult>,
  options: PublicTrackingPersistenceOptions
): Promise<TResult | PublicTrackingPersistenceFailure> => {
  try {
    return await operation()
  } catch (error) {
    const warn =
      options.warn ?? ((message: string, details: PublicTrackingWarningDetails) => console.warn(message, details))
    warn(WARNING_MESSAGE, buildWarningDetails(options.operationName, error))
    return { tracked: false }
  }
}
