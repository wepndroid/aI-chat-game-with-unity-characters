import path from 'node:path'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { rateLimit } from 'express-rate-limit'
import { sendApiError } from './lib/api-contract'
import { installRuntimeLogCapture } from './lib/runtime-log-buffer'
import { applyWebglReleaseStaticHeaders } from './lib/webgl-release-static-headers'
import { apiErrorHandler } from './middleware/api-error-handler'
import adminLogRoutes from './routes/admin-log-routes'
import authRoutes, { setWebglLaunchResolveNoStoreCacheControl } from './routes/auth-routes'
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
import marketingRoutes from './routes/marketing-routes'
import statsRoutes from './routes/stats-routes'
import landingPageRoutes from './routes/landing-page-routes'
import userRoutes from './routes/user-routes'
import chatQuotaRoutes from './routes/chat-quota-routes'
import ttsRoutes from './routes/tts-routes'
import storyRoutes from './routes/story-routes'
import userAvatarRoutes from './routes/user-avatar-routes'
import userNotificationRoutes from './routes/user-notification-routes'
import unityHelperLlmRoutes from './routes/unity-helper-llm-routes'
import unityQuotaFixtureRoutes from './routes/unity-quota-fixture-routes'
import unityTtsFixtureRoutes from './routes/unity-tts-fixture-routes'
import staticPageRoutes from './routes/static-page-routes'
import newsRoutes from './routes/news-routes'

const app = express()

installRuntimeLogCapture()

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

const unityHelperLlmRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 60 : 240,
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitValidateRelaxed,
  handler: buildRateLimitHandler('Too many structured helper requests. Please try again later.')
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
app.use('/api', setWebglLaunchResolveNoStoreCacheControl)
app.use(
  express.json({
    limit: '10mb',
    verify: (request, _response, buffer) => {
      ;(request as express.Request & { rawBody?: string }).rawBody = buffer.toString('utf8')
    }
  })
)
app.use(express.urlencoded({ extended: false, limit: '1mb', parameterLimit: 100 }))
app.use(cookieParser())
app.use(morgan('dev'))
app.use(runtimeAdminSettingsMiddleware)
app.use('/api', globalApiRateLimit)
app.use(
  '/api',
  createCsrfOriginMiddleware({
    allowedOrigins,
    isProduction,
    csrfExemptPaths: new Set(['/auth/unity-token', '/patreon/webhook'])
  })
)
/**
 * Apply auth attempt throttling only to endpoints that represent explicit auth attempts.
 * Passive session checks use a separate higher bucket.
 */
app.use('/api/auth/me', authSessionProbeRateLimit)
app.use('/api/auth/webgl-token', authSessionProbeRateLimit)
app.use('/api/auth/login', authRateLimit)
app.use('/api/auth/unity-token', authRateLimit)
app.use('/api/auth/webgl-launch-context', authRateLimit)
app.use('/api/auth/register', authRateLimit)
app.use('/api/auth/forgot-password', authRateLimit)
app.use('/api/auth/reset-password', authRateLimit)
app.use('/api/auth/set-password', authRateLimit)
app.use('/api/auth/resend-verification', authRateLimit)
app.use('/api/characters/assets/upload', assetUploadRateLimit)
app.use('/api/users/me/avatar', assetUploadRateLimit)
app.use('/api/unity/llm/structured-generate', unityHelperLlmRateLimit)

const uploadsRoot = path.join(process.cwd(), 'uploads')
app.use(
  '/uploads',
  (request, response, next) => {
    // WebGL releases are embedded inside the frontend /play page, which lives on a
    // different origin in local/dev and can also be split in production.
    // Helmet sets X-Frame-Options: SAMEORIGIN by default, so remove it for uploads.
    response.removeHeader('X-Frame-Options')
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')

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
  express.static(uploadsRoot, {
    setHeaders: (response, filePath) => {
      applyWebglReleaseStaticHeaders(response, path.relative(uploadsRoot, filePath))
    }
  })
)

app.use('/api', healthRoutes)
app.use('/api', adminLogRoutes)
app.use('/api', authRoutes)
app.use('/api', userRoutes)
app.use('/api', userNotificationRoutes)
app.use('/api', userAvatarRoutes)
app.use('/api', staticPageRoutes)
app.use('/api', newsRoutes)
app.use('/api', characterAssetUploadRoutes)
app.use('/api', characterRoutes)
app.use('/api', legacyImportRoutes)
app.use('/api', reviewRoutes)
app.use('/api', imageGenerationRoutes)
app.use('/api', marketingRoutes)
app.use('/api', statsRoutes)
app.use('/api', landingPageRoutes)
app.use('/api', patreonRoutes)
app.use('/api', chatQuotaRoutes)
app.use('/api', ttsRoutes)
app.use('/api', unityHelperLlmRoutes)
app.use('/api', unityQuotaFixtureRoutes)
app.use('/api', unityTtsFixtureRoutes)
app.use('/api', storyRoutes)
app.use('/', legacyRoutes)

if (isProduction) {
  const { default: gameReleaseRoutes } = require('./routes/game-release-routes') as typeof import('./routes/game-release-routes')
  app.use('/api', gameReleaseRoutes)
}

app.use((_request, response) => {
  sendApiError(response, 404, 'NOT_FOUND', 'Route not found.')
})

app.use(apiErrorHandler)

export default app
