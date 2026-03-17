import type { UserRole } from '@prisma/client'

declare global {
  namespace Express {
    interface Request {
      authUser?:
        | {
            userId: string
            email: string
            role: UserRole
            sessionId: string
          }
        | undefined
    }
  }
}

export {}
