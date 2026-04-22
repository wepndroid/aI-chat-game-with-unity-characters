import path from 'node:path'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { rateLimit } from 'express-rate-limit'
import { ZodError } from 'zod'
import { sendApiError } from './lib/api-contract'
import authRoutes from './routes/auth-routes'
import characterAssetUploadRoutes from './routes/character-asset-upload-routes'
import characterRoutes from './routes/character-routes'
import healthRoutes from './routes/health-routes'
import legacyImportRoutes from './routes/legacy-import-routes'
import legacyRoutes from './routes/legacy-routes'
import { createCsrfOriginMiddleware, normalizeOrigin } from './middleware/csrf-origin-middleware'
import { runtimeAdminSettingsMiddleware } from './middleware/runtime-admin-settings-middleware'
import patreonRoutes from './routes/patreon-routes'
import reviewRoutes from './routes/review-routes'
import imageGenerationRoutes from './routes/image-generation-routes'
import statsRoutes from './routes/stats-routes'
import landingPageRoutes from './routes/landing-page-routes'
import userRoutes from './routes/user-routes'
import chatQuotaRoutes from './routes/chat-quota-routes'
import storyRoutes from './routes/story-routes'
import userAvatarRoutes from './routes/user-avatar-routes'
import userNotificationRoutes from './routes/user-notification-routes'

const app = express()

const isProduction = process.env.NODE_ENV === 'production'
const configuredOrigins = process.env.CORS_ORIGIN?.split(',').map((origin) => normalizeOrigin(origin)).filter(Boolean) ?? []
const defaultDevOrigins = isProduction ? [] : ['http://127.0.0.1:7000', 'http://localhost:7000']
const allowedOrigins = new Set<string>([...configuredOrigins, ...defaultDevOrigins])
const trustedProxyHopCount = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '', 10)

app.set('trust proxy', Number.isFinite(trustedProxyHopCount) ? trustedProxyHopCount : isProduction ? 1 : 0)

/** v7 validations throw when proxies send X-Forwarded-For / Forwarded while trust proxy is off — yields 500. */
const rateLimitValidateRelaxed = {
  xForwardedForHeader: false,
  forwardedHeader: false
} as const

const buildRateLimitHandler =
  (message: string) =>
  (request: express.Request, response: express.Response): void => {
    const resetTime = (request as express.Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime
    const retryAfterSeconds =
      resetTime instanceof Date ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000)) : 60

    response.setHeader('Retry-After', String(retryAfterSeconds))
    sendApiError(response, 429, 'RATE_LIMITED', message)
  }

const shouldSkipGlobalApiRateLimit = (request: express.Request) => {
  const normalizedPath = request.path.toLowerCase()
  // Keep auth routes on dedicated auth/session limiters so passive auth checks
  // do not consume the global bucket and cause accidental sign-outs.
  return normalizedPath.startsWith('/auth/')
}

const globalApiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 600 : 1200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitValidateRelaxed,
  skip: shouldSkipGlobalApiRateLimit,
  handler: buildRateLimitHandler('Too many requests. Please try again later.')
})

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 40 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitValidateRelaxed,
  handler: buildRateLimitHandler('Too many authentication attempts. Please slow down.')
})

const authSessionProbeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 600 : 2400,
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitValidateRelaxed,
  handler: buildRateLimitHandler('Too many session checks. Please try again shortly.')
})

const assetUploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 30 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitValidateRelaxed,
  handler: buildRateLimitHandler('Too many upload attempts. Please try again later.')
})

app.use(
  cors({
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    exposedHeaders: ['Retry-After', 'Idempotency-Replayed'],
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true)
        return
      }

      const normalizedRequestOrigin = normalizeOrigin(origin)

      if (allowedOrigins.has(normalizedRequestOrigin)) {
        callback(null, true)
        return
      }

      callback(null, false)
    }
  })
)
app.use(
  helmet({
    // This is a JSON API (not serving frontend HTML), so strict CSP adds little value here.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    // Frontend (different port origin) must be able to render uploaded images.
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: false, limit: '1mb', parameterLimit: 100 }))
app.use(cookieParser())
app.use(morgan('dev'))
app.use(runtimeAdminSettingsMiddleware)
app.use('/api', globalApiRateLimit)
app.use(
  '/api',
  createCsrfOriginMiddleware({
    allowedOrigins,
    isProduction
  })
)
/**
 * Apply auth attempt throttling only to endpoints that represent explicit auth attempts.
 * Passive session checks use a separate higher bucket.
 */
app.use('/api/auth/me', authSessionProbeRateLimit)
app.use('/api/auth/webgl-token', authSessionProbeRateLimit)
app.use('/api/auth/login', authRateLimit)
app.use('/api/auth/register', authRateLimit)
app.use('/api/auth/forgot-password', authRateLimit)
app.use('/api/auth/reset-password', authRateLimit)
app.use('/api/auth/resend-verification', authRateLimit)
app.use('/api/characters/assets/upload', assetUploadRateLimit)
app.use('/api/users/me/avatar', assetUploadRateLimit)

const uploadsRoot = path.join(process.cwd(), 'uploads')
app.use(
  '/uploads',
  (request, response, next) => {
    const pathname = request.path.toLowerCase()
    // Raw VRM / VRMA files must only be served through signed endpoints.
    if (pathname.endsWith('.vrm') || pathname.endsWith('.vrma')) {
      response.status(403).json({
        message: 'Direct VRM access is disabled. Use the signed asset endpoint.'
      })
      return
    }
    next()
  },
  express.static(uploadsRoot)
)

app.use('/api', healthRoutes)
app.use('/api', authRoutes)
app.use('/api', userRoutes)
app.use('/api', userNotificationRoutes)
app.use('/api', userAvatarRoutes)
app.use('/api', characterAssetUploadRoutes)
app.use('/api', characterRoutes)
app.use('/api', legacyImportRoutes)
app.use('/api', reviewRoutes)
app.use('/api', imageGenerationRoutes)
app.use('/api', statsRoutes)
app.use('/api', landingPageRoutes)
app.use('/api', patreonRoutes)
app.use('/api', chatQuotaRoutes)
app.use('/api', storyRoutes)
app.use('/', legacyRoutes)

app.use((_request, response) => {
  sendApiError(response, 404, 'NOT_FOUND', 'Route not found.')
})

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    const first = error.issues[0]
    sendApiError(response, 400, 'VALIDATION_FAILED', first?.message ?? 'Validation failed.', {
      issues: error.issues
    })
    return
  }

  console.error(error)
  sendApiError(response, 500, 'INTERNAL_ERROR', 'Internal server error.')
})

export default app
