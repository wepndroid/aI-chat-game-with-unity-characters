import cors from 'cors'
import express from 'express'
import morgan from 'morgan'
import { ZodError } from 'zod'
import characterRoutes from './routes/character-routes'
import healthRoutes from './routes/health-routes'
import patreonRoutes from './routes/patreon-routes'
import statsRoutes from './routes/stats-routes'
import userRoutes from './routes/user-routes'

const app = express()

const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? []

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true
  })
)
app.use(express.json({ limit: '10mb' }))
app.use(morgan('dev'))

app.use('/api', healthRoutes)
app.use('/api', userRoutes)
app.use('/api', characterRoutes)
app.use('/api', statsRoutes)
app.use('/api', patreonRoutes)

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
