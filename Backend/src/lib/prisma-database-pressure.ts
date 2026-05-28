/**
 * Shared Prisma pressure classifier for retryable background work and
 * foreground transaction telemetry. The classifier intentionally uses stable
 * Prisma error codes and coarse reasons so logs and durable job rows do not
 * capture transcript text, tokens, SQL parameters, or provider payloads.
 */

type PrismaDatabasePressureReason =
  | 'transaction_expired'
  | 'query_timeout'
  | 'pool_timeout'
  | 'write_conflict_or_deadlock'
  | 'connection_limit'

const getPrismaErrorCode = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return null
  }

  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

const getPrismaErrorMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return ''
  }

  const message = (error as { message?: unknown }).message
  return typeof message === 'string' ? message : ''
}

const classifyPrismaDatabasePressureError = (error: unknown): PrismaDatabasePressureReason | null => {
  const code = getPrismaErrorCode(error)
  if (code === 'P1008') {
    return 'query_timeout'
  }

  if (code === 'P2024') {
    return 'pool_timeout'
  }

  if (code === 'P2034') {
    return 'write_conflict_or_deadlock'
  }

  if (code === 'P2037') {
    return 'connection_limit'
  }

  const message = getPrismaErrorMessage(error)

  if (code === 'P2028') {
    return /transaction already closed|expired transaction|timeout/i.test(message)
      ? 'transaction_expired'
      : null
  }

  if (/socket timeout|und_err_socket|database failed to respond to a query within the configured timeout/i.test(message)) {
    return 'query_timeout'
  }

  return null
}

export {
  classifyPrismaDatabasePressureError,
  getPrismaErrorCode
}
export type {
  PrismaDatabasePressureReason
}
