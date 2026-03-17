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

const resendVerificationCode = async () => {
  return apiPost<{ data: { sent: boolean; alreadyVerified?: boolean } }>('/auth/resend-verification', {})
}

const verifyEmailCode = async (payload: VerifyEmailCodePayload) => {
  return apiPost<{ data: { verified: boolean } }>('/auth/verify-email-code', payload)
}

const getGoogleOauthStartUrl = (redirectAfter = '/profile') => {
  const query = new URLSearchParams({
    redirectAfter
  })

  return buildApiUrl(`/auth/oauth/google/start?${query.toString()}`)
}

const isGoogleOauthEnabled = () => process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === 'true'

export { getCurrentSessionUser, getGoogleOauthStartUrl, isGoogleOauthEnabled, loginWithPassword, logoutSession, registerWithPassword, resendVerificationCode, verifyEmailCode }
export type { LoginAuthPayload, RegisterAuthPayload, RegisterAuthResponse, VerifyEmailCodePayload }
