import { apiGet, apiPost, buildApiUrl } from '@/lib/api-client'
import type { SessionUser } from '@/lib/session-user'

type AuthUserResponse = {
  data: {
    user: SessionUser
  }
}

type SessionUserTierWire = {
  code: string
  messageLimit?: number
  message_limit?: number
  periodDays?: number
  period_days?: number
  label?: string | null
}

type SessionUserWire = {
  id: string
  email: string
  username: string
  playerName?: string
  player_name?: string
  role: SessionUser['role']
  isEmailVerified?: boolean
  is_email_verified?: boolean
  hasPassword?: boolean
  has_password?: boolean
  avatarUrl?: string | null
  avatar_url?: string | null
  unreadNotificationCount?: number
  unread_notification_count?: number
  createdAt?: string
  created_at?: string
  updatedAt?: string
  updated_at?: string
  tierCode?: string | null
  tier_code?: string | null
  effectiveTierCode?: string | null
  effective_tier_code?: string | null
  tier?: SessionUserTierWire | null
}

type AuthUserResponseWire = {
  data: {
    user: SessionUserWire
  }
}

type AuthMeResponseWire =
  | {
      data: {
        user: SessionUserWire
      }
    }
  | {
      user: SessionUserWire
    }

type RegisterAuthPayload = {
  email: string
  username: string
  password: string
}

type RegisterAuthResponse = {
  data: {
    user: SessionUser
    requiresEmailVerification: boolean
    verificationEmailSent?: boolean
  }
}

type RegisterAuthResponseWire = {
  data: {
    user: SessionUserWire
    requiresEmailVerification?: boolean
    requires_email_verification?: boolean
    verificationEmailSent?: boolean
    verification_email_sent?: boolean
  }
}

type LoginAuthPayload = {
  email: string
  password: string
}

type VerifyEmailCodePayload = {
  code: string
}

type ForgotPasswordPayload = {
  email: string
}

type ResetPasswordPayload = {
  token: string
  password: string
}

type SetPasswordPayload = {
  password: string
}


type GoogleOAuthIntent = 'signin' | 'signup'

const normalizeSessionUser = (user: SessionUserWire): SessionUser => {
  const tier = user.tier
  const tierMessageLimit = tier?.message_limit ?? tier?.messageLimit
  const tierPeriodDays = tier?.period_days ?? tier?.periodDays
  const normalizedTier =
    tier && typeof tierMessageLimit === 'number' && typeof tierPeriodDays === 'number'
      ? {
          code: tier.code,
          messageLimit: tierMessageLimit,
          periodDays: tierPeriodDays,
          label: tier.label ?? null
        }
      : null

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    playerName: user.player_name ?? user.playerName ?? user.username,
    role: user.role,
    isEmailVerified: user.is_email_verified ?? user.isEmailVerified ?? false,
    hasPassword: user.has_password ?? user.hasPassword ?? false,
    avatarUrl: user.avatar_url ?? user.avatarUrl ?? null,
    unreadNotificationCount: user.unread_notification_count ?? user.unreadNotificationCount ?? 0,
    createdAt: user.created_at ?? user.createdAt,
    updatedAt: user.updated_at ?? user.updatedAt,
    tierCode: user.tier_code ?? user.tierCode ?? null,
    effectiveTierCode: user.effective_tier_code ?? user.effectiveTierCode ?? null,
    tier: normalizedTier
  }
}

const registerWithPassword = async (payload: RegisterAuthPayload): Promise<RegisterAuthResponse> => {
  const response = await apiPost<RegisterAuthResponseWire>('/auth/register', payload)

  return {
    data: {
      user: normalizeSessionUser(response.data.user),
      requiresEmailVerification:
        response.data.requires_email_verification ?? response.data.requiresEmailVerification ?? false,
      verificationEmailSent: response.data.verification_email_sent ?? response.data.verificationEmailSent
    }
  }
}

const loginWithPassword = async (payload: LoginAuthPayload): Promise<AuthUserResponse> => {
  const response = await apiPost<AuthUserResponseWire>('/auth/login', payload)

  return {
    data: {
      user: normalizeSessionUser(response.data.user)
    }
  }
}

const logoutSession = async () => {
  return apiPost<{ data: { logged_out: boolean } }>('/auth/logout')
}

const getCurrentSessionUser = async () => {
  const response = await apiGet<AuthMeResponseWire>('/auth/me')
  const responseUser = 'user' in response ? response.user : response.data.user

  return {
    user: normalizeSessionUser(responseUser)
  }
}

type WebGlBridgeTokenResponse = {
  data: {
    token: string
    expiresAt: string
    tokenType: 'Bearer'
  }
}

type WebGlBridgeTokenResponseWire = {
  data: {
    token: string
    expiresAt?: string
    expires_at?: string
    tokenType?: 'Bearer'
    token_type?: 'Bearer'
  }
}

type WebglStoryLaunchContextResponse = {
  data: {
    launchToken: string
    storyId: string
    characterId: string
    launchMode: 'fresh_session'
    expiresAt: string
  }
}

type WebglStoryLaunchContextResponseWire = {
  data: {
    launch_token: string
    story_id: string
    character_id: string
    launch_mode: 'fresh_session'
    expires_at: string
  }
}

/** Short-lived API token for Unity WebGL (`Authorization: Bearer`). Requires cookie session. */
const getWebGlBridgeToken = async (): Promise<WebGlBridgeTokenResponse> => {
  const response = await apiGet<WebGlBridgeTokenResponseWire>('/auth/webgl-token', { cache: 'no-store' })

  return {
    data: {
      token: response.data.token,
      expiresAt: response.data.expires_at ?? response.data.expiresAt ?? '',
      tokenType: response.data.token_type ?? response.data.tokenType ?? 'Bearer'
    }
  }
}

const issueWebglStoryLaunchContext = async (storyId: string): Promise<WebglStoryLaunchContextResponse> => {
  const normalizedStoryId = storyId.trim()

  if (!normalizedStoryId) {
    throw new Error('A story is required before launching chat.')
  }

  const response = await apiPost<WebglStoryLaunchContextResponseWire>(
    '/auth/webgl-launch-context',
    {
      story_id: normalizedStoryId,
      launch_mode: 'fresh_session'
    },
    { cache: 'no-store' }
  )

  return {
    data: {
      launchToken: response.data.launch_token,
      storyId: response.data.story_id,
      characterId: response.data.character_id,
      launchMode: response.data.launch_mode,
      expiresAt: response.data.expires_at
    }
  }
}

const resendVerificationCode = async () => {
  const response = await apiPost<{ data: { sent: boolean; alreadyVerified?: boolean; already_verified?: boolean } }>(
    '/auth/resend-verification',
    {}
  )

  return {
    data: {
      sent: response.data.sent,
      alreadyVerified: response.data.already_verified ?? response.data.alreadyVerified
    }
  }
}

const verifyEmailCode = async (payload: VerifyEmailCodePayload) => {
  return apiPost<{ data: { verified: boolean } }>('/auth/verify-email-code', payload)
}

const requestPasswordResetLink = async (payload: ForgotPasswordPayload) => {
  return apiPost<{ data: { sent: boolean } }>('/auth/forgot-password', payload)
}

const resetPasswordWithToken = async (payload: ResetPasswordPayload) => {
  return apiPost<{ data: { reset: boolean } }>('/auth/reset-password', payload)
}

const setPasswordForCurrentUser = async (payload: SetPasswordPayload) => {
  return apiPost<{ data: { set: boolean } }>('/auth/set-password', payload)
}


const getGoogleOauthStartUrl = (redirectAfter = '/profile', intent: GoogleOAuthIntent = 'signin') => {
  const query = new URLSearchParams({
    redirectAfter,
    intent
  })

  return buildApiUrl(`/auth/oauth/google/start?${query.toString()}`)
}

const isGoogleOauthEnabled = () => process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === 'true'

export {
  getCurrentSessionUser,
  getWebGlBridgeToken,
  getGoogleOauthStartUrl,
  issueWebglStoryLaunchContext,
  isGoogleOauthEnabled,
  loginWithPassword,
  logoutSession,
  registerWithPassword,
  requestPasswordResetLink,
  resendVerificationCode,
  resetPasswordWithToken,
  setPasswordForCurrentUser,
  verifyEmailCode
}
export type {
  ForgotPasswordPayload,
  GoogleOAuthIntent,
  LoginAuthPayload,
  RegisterAuthPayload,
  RegisterAuthResponse,
  ResetPasswordPayload,
  SetPasswordPayload,
  VerifyEmailCodePayload
}

