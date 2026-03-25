'use client'

import AuthInputField from '@/components/ui-elements/auth-input-field'
import { useAuth } from '@/components/providers/auth-provider'
import { getGoogleOauthStartUrl, isGoogleOauthEnabled } from '@/lib/auth-api'
import { AUTH_OPEN_SIGN_IN_MODAL_EVENT } from '@/lib/auth-events'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const signInQueryFlagKey = 'openSignIn'
const oauthQueryFlagKey = 'oauth'
const oauthMessageQueryFlagKey = 'message'
const isAdminBypassForTestingEnabled = process.env.NEXT_PUBLIC_ADMIN_TEST_BYPASS === 'true'

const normalizeOAuthErrorMessage = (rawMessage: string | null) => {
  if (!rawMessage) {
    return 'Google sign-in did not complete. Please try again.'
  }

  const normalized = rawMessage.trim().toLowerCase()

  if (normalized.includes('state') || normalized.includes('expired')) {
    return 'Google sign-in session expired. Please try again.'
  }

  if (normalized.includes('not completed') || normalized.includes('missing oauth callback code')) {
    return 'Google sign-in was canceled or incomplete. Please try again.'
  }

  if (normalized.includes('not available') || normalized.includes('not enabled')) {
    return 'Google sign-in is temporarily unavailable. Please contact support.'
  }

  return rawMessage
}

const readInitialSignInModalState = (pathname: string | null) => {
  if (typeof window === 'undefined' || pathname !== '/') {
    return {
      shouldOpen: false,
      errorMessage: null as string | null
    }
  }

  const url = new URL(window.location.href)
  const shouldOpenSignIn = url.searchParams.get(signInQueryFlagKey) === '1'
  const oauthStatus = url.searchParams.get(oauthQueryFlagKey)
  const oauthMessage = url.searchParams.get(oauthMessageQueryFlagKey)
  const shouldHandleOAuthError = oauthStatus === 'error'

  return {
    shouldOpen: shouldOpenSignIn || shouldHandleOAuthError,
    errorMessage: shouldHandleOAuthError ? normalizeOAuthErrorMessage(oauthMessage) : null
  }
}

const Header = () => {
  const pathname = usePathname()
  const googleOauthEnabled = isGoogleOauthEnabled()
  const { sessionUser, isAuthLoading, loginUser, logoutUser, clearAuthError } = useAuth()
  const [initialSignInModalState] = useState(() => readInitialSignInModalState(pathname))
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(initialSignInModalState.shouldOpen)
  const [emailInputValue, setEmailInputValue] = useState('')
  const [passwordInputValue, setPasswordInputValue] = useState('')
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signInErrorMessage, setSignInErrorMessage] = useState<string | null>(initialSignInModalState.errorMessage)

  const handleOpenSignInModal = () => {
    const redirectUrl = new URL(window.location.origin)
    redirectUrl.searchParams.set(signInQueryFlagKey, '1')
    window.location.assign(redirectUrl.toString())
  }

  const handleCloseSignInModal = () => {
    setIsSignInModalOpen(false)
    setSignInErrorMessage(null)
  }

  const handleModalContainerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) {
      return
    }

    handleCloseSignInModal()
  }

  const handleSignOut = async () => {
    setIsSigningOut(true)
    await logoutUser()
    setIsSigningOut(false)
  }

  const handleSignInSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedEmail = emailInputValue.trim().toLowerCase()
    const normalizedPassword = passwordInputValue.trim()
    setIsSigningIn(true)
    setSignInErrorMessage(null)

    const authenticationResult = await loginUser({
      email: normalizedEmail,
      password: normalizedPassword
    })

    if (!authenticationResult.success) {
      setSignInErrorMessage(authenticationResult.message ?? 'Unable to sign in.')
      setIsSigningIn(false)
      return
    }

    setEmailInputValue('')
    setPasswordInputValue('')
    setSignInErrorMessage(null)
    setIsSigningIn(false)
    handleCloseSignInModal()
  }

  const handleSignInWithGoogle = () => {
    if (!googleOauthEnabled) {
      setSignInErrorMessage('Google OAuth is not enabled yet.')
      return
    }

    // Use signup intent so first-time Google users can be provisioned seamlessly.
    window.location.assign(getGoogleOauthStartUrl('/profile', 'signup'))
  }

  useEffect(() => {
    const handleOpenSignInModalEvent = () => {
      clearAuthError()
      setSignInErrorMessage(null)
      setIsSignInModalOpen(true)
    }

    window.addEventListener(AUTH_OPEN_SIGN_IN_MODAL_EVENT, handleOpenSignInModalEvent)

    return () => {
      window.removeEventListener(AUTH_OPEN_SIGN_IN_MODAL_EVENT, handleOpenSignInModalEvent)
    }
  }, [clearAuthError])

  useEffect(() => {
    if (pathname !== '/') {
      return
    }

    const url = new URL(window.location.href)
    const shouldOpenSignIn = url.searchParams.get(signInQueryFlagKey) === '1'
    const oauthStatus = url.searchParams.get(oauthQueryFlagKey)
    const shouldHandleOAuthError = oauthStatus === 'error'

    if (!shouldOpenSignIn && !shouldHandleOAuthError) {
      return
    }

    clearAuthError()
    url.searchParams.delete(signInQueryFlagKey)
    url.searchParams.delete(oauthQueryFlagKey)
    url.searchParams.delete(oauthMessageQueryFlagKey)
    url.searchParams.delete('provider')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [pathname, clearAuthError])

  return (
    <>
      <header className="fixed z-40 w-[100%] border-b border-white/10 bg-[#0b0b0b]/35 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1150px] items-center justify-between px-5 py-5 md:px-8">
          <Link href="/" className="inline-flex items-center text-white" aria-label="SecretWaifu home">
            <Image src="/images/Logo.png" alt="SecretWaifu logo" width={164} height={44} className="h-9 w-auto" priority />
          </Link>

          <nav className="hidden items-center gap-9 text-xs font-semibold uppercase tracking-[0.2em] text-white/85 md:flex">
            <Link href="/" className="transition hover:text-ember-300" aria-label="Go to home">
              Home
            </Link>
            <Link href="/play-demo" className="transition hover:text-ember-300" aria-label="Go to play page">
              Play
            </Link>
            <Link href="/characters" className="transition hover:text-ember-300" aria-label="Go to characters">
              Characters
            </Link>
            {sessionUser ? (
              <Link href="/profile" className="transition hover:text-ember-300" aria-label="Go to profile">
                Profile
              </Link>
            ) : null}
            {(sessionUser?.role === 'ADMIN' && sessionUser.isEmailVerified) || (isAdminBypassForTestingEnabled && sessionUser) ? (
              <Link href="/admin/dashboard" className="transition hover:text-ember-300" aria-label="Go to admin dashboard">
                Admin
              </Link>
            ) : null}
          </nav>

          {sessionUser ? (
            <div className="flex items-center gap-3">
              <p className="hidden text-[11px] font-semibold uppercase tracking-[0.08em] text-white/80 md:block">
                {sessionUser.username} ({sessionUser.role.toLowerCase()})
              </p>
              <button
                type="button"
                className="rounded-md border border-white/30 bg-transparent px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:border-ember-300 hover:text-ember-200"
                aria-label="Sign out"
                onClick={handleSignOut}
                disabled={isSigningOut}
              >
                {isSigningOut ? 'Signing Out...' : 'Sign Out'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="rounded-md border border-ember-500/65 bg-[#2b160f]/85 px-5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ember-100 transition hover:bg-[#3a1d13]"
              aria-label="Open sign in modal"
              onClick={handleOpenSignInModal}
              disabled={isAuthLoading}
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {pathname === '/' && isSignInModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5"
          onClick={handleModalContainerClick}
          aria-label="Sign in modal backdrop"
          role="presentation"
        >
          <div className="w-full max-w-md rounded-2xl border border-ember-300/20 bg-[#171411]/95 p-6 shadow-ember backdrop-blur md:p-8">
            <div className="mb-5">
              <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold uppercase tracking-wider text-white">
                Welcome Back
              </h2>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/55">
                Click outside this panel to close.
              </p>
            </div>

            <form className="space-y-4" aria-label="Sign in form" onSubmit={handleSignInSubmit}>
              <AuthInputField
                label="Email Address"
                name="email"
                type="email"
                ariaLabel="Email address"
                value={emailInputValue}
                onChange={setEmailInputValue}
                autoComplete="email"
              />
              <AuthInputField
                label="Password"
                name="password"
                type="password"
                ariaLabel="Password"
                value={passwordInputValue}
                onChange={setPasswordInputValue}
                autoComplete="current-password"
              />

              {signInErrorMessage ? (
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-rose-300">{signInErrorMessage}</p>
              ) : null}

              <div className="pt-1 text-right">
                <Link
                  href="/auth/forgot-password"
                  className="text-xs font-semibold uppercase tracking-[0.08em] text-ember-300 transition hover:text-ember-200"
                  aria-label="Go to forgot password"
                >
                  Forgot Password?
                </Link>
              </div>

              <div className="text-right">
                <Link
                  href="/sign-up"
                  className="text-xs font-semibold uppercase tracking-[0.08em] text-ember-300 transition hover:text-ember-200"
                  aria-label="Go to sign up page"
                  onClick={handleCloseSignInModal}
                >
                  Create Account
                </Link>
              </div>

              <button
                type="submit"
                className="w-full rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:brightness-110"
                aria-label="Sign in to account"
                disabled={isSigningIn}
              >
                {isSigningIn ? 'Signing In...' : 'Sign In'}
              </button>

              <button
                type="button"
                className="w-full rounded-md border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:border-ember-300 hover:text-ember-200"
                aria-label="Sign in with Google"
                onClick={handleSignInWithGoogle}
              >
                Sign In with Google
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default Header
