import { apiGet, apiPost, buildApiUrl } from '@/lib/api-client'
import type { SessionUser } from '@/lib/session-user'

type AuthUserResponse = {
  data: {
    user: SessionUser
  }
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


type GoogleOAuthIntent = 'signin' | 'signup'

const registerWithPassword = async (payload: RegisterAuthPayload) => {
  return apiPost<RegisterAuthResponse>('/auth/register', payload)
}

const loginWithPassword = async (payload: LoginAuthPayload) => {
  return apiPost<AuthUserResponse>('/auth/login', payload)
}

const logoutSession = async () => {
  return apiPost<{ data: { loggedOut: boolean } }>('/auth/logout')
}

const getCurrentSessionUser = async () => {
  return apiGet<AuthUserResponse>('/auth/me')
}

type WebGlBridgeTokenResponse = {
  data: {
    token: string
    expiresAt: string
    tokenType: 'Bearer'
  }
}

/** Short-lived API token for Unity WebGL (`Authorization: Bearer`). Requires cookie session. */
const getWebGlBridgeToken = async () => {
  return apiGet<WebGlBridgeTokenResponse>('/auth/webgl-token')
}

const resendVerificationCode = async () => {
  return apiPost<{ data: { sent: boolean; alreadyVerified?: boolean } }>('/auth/resend-verification', {})
}

const verifyEmailCode = async (payload: VerifyEmailCodePayload) => {
  return apiPost<{ data: { verified: boolean } }>('/auth/verify-email-code', payload)
}

const verifyEmailWithToken = async (token: string) => {
  const query = new URLSearchParams({ token })
  return apiGet<{ data: { verified: boolean } }>(`/auth/verify-email?${query.toString()}`)
}

const requestPasswordResetLink = async (payload: ForgotPasswordPayload) => {
  return apiPost<{ data: { sent: boolean } }>('/auth/forgot-password', payload)
}

const resetPasswordWithToken = async (payload: ResetPasswordPayload) => {
  return apiPost<{ data: { reset: boolean } }>('/auth/reset-password', payload)
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
  isGoogleOauthEnabled,
  loginWithPassword,
  logoutSession,
  registerWithPassword,
  requestPasswordResetLink,
  resendVerificationCode,
  resetPasswordWithToken,
  verifyEmailWithToken,
  verifyEmailCode
}
export type {
  ForgotPasswordPayload,
  GoogleOAuthIntent,
  LoginAuthPayload,
  RegisterAuthPayload,
  RegisterAuthResponse,
  ResetPasswordPayload,
  VerifyEmailCodePayload
}

