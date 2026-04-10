type SessionUserRole = 'USER' | 'CREATOR' | 'ADMIN'

type SessionUserTier = {
  code: string
  messageLimit: number
  periodDays: number
  label: string | null
}

type SessionUser = {
  id: string
  email: string
  username: string
  role: SessionUserRole
  isEmailVerified: boolean
  /** Self-hosted profile image URL (`/uploads/...`) when set. */
  avatarUrl?: string | null
  /** Published scenarios rejected by moderation that the author has not yet acknowledged / viewed. */
  unreadRejectedStoryCount?: number
  createdAt?: string
  updatedAt?: string
  /** Optional override — maps to Tier table (PDF schema). */
  tierCode?: string | null
  tier?: SessionUserTier | null
}

export type { SessionUser, SessionUserRole, SessionUserTier }
