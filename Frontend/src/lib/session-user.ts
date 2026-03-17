type SessionUserRole = 'USER' | 'CREATOR' | 'ADMIN'

type SessionUser = {
  id: string
  email: string
  username: string
  role: SessionUserRole
  isEmailVerified: boolean
  createdAt?: string
  updatedAt?: string
}

export type { SessionUser, SessionUserRole }
