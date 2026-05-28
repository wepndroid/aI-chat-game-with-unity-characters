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
  /** In-game display name editable from profile. Falls back to `username` when unset. */
  playerName: string
  role: SessionUserRole
  isEmailVerified: boolean
  /** True once this account can use email/password login in Unity Desktop/VR. */
  hasPassword: boolean
  /** Self-hosted profile image URL (`/uploads/...`) when set. */
  avatarUrl?: string | null
  /** Unread in-app notifications (scenario rejections + VRM moderation events, etc.). */
  unreadNotificationCount?: number
  createdAt?: string
  updatedAt?: string
  /** Optional override — maps to Tier table (PDF schema). */
  tierCode?: string | null
  /** Resolved product tier after admin override and active entitlements are applied. */
  effectiveTierCode?: string | null
  tier?: SessionUserTier | null
}

export type { SessionUser, SessionUserRole, SessionUserTier }
