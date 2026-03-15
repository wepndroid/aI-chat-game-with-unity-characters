import { Router } from 'express'

const healthRoutes = Router()

healthRoutes.get('/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'ai-chat-game-backend',
    timestamp: new Date().toISOString()
  })
})

export default healthRoutes
