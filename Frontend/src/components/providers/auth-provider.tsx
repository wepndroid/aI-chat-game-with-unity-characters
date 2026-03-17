'use client'

import { getCurrentSessionUser, loginWithPassword, logoutSession, registerWithPassword } from '@/lib/auth-api'
import type { LoginAuthPayload, RegisterAuthPayload } from '@/lib/auth-api'
import type { SessionUser } from '@/lib/session-user'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type AuthActionResult = {
  success: boolean
  message?: string
}

type RegisterActionResult = AuthActionResult & {
  requiresEmailVerification?: boolean
}

type AuthContextValue = {
  sessionUser: SessionUser | null
  isAuthLoading: boolean
  authErrorMessage: string | null
  refreshSessionUser: () => Promise<void>
  registerUser: (payload: RegisterAuthPayload) => Promise<RegisterActionResult>
  loginUser: (payload: LoginAuthPayload) => Promise<AuthActionResult>
  logoutUser: () => Promise<void>
  clearAuthError: () => void
}

type AuthProviderProps = {
  children: React.ReactNode
}

const AuthContext = createContext<AuthContextValue | null>(null)

const isAuthMissingSessionError = (message: string) => {
  const normalizedMessage = message.trim().toLowerCase()
  return (
    normalizedMessage.includes('authentication required') ||
    normalizedMessage.includes('session user not found') ||
    normalizedMessage.includes('session user was not found')
  )
}

const AuthProvider = ({ children }: AuthProviderProps) => {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null)

  const refreshSessionUser = useCallback(async () => {
    try {
      const payload = await getCurrentSessionUser()
      setSessionUser(payload.data.user)
      setAuthErrorMessage(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load session user.'

      if (isAuthMissingSessionError(message)) {
        setSessionUser(null)
        setAuthErrorMessage(null)
        return
      }

      setSessionUser(null)
      setAuthErrorMessage(message)
    } finally {
      setIsAuthLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshSessionUser().catch(() => {
      setSessionUser(null)
      setIsAuthLoading(false)
    })
  }, [refreshSessionUser])

  const registerUser = useCallback(async (payload: RegisterAuthPayload): Promise<RegisterActionResult> => {
    try {
      const response = await registerWithPassword(payload)
      setSessionUser(response.data.user)
      setAuthErrorMessage(null)

      return {
        success: true,
        requiresEmailVerification: response.data.requiresEmailVerification
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create account.'
      setAuthErrorMessage(message)
      return {
        success: false,
        message
      }
    }
  }, [])

  const loginUser = useCallback(async (payload: LoginAuthPayload): Promise<AuthActionResult> => {
    try {
      const response = await loginWithPassword(payload)
      setSessionUser(response.data.user)
      setAuthErrorMessage(null)
      return {
        success: true
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.'
      setAuthErrorMessage(message)
      return {
        success: false,
        message
      }
    }
  }, [])

  const logoutUser = useCallback(async () => {
    try {
      await logoutSession()
    } catch {
      // Ignore logout network failures and clear local session state anyway.
    } finally {
      setSessionUser(null)
      setAuthErrorMessage(null)
    }
  }, [])

  const clearAuthError = useCallback(() => {
    setAuthErrorMessage(null)
  }, [])

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      sessionUser,
      isAuthLoading,
      authErrorMessage,
      refreshSessionUser,
      registerUser,
      loginUser,
      logoutUser,
      clearAuthError
    }),
    [sessionUser, isAuthLoading, authErrorMessage, refreshSessionUser, registerUser, loginUser, logoutUser, clearAuthError]
  )

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}

const useAuth = () => {
  const contextValue = useContext(AuthContext)

  if (!contextValue) {
    throw new Error('useAuth must be used inside AuthProvider.')
  }

  return contextValue
}

export { AuthProvider, useAuth }
