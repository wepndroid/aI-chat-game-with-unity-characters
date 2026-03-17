import type { Response } from 'express'
import { authConfig, getIsSecureCookie } from './auth-config'

const AUTH_COOKIE_NAME = authConfig.cookieName

const setAuthCookie = (response: Response, token: string) => {
  response.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: getIsSecureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: authConfig.sessionTtlMs
  })
}

const clearAuthCookie = (response: Response) => {
  response.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: getIsSecureCookie(),
    sameSite: 'lax',
    path: '/'
  })
}

export { AUTH_COOKIE_NAME, clearAuthCookie, setAuthCookie }
