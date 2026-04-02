import type { Request, Response, NextFunction } from 'express'

type CsrfOriginOptions = {
  allowedOrigins: Set<string>
  isProduction: boolean
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const normalizeOrigin = (origin: string) => origin.trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '')

const extractRequestOrigin = (request: Request): string | null => {
  const originHeader = request.get('origin')
  if (originHeader) {
    return normalizeOrigin(originHeader)
  }

  const refererHeader = request.get('referer')
  if (!refererHeader) {
    return null
  }

  try {
    const refererUrl = new URL(refererHeader)
    return normalizeOrigin(refererUrl.origin)
  } catch {
    return null
  }
}

const createCsrfOriginMiddleware = ({ allowedOrigins, isProduction }: CsrfOriginOptions) => {
  return (request: Request, response: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      next()
      return
    }

    // Non-browser callers might not send Origin/Referer. Allow in dev, block in production.
    const requestOrigin = extractRequestOrigin(request)
    if (!requestOrigin) {
      if (isProduction) {
        response.status(403).json({
          message: 'Origin header is required for state-changing requests.'
        })
        return
      }
      next()
      return
    }

    if (!allowedOrigins.has(requestOrigin)) {
      response.status(403).json({
        message: 'Request origin is not allowed.'
      })
      return
    }

    next()
  }
}

export { createCsrfOriginMiddleware, normalizeOrigin }
