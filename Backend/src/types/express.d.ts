import type { UserRole } from '@prisma/client'
import type { GameAccessRequestContext } from '../lib/game-access'

declare global {
  namespace Express {
    interface Request {
      authUser?:
        | {
            userId: string
            email: string
            role: UserRole
            isEmailVerified: boolean
            sessionId: string
          }
        | undefined
      gameAccessContext?: GameAccessRequestContext | undefined
    }
  }
}

export {}
