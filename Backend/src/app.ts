import path from 'node:path'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import morgan from 'morgan'
import { ZodError } from 'zod'
import authRoutes from './routes/auth-routes'
import characterAssetUploadRoutes from './routes/character-asset-upload-routes'
import characterRoutes from './routes/character-routes'
import healthRoutes from './routes/health-routes'
import legacyRoutes from './routes/legacy-routes'
import patreonRoutes from './routes/patreon-routes'
import reviewRoutes from './routes/review-routes'
import statsRoutes from './routes/stats-routes'
import userRoutes from './routes/user-routes'

const app = express()

const normalizeOrigin = (origin: string) => {
  return origin.trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '')
}

const isProduction = process.env.NODE_ENV === 'production'
const configuredOrigins = process.env.CORS_ORIGIN?.split(',').map((origin) => normalizeOrigin(origin)).filter(Boolean) ?? []
const defaultDevOrigins = isProduction ? [] : ['http://127.0.0.1:5000', 'http://localhost:5000']
const allowedOrigins = new Set<string>([...configuredOrigins, ...defaultDevOrigins])

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
app.use(express.json({ limit: '10mb' }))
app.use(cookieParser())
app.use(morgan('dev'))

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
app.use('/', legacyRoutes)

app.use((_request, response) => {
  response.status(404).json({
    message: 'Route not found.'
  })
})

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      message: 'Validation failed.',
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
