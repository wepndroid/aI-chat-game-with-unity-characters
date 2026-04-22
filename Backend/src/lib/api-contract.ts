import type { Response } from 'express'

type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'VALIDATION_ERROR'
  | 'QUOTA_EXHAUSTED'
  | 'QUOTA_EXCEEDED'
  | 'AI_PROVIDER_FAILURE'
  | 'RATE_LIMITED'
  | 'SESSION_INVALID'
  | 'DUPLICATE_REQUEST'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INTERNAL_ERROR'
  | string

type ApiErrorPayload = {
  error: {
    code: ApiErrorCode
    message: string
    details?: Record<string, unknown> | null
  }
  code: ApiErrorCode
  message: string
  details?: Record<string, unknown> | null
}

type CursorPage = {
  nextCursor: string | null
}

const sendApiData = <T>(
  response: Response,
  data: T,
  options?: {
    status?: number
    page?: CursorPage
  }
) => {
  const status = options?.status ?? 200
  const page = options?.page

  if (page) {
    response.status(status).json({
      data,
      page
    })
    return
  }

  response.status(status).json({
    data
  })
}

const sendApiError = (
  response: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown> | null
) => {
  const payload: ApiErrorPayload = {
    error: {
      code,
      message,
      ...(details ? { details } : {})
    },
    code,
    message,
    ...(details ? { details } : {})
  }

  response.status(status).json(payload)
}

const decodeOffsetCursor = (cursor: string | undefined | null) => {
  if (!cursor || cursor.trim().length === 0) {
    return 0
  }

  const normalized = cursor.trim()
  const parsed = Number.parseInt(normalized, 10)

  if (!Number.isNaN(parsed) && parsed >= 0) {
    return parsed
  }

  try {
    const decoded = Buffer.from(normalized, 'base64url').toString('utf8')
    const nextParsed = Number.parseInt(decoded, 10)
    return Number.isNaN(nextParsed) || nextParsed < 0 ? 0 : nextParsed
  } catch {
    return 0
  }
}

const encodeOffsetCursor = (offset: number) => {
  if (!Number.isFinite(offset) || offset < 0) {
    return null
  }

  return Buffer.from(String(offset), 'utf8').toString('base64url')
}

export { decodeOffsetCursor, encodeOffsetCursor, sendApiData, sendApiError }
export type { ApiErrorCode, CursorPage }
