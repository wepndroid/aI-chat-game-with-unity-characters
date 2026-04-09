import path from 'node:path'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { rateLimit } from 'express-rate-limit'
import { ZodError } from 'zod'
import authRoutes from './routes/auth-routes'
import characterAssetUploadRoutes from './routes/character-asset-upload-routes'
import characterRoutes from './routes/character-routes'
import healthRoutes from './routes/health-routes'
import legacyRoutes from './routes/legacy-routes'
import { createCsrfOriginMiddleware, normalizeOrigin } from './middleware/csrf-origin-middleware'
import { runtimeAdminSettingsMiddleware } from './middleware/runtime-admin-settings-middleware'
import patreonRoutes from './routes/patreon-routes'
import reviewRoutes from './routes/review-routes'
import statsRoutes from './routes/stats-routes'
import userRoutes from './routes/user-routes'
import chatQuotaRoutes from './routes/chat-quota-routes'
import storyRoutes from './routes/story-routes'

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

const globalApiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 300 : 1200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitValidateRelaxed,
  message: {
    message: 'Too many requests. Please try again later.'
  }
})

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 40 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitValidateRelaxed,
  message: {
    message: 'Too many authentication attempts. Please slow down.'
  }
})

const assetUploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 30 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitValidateRelaxed,
  message: {
    message: 'Too many upload attempts. Please try again later.'
  }
})

app.use(
  cors({
    credentials: true,
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
app.use('/api/auth', authRateLimit)
app.use('/api/characters/assets/upload', assetUploadRateLimit)

const uploadsRoot = path.join(process.cwd(), 'uploads')
app.use('/uploads', express.static(uploadsRoot))

app.use('/api', healthRoutes)
app.use('/api', authRoutes)
app.use('/api', userRoutes)
app.use('/api', characterAssetUploadRoutes)
app.use('/api', characterRoutes)
app.use('/api', reviewRoutes)
app.use('/api', statsRoutes)
app.use('/api', patreonRoutes)
app.use('/api', chatQuotaRoutes)
app.use('/api', storyRoutes)
app.use('/', legacyRoutes)

app.use((_request, response) => {
  response.status(404).json({
    message: 'Route not found.'
  })
})

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    const first = error.issues[0]
    response.status(400).json({
      message: first?.message ?? 'Validation failed.',
      issues: error.issues
    })
    return
  }

  console.error(error)
  response.status(500).json({
    message: 'Internal server error.'
  })
})

export default app
