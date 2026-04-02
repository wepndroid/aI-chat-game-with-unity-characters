'use client'

import AuthInputField from '@/components/ui-elements/auth-input-field'
import { useAuth } from '@/components/providers/auth-provider'
import MaintenanceBanner from '@/components/shared/maintenance-banner'
import { getGoogleOauthStartUrl, isGoogleOauthEnabled } from '@/lib/auth-api'
import { AUTH_OPEN_SIGN_IN_MODAL_EVENT } from '@/lib/auth-events'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const signInQueryFlagKey = 'openSignIn'
const signUpQueryFlagKey = 'openSignUp'
const signUpHashFlag = '#sign-up'
const oauthQueryFlagKey = 'oauth'
const oauthMessageQueryFlagKey = 'message'

const replaceHomeUrlWithoutQueryKeys = (keysToRemove: string[]) => {
  if (typeof window === 'undefined') {
    return
  }
  const url = new URL(window.location.href)
  for (const key of keysToRemove) {
    url.searchParams.delete(key)
  }
  const query = url.searchParams.toString()
  const next = query ? `${url.pathname}?${query}${url.hash}` : `${url.pathname}${url.hash}`
  window.history.replaceState({}, '', next)
}

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

const Header = () => {
  const pathname = usePathname()
  const googleOauthEnabled = isGoogleOauthEnabled()
  const { sessionUser, isAuthLoading, registerUser, loginUser, logoutUser, clearAuthError } = useAuth()
  /** Closed on first paint so SSR and client match; open from URL in useEffect after hydrate. */
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false)
  const [isSignUpModalOpen, setIsSignUpModalOpen] = useState(false)
  const [emailInputValue, setEmailInputValue] = useState('')
  const [passwordInputValue, setPasswordInputValue] = useState('')
  const [signUpUsernameInputValue, setSignUpUsernameInputValue] = useState('')
  const [signUpEmailInputValue, setSignUpEmailInputValue] = useState('')
  const [signUpPasswordInputValue, setSignUpPasswordInputValue] = useState('')
  const [signUpConfirmPasswordInputValue, setSignUpConfirmPasswordInputValue] = useState('')
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signInErrorMessage, setSignInErrorMessage] = useState<string | null>(null)
  const [signUpErrorMessage, setSignUpErrorMessage] = useState<string | null>(null)

  const handleOpenSignInModal = () => {
    clearAuthError()
    setSignInErrorMessage(null)
    setSignUpErrorMessage(null)
    setIsSignUpModalOpen(false)
    setIsSignInModalOpen(true)

    if (pathname === '/') {
      const url = new URL(window.location.href)
      url.searchParams.set(signInQueryFlagKey, '1')
      url.searchParams.delete(signUpQueryFlagKey)
      const query = url.searchParams.toString()
      const next = query ? `${url.pathname}?${query}${url.hash}` : `${url.pathname}${url.hash}`
      window.history.replaceState({}, '', next)
    } else {
      window.location.assign(`${window.location.origin}/?${signInQueryFlagKey}=1`)
    }
  }

  const handleOpenSignUpModal = () => {
    clearAuthError()
    setIsSignInModalOpen(false)
    setSignInErrorMessage(null)
    setSignUpErrorMessage(null)
    setIsSignUpModalOpen(true)

    if (pathname === '/') {
      const url = new URL(window.location.href)
      url.searchParams.delete(signInQueryFlagKey)
      url.searchParams.set(signUpQueryFlagKey, '1')
      const query = url.searchParams.toString()
      const next = query ? `${url.pathname}?${query}${url.hash}` : `${url.pathname}${url.hash}`
      window.history.replaceState({}, '', next)
    }
  }

  const handleCloseSignInModal = () => {
    setIsSignInModalOpen(false)
    setSignInErrorMessage(null)
    replaceHomeUrlWithoutQueryKeys([signInQueryFlagKey])
  }

  const handleCloseSignUpModal = () => {
    setIsSignUpModalOpen(false)
    setSignUpErrorMessage(null)
    replaceHomeUrlWithoutQueryKeys([signUpQueryFlagKey])
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

  const handleSignUpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isSigningUp) {
      return
    }

    if (signUpPasswordInputValue.trim() !== signUpConfirmPasswordInputValue.trim()) {
      setSignUpErrorMessage('Passwords do not match.')
      return
    }

    setIsSigningUp(true)
    setSignUpErrorMessage(null)

    const registrationResult = await registerUser({
      username: signUpUsernameInputValue,
      email: signUpEmailInputValue,
      password: signUpPasswordInputValue
    })

    if (!registrationResult.success) {
      setSignUpErrorMessage(registrationResult.message ?? 'Unable to create account.')
      setIsSigningUp(false)
      return
    }

    setSignUpUsernameInputValue('')
    setSignUpEmailInputValue('')
    setSignUpPasswordInputValue('')
    setSignUpConfirmPasswordInputValue('')
    setIsSigningUp(false)
    handleCloseSignUpModal()
  }

  useEffect(() => {
    const handleOpenSignInModalEvent = () => {
      clearAuthError()
      setSignInErrorMessage(null)
      setSignUpErrorMessage(null)
      setIsSignUpModalOpen(false)
      setIsSignInModalOpen(true)
      if (pathname === '/') {
        const url = new URL(window.location.href)
        url.searchParams.set(signInQueryFlagKey, '1')
        url.searchParams.delete(signUpQueryFlagKey)
        const query = url.searchParams.toString()
        const next = query ? `${url.pathname}?${query}${url.hash}` : `${url.pathname}${url.hash}`
        window.history.replaceState({}, '', next)
      }
    }

    window.addEventListener(AUTH_OPEN_SIGN_IN_MODAL_EVENT, handleOpenSignInModalEvent)

    return () => {
      window.removeEventListener(AUTH_OPEN_SIGN_IN_MODAL_EVENT, handleOpenSignInModalEvent)
    }
  }, [clearAuthError, pathname])

  useEffect(() => {
    if (pathname !== '/') {
      return
    }

    const url = new URL(window.location.href)
    const shouldOpenSignIn = url.searchParams.get(signInQueryFlagKey) === '1'
    const shouldOpenSignUp = url.searchParams.get(signUpQueryFlagKey) === '1'
    const normalizedHash = url.hash.trim().toLowerCase()
    const shouldOpenSignUpByHash = normalizedHash === signUpHashFlag || normalizedHash === '#signup'
    const oauthStatus = url.searchParams.get(oauthQueryFlagKey)
    const oauthMessage = url.searchParams.get(oauthMessageQueryFlagKey)
    const shouldHandleOAuthError = oauthStatus === 'error'

    if (!shouldOpenSignIn && !shouldOpenSignUp && !shouldOpenSignUpByHash && !shouldHandleOAuthError) {
      return
    }

    if (shouldOpenSignUp || shouldOpenSignUpByHash) {
      setIsSignUpModalOpen(true)
      setIsSignInModalOpen(false)
    } else {
      setIsSignInModalOpen(true)
      setIsSignUpModalOpen(false)
    }
    if (shouldHandleOAuthError && !shouldOpenSignUp) {
      setSignInErrorMessage(normalizeOAuthErrorMessage(oauthMessage))
    }

    clearAuthError()
    // Strip OAuth noise from the URL; keep openSignIn / openSignUp in the address bar while modals stay open.
    url.searchParams.delete(oauthQueryFlagKey)
    url.searchParams.delete(oauthMessageQueryFlagKey)
    url.searchParams.delete('provider')
    if (shouldOpenSignUpByHash) {
      url.hash = ''
    }
    if (shouldOpenSignUp || shouldOpenSignUpByHash) {
      url.searchParams.set(signUpQueryFlagKey, '1')
      url.searchParams.delete(signInQueryFlagKey)
    } else {
      url.searchParams.set(signInQueryFlagKey, '1')
      url.searchParams.delete(signUpQueryFlagKey)
    }
    const query = url.searchParams.toString()
    const next = query ? `${url.pathname}?${query}${url.hash}` : `${url.pathname}${url.hash}`
    window.history.replaceState({}, '', next)
  }, [pathname, clearAuthError])

  return (
    <>
      <header className="fixed z-40 w-[100%] border-b border-white/10 bg-[#0b0b0b]/35 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-[1150px] px-5 py-4 md:px-8 md:py-5">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="inline-flex shrink-0 items-center text-white" aria-label="SecretWaifu home">
              <Image src="/images/SecretWaifu Logo White.svg" alt="SecretWaifu logo" width={164} height={44} className="h-9 w-auto" priority />
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
              {sessionUser?.role === 'ADMIN' ? (
                <Link href="/admin/dashboard" className="transition hover:text-ember-300" aria-label="Go to admin dashboard">
                  Admin
                </Link>
              ) : null}
            </nav>

            {sessionUser ? (
              <div className="flex shrink-0 items-center gap-3">
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
                className="shrink-0 rounded-md border border-ember-500/65 bg-[#2b160f]/85 px-5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ember-100 transition hover:bg-[#3a1d13]"
                aria-label="Open sign in modal"
                onClick={handleOpenSignInModal}
                disabled={isAuthLoading}
              >
                Sign In
              </button>
            )}
          </div>

          <nav
            className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/85 md:hidden"
            aria-label="Primary navigation"
          >
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
            {sessionUser?.role === 'ADMIN' ? (
              <Link href="/admin/dashboard" className="transition hover:text-ember-300" aria-label="Go to admin dashboard">
                Admin
              </Link>
            ) : null}
          </nav>
        </div>
        <MaintenanceBanner />
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
                <button
                  type="button"
                  className="text-xs font-semibold uppercase tracking-[0.08em] text-ember-300 transition hover:text-ember-200"
                  aria-label="Open sign up modal"
                  onClick={handleOpenSignUpModal}
                >
                  Create Account
                </button>
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
      {pathname === '/' && isSignUpModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5"
          onClick={(event) => {
            if (event.currentTarget !== event.target) {
              return
            }
            handleCloseSignUpModal()
          }}
          aria-label="Sign up modal backdrop"
          role="presentation"
        >
          <div className="w-full max-w-md rounded-2xl border border-ember-300/20 bg-[#171411]/95 p-6 shadow-ember backdrop-blur md:p-8">
            <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold uppercase tracking-wider text-white">
              Create Account
            </h2>
            <p className="mt-3 text-sm text-white/70">Register a new account to access your profile and character management.</p>

            <form className="mt-5 space-y-4" aria-label="Sign up form" onSubmit={handleSignUpSubmit}>
              <AuthInputField
                label="Username"
                name="username"
                type="text"
                ariaLabel="Username"
                value={signUpUsernameInputValue}
                onChange={setSignUpUsernameInputValue}
                autoComplete="username"
              />
              <AuthInputField
                label="Email Address"
                name="email"
                type="email"
                ariaLabel="Email address"
                value={signUpEmailInputValue}
                onChange={setSignUpEmailInputValue}
                autoComplete="email"
              />
              <AuthInputField
                label="Password"
                name="password"
                type="password"
                ariaLabel="Password"
                value={signUpPasswordInputValue}
                onChange={setSignUpPasswordInputValue}
                autoComplete="new-password"
              />
              <AuthInputField
                label="Confirm Password"
                name="confirm-password"
                type="password"
                ariaLabel="Confirm password"
                value={signUpConfirmPasswordInputValue}
                onChange={setSignUpConfirmPasswordInputValue}
                autoComplete="new-password"
              />

              {signUpErrorMessage ? (
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-rose-300">{signUpErrorMessage}</p>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:brightness-110"
                aria-label="Create account"
                disabled={isSigningUp}
              >
                {isSigningUp ? 'Creating Account...' : 'Sign Up'}
              </button>

              <button
                type="button"
                onClick={handleSignInWithGoogle}
                className="w-full rounded-md border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:border-ember-300 hover:text-ember-200"
                aria-label="Sign up with Google"
              >
                Sign Up with Google
              </button>

              <p className="text-xs text-white/70">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    clearAuthError()
                    setSignUpErrorMessage(null)
                    setIsSignUpModalOpen(false)
                    setIsSignInModalOpen(true)
                    if (pathname === '/') {
                      const url = new URL(window.location.href)
                      url.searchParams.delete(signUpQueryFlagKey)
                      url.searchParams.set(signInQueryFlagKey, '1')
                      const q = url.searchParams.toString()
                      const next = q ? `${url.pathname}?${q}${url.hash}` : `${url.pathname}${url.hash}`
                      window.history.replaceState({}, '', next)
                    }
                  }}
                  className="font-semibold text-ember-300 transition hover:text-ember-200"
                  aria-label="Open sign in modal"
                >
                  Sign In
                </button>
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default Header
