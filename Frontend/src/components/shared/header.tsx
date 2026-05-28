'use client'

import AuthInputField from '@/components/ui-elements/auth-input-field'
import { useAuth } from '@/components/providers/auth-provider'
import { useWebglPreloadIntent } from '@/components/providers/webgl-preload-provider'
import MaintenanceBanner from '@/components/shared/maintenance-banner'
import { HeaderNotificationsBell } from '@/components/shared/header-notifications-bell'
import { getGoogleOauthStartUrl, isGoogleOauthEnabled } from '@/lib/auth-api'
import { AUTH_OPEN_SIGN_IN_MODAL_EVENT, AUTH_OPEN_SIGN_UP_MODAL_EVENT } from '@/lib/auth-events'
import { trackGoogleOAuthStartEvent } from '@/lib/google-analytics-events'
import { trackLandingSignupClick } from '@/lib/landing-page-api'
import { AI_GIRLFRIEND_ROUTE_BASE } from '@/lib/ai-girlfriend-route'
import { getUnauthenticatedOAuthErrorMessage, stripOAuthRedirectQueryParams } from '@/lib/oauth-redirect-query'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const signInQueryFlagKey = 'openSignIn'
const signUpQueryFlagKey = 'openSignUp'
const signUpHashFlag = '#sign-up'
const oauthQueryFlagKey = 'oauth'

const primaryNavigationItems = [
  {
    href: '/',
    label: 'Home'
  },
  {
    href: AI_GIRLFRIEND_ROUTE_BASE,
    label: 'AI Girlfriends'
  },
  {
    href: '/play',
    label: 'Play'
  }
] as const

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

const Header = () => {
  const pathname = usePathname()
  const googleOauthEnabled = isGoogleOauthEnabled()
  const { sessionUser, isAuthLoading, registerUser, loginUser, logoutUser, clearAuthError } = useAuth()
  const { preloadOnIntent } = useWebglPreloadIntent()

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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement | null>(null)
  const [signInErrorMessage, setSignInErrorMessage] = useState<string | null>(null)
  const [signUpErrorMessage, setSignUpErrorMessage] = useState<string | null>(null)
  const previousSignUpModalOpenRef = useRef(false)
  const supportsInlineAuthModals = pathname === '/' || pathname === '/home2'

  const handleOpenSignInModal = () => {
    clearAuthError()
    setSignInErrorMessage(null)
    setSignUpErrorMessage(null)
    setIsSignUpModalOpen(false)
    setIsMobileMenuOpen(false)
    setIsSignInModalOpen(true)

    if (supportsInlineAuthModals) {
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
    setIsMobileMenuOpen(false)
    setIsSignUpModalOpen(true)

    if (supportsInlineAuthModals) {
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

  const handleCloseMobileMenu = () => {
    setIsMobileMenuOpen(false)
  }

  const handleModalContainerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) {
      return
    }

    handleCloseSignInModal()
  }

  const handleSignOut = async () => {
    setIsMobileMenuOpen(false)
    setAccountMenuOpen(false)
    setIsSigningOut(true)
    await logoutUser()
    setIsSigningOut(false)
  }

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isMobileMenuOpen])

  useEffect(() => {
    if (!accountMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const node = accountMenuRef.current
      if (!node || node.contains(event.target as Node)) {
        return
      }

      setAccountMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [accountMenuOpen])

  const handleSignInSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isSigningIn) {
      return
    }

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
    trackGoogleOAuthStartEvent('signup')
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
      setIsMobileMenuOpen(false)
      setIsSignInModalOpen(true)
      if (supportsInlineAuthModals) {
        const url = new URL(window.location.href)
        url.searchParams.set(signInQueryFlagKey, '1')
        url.searchParams.delete(signUpQueryFlagKey)
        const query = url.searchParams.toString()
        const next = query ? `${url.pathname}?${query}${url.hash}` : `${url.pathname}${url.hash}`
        window.history.replaceState({}, '', next)
      }
    }

    const handleOpenSignUpModalEvent = () => {
      clearAuthError()
      setIsSignInModalOpen(false)
      setSignInErrorMessage(null)
      setSignUpErrorMessage(null)
      setIsMobileMenuOpen(false)
      setIsSignUpModalOpen(true)

      if (supportsInlineAuthModals) {
        const url = new URL(window.location.href)
        url.searchParams.delete(signInQueryFlagKey)
        url.searchParams.set(signUpQueryFlagKey, '1')
        const query = url.searchParams.toString()
        const next = query ? `${url.pathname}?${query}${url.hash}` : `${url.pathname}${url.hash}`
        window.history.replaceState({}, '', next)
      }
    }

    window.addEventListener(AUTH_OPEN_SIGN_IN_MODAL_EVENT, handleOpenSignInModalEvent)
    window.addEventListener(AUTH_OPEN_SIGN_UP_MODAL_EVENT, handleOpenSignUpModalEvent)

    return () => {
      window.removeEventListener(AUTH_OPEN_SIGN_IN_MODAL_EVENT, handleOpenSignInModalEvent)
      window.removeEventListener(AUTH_OPEN_SIGN_UP_MODAL_EVENT, handleOpenSignUpModalEvent)
    }
  }, [clearAuthError, pathname, supportsInlineAuthModals])

  useEffect(() => {
    if (!supportsInlineAuthModals) {
      previousSignUpModalOpenRef.current = isSignUpModalOpen
      return
    }

    if (isSignUpModalOpen && !previousSignUpModalOpenRef.current) {
      void trackLandingSignupClick().catch(() => {
        // Signup click analytics should never block opening the modal.
      })
    }

    previousSignUpModalOpenRef.current = isSignUpModalOpen
  }, [isSignUpModalOpen, supportsInlineAuthModals])

  useEffect(() => {
    if (!supportsInlineAuthModals) {
      return
    }

    const url = new URL(window.location.href)
    const shouldOpenSignIn = url.searchParams.get(signInQueryFlagKey) === '1'
    const shouldOpenSignUp = url.searchParams.get(signUpQueryFlagKey) === '1'
    const normalizedHash = url.hash.trim().toLowerCase()
    const shouldOpenSignUpByHash = normalizedHash === signUpHashFlag || normalizedHash === '#signup'
    const oauthStatus = url.searchParams.get(oauthQueryFlagKey)
    const oauthErrorMessage = getUnauthenticatedOAuthErrorMessage(url.searchParams)
    const shouldHandleOAuthError = Boolean(oauthErrorMessage)
    const shouldIgnoreOAuthLinkError = oauthStatus === 'link_error'

    if (!shouldOpenSignIn && !shouldOpenSignUp && !shouldOpenSignUpByHash && !shouldHandleOAuthError && !shouldIgnoreOAuthLinkError) {
      return
    }

    clearAuthError()
    // Strip OAuth noise from the URL; keep openSignIn / openSignUp in the address bar while modals stay open.
    stripOAuthRedirectQueryParams(url.searchParams)
    if (shouldOpenSignUpByHash) {
      url.hash = ''
    }
    if (shouldIgnoreOAuthLinkError && !shouldOpenSignIn && !shouldOpenSignUp && !shouldOpenSignUpByHash) {
      const query = url.searchParams.toString()
      const next = query ? `${url.pathname}?${query}${url.hash}` : `${url.pathname}${url.hash}`
      window.history.replaceState({}, '', next)
      return
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

    queueMicrotask(() => {
      if (shouldOpenSignUp || shouldOpenSignUpByHash) {
        setIsSignUpModalOpen(true)
        setIsSignInModalOpen(false)
      } else {
        setIsSignInModalOpen(true)
        setIsSignUpModalOpen(false)
      }

      if (shouldHandleOAuthError && !shouldOpenSignUp) {
        setSignInErrorMessage(oauthErrorMessage)
      }
    })
  }, [supportsInlineAuthModals, clearAuthError])

  return (
    <>
      <header className="fixed z-40 w-[100%] border-b border-white/10 bg-[#0b0b0b]/35 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-[1150px] px-4 py-3 md:px-7 md:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-[18px] border border-ember-500/25 bg-[linear-gradient(180deg,rgba(56,24,15,0.92),rgba(18,10,8,0.96))] text-white shadow-[0_12px_28px_rgba(0,0,0,0.28)] transition hover:border-ember-400/55 hover:bg-[linear-gradient(180deg,rgba(78,31,17,0.95),rgba(24,11,8,0.98))] md:hidden"
                aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-site-menu"
                onClick={() => {
                  setAccountMenuOpen(false)
                  setIsMobileMenuOpen((open) => !open)
                }}
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  {isMobileMenuOpen ? (
                    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <>
                      <path d="M4 7h16" strokeLinecap="round" />
                      <path d="M4 12h16" strokeLinecap="round" />
                      <path d="M4 17h10" strokeLinecap="round" />
                    </>
                  )}
                </svg>
              </button>

              <Link href="/" className="inline-flex min-w-0 shrink items-center text-white" aria-label="SecretWaifu home">
                <Image
                  src="/images/SecretWaifu Logo White.svg"
                  alt="SecretWaifu logo"
                  width={164}
                  height={44}
                  className="h-7 w-auto max-w-[138px] md:h-9 md:max-w-none"
                  priority
                  suppressHydrationWarning
                />
              </Link>
            </div>

            <nav className="hidden items-center gap-7 text-xs font-semibold uppercase tracking-[0.2em] text-white/85 md:flex">
              {primaryNavigationItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onPointerEnter={item.href === '/play' ? preloadOnIntent : undefined}
                  onFocus={item.href === '/play' ? preloadOnIntent : undefined}
                  onTouchStart={item.href === '/play' ? preloadOnIntent : undefined}
                  className="transition hover:text-ember-300"
                  aria-label={`Go to ${item.label.toLowerCase()}`}
                >
                  {item.label}
                </Link>
              ))}
              {sessionUser ? (
                <Link href="/profile" className="transition hover:text-ember-300" aria-label="Go to account">
                  Account
                </Link>
              ) : null}
              {sessionUser?.role === 'ADMIN' ? (
                <Link href="/admin/dashboard" className="transition hover:text-ember-300" aria-label="Go to admin dashboard">
                  Admin
                </Link>
              ) : null}
            </nav>

            {sessionUser ? (
              <div className="flex shrink-0 items-center gap-1 md:gap-1.5">
                <HeaderNotificationsBell />
                <div className="relative" ref={accountMenuRef}>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/30 py-0.5 pl-0.5 pr-1.5 transition hover:border-white/35 hover:bg-black/45 md:pr-2.5"
                    aria-expanded={accountMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Account menu"
                    onClick={() => {
                      setIsMobileMenuOpen(false)
                      setAccountMenuOpen((open) => !open)
                    }}
                  >
                    <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-ember-500/40 to-black text-sm font-bold uppercase text-white">
                      {sessionUser.avatarUrl ? (
                        <Image
                          src={sessionUser.avatarUrl}
                          alt=""
                          width={36}
                          height={36}
                          unoptimized
                          className="size-9 object-cover"
                        />
                      ) : (
                        sessionUser.username.slice(0, 1)
                      )}
                    </span>
                    <span className="hidden max-w-[140px] truncate text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-white/85 md:inline">
                      {sessionUser.username}
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      className={`size-4 shrink-0 text-white/55 transition ${accountMenuOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {accountMenuOpen ? (
                    <div
                      className="absolute right-0 z-50 mt-2 w-[min(calc(100vw-2rem),16rem)] rounded-lg border border-ember-500/50 bg-[#020202] py-1 shadow-[0_16px_48px_rgba(0,0,0,0.65),0_0_0_1px_rgba(244,99,19,0.12)_inset] backdrop-blur-md"
                      role="menu"
                    >
                      <div className="border-b border-white/10 px-3 py-2 md:hidden">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/90">
                          {sessionUser.username}
                        </p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.06em] text-white/45">{sessionUser.role}</p>
                      </div>
                      <Link
                        href="/profile"
                        role="menuitem"
                        className="block px-3 py-2.5 text-left text-sm font-semibold uppercase tracking-[0.08em] text-white/75 transition hover:bg-white/[0.06]"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        Profile
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full border-t border-white/10 px-3 py-2.5 text-left text-sm font-semibold uppercase tracking-[0.08em] text-white/75 transition hover:bg-white/[0.06]"
                        onClick={() => void handleSignOut()}
                        disabled={isSigningOut}
                      >
                        {isSigningOut ? 'Signing out...' : 'Sign out'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="hidden shrink-0 rounded-md border border-ember-500/65 bg-[#2b160f]/85 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-ember-100 transition hover:bg-[#3a1d13] md:inline-flex"
                  aria-label="Open sign in modal"
                  onClick={handleOpenSignInModal}
                  disabled={isAuthLoading}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 shrink-0 items-center rounded-full border border-ember-400/45 bg-ember-500/12 px-3.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ember-100 transition hover:bg-ember-500/18 md:hidden"
                  aria-label="Open sign in modal"
                  onClick={handleOpenSignInModal}
                  disabled={isAuthLoading}
                >
                  Sign In
                </button>
              </div>
            )}
          </div>

          {isMobileMenuOpen ? (
            <div id="mobile-site-menu" className="mt-3 border-t border-white/10 pt-3 md:hidden" aria-label="Mobile navigation">
              <div className="overflow-hidden rounded-[24px] border border-ember-500/25 bg-[linear-gradient(180deg,rgba(39,16,10,0.96),rgba(14,9,8,0.98))] shadow-[0_22px_60px_rgba(0,0,0,0.42)]">
                {sessionUser ? (
                  <div className="border-b border-white/10 px-4 py-3">
                    <div className="flex items-center gap-3 rounded-[18px] bg-black/20 px-3 py-2.5">
                      <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-ember-500/40 to-black text-base font-bold uppercase text-white">
                        {sessionUser.avatarUrl ? (
                          <Image
                            src={sessionUser.avatarUrl}
                            alt=""
                            width={48}
                            height={48}
                            unoptimized
                            className="size-11 object-cover"
                          />
                        ) : (
                          sessionUser.username.slice(0, 1)
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold uppercase tracking-[0.12em] text-white">
                          {sessionUser.username}
                        </p>
                        <p className="mt-0.5 text-[12px] leading-4 text-white/55">Jump into your account and recent activity.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border-b border-white/10 px-4 py-3">
                    <div className="rounded-[18px] bg-[linear-gradient(135deg,rgba(244,99,19,0.18),rgba(255,255,255,0.03))] px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/94">Start chatting faster</p>
                      <p className="mt-1 text-[12px] leading-4 text-white/62">Sign in or create an account without leaving the page.</p>
                    </div>
                  </div>
                )}

                <div className="grid gap-1.5 p-3">
                  {primaryNavigationItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onPointerEnter={item.href === '/play' ? preloadOnIntent : undefined}
                      onFocus={item.href === '/play' ? preloadOnIntent : undefined}
                      onTouchStart={item.href === '/play' ? preloadOnIntent : undefined}
                      onClick={() => {
                        handleCloseMobileMenu()
                      }}
                      className="group rounded-[18px] border border-transparent bg-white/[0.03] px-4 py-3 transition hover:border-ember-400/35 hover:bg-white/[0.06]"
                      aria-label={`Go to ${item.label.toLowerCase()}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white">{item.label}</p>
                        <svg
                          viewBox="0 0 24 24"
                          className="size-4 shrink-0 text-white/45 transition group-hover:translate-x-0.5 group-hover:text-ember-200"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden
                        >
                          <path d="M5 12h14" strokeLinecap="round" />
                          <path d="m13 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </Link>
                  ))}

                  {sessionUser ? (
                    <Link
                      href="/profile"
                      onClick={handleCloseMobileMenu}
                      className="rounded-[18px] border border-ember-500/30 bg-ember-500/10 px-4 py-3 transition hover:border-ember-400/50 hover:bg-ember-500/14"
                      aria-label="Go to account"
                    >
                      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white">Account</p>
                    </Link>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        className="rounded-[18px] border border-ember-500/45 bg-ember-500/12 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ember-100 transition hover:bg-ember-500/18"
                        onClick={handleOpenSignInModal}
                      >
                        Sign In
                      </button>
                      <button
                        type="button"
                        className="rounded-[18px] border border-white/15 bg-white/[0.04] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.08]"
                        onClick={handleOpenSignUpModal}
                      >
                        Sign Up
                      </button>
                    </div>
                  )}

                  {sessionUser?.role === 'ADMIN' ? (
                    <Link
                      href="/admin/dashboard"
                      onClick={handleCloseMobileMenu}
                      className="rounded-[18px] border border-transparent bg-white/[0.03] px-4 py-3 transition hover:border-ember-400/35 hover:bg-white/[0.06]"
                      aria-label="Go to admin dashboard"
                    >
                      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white">Admin</p>
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <MaintenanceBanner />
      </header>

      {supportsInlineAuthModals && isSignInModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 sm:px-5"
          onClick={handleModalContainerClick}
          aria-label="Sign in modal backdrop"
          role="presentation"
        >
          <div className="w-full max-w-md rounded-[24px] border border-ember-300/20 bg-[#171411]/95 p-4 shadow-ember backdrop-blur sm:p-6 md:p-8">
            <div className="mb-4">
              <h2 className="font-[family-name:var(--font-heading)] text-[28px] font-extrabold uppercase tracking-[0.05em] text-white sm:text-4xl sm:tracking-wider">
                Welcome Back
              </h2>
              <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55 sm:mt-2 sm:text-xs">
                Click outside this panel to close.
              </p>
            </div>

            <form className="space-y-3.5 sm:space-y-4" aria-label="Sign in form" onSubmit={handleSignInSubmit}>
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

              <div className="pt-0.5 text-right">
                <Link
                  href="/auth/forgot-password"
                  className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ember-300 transition hover:text-ember-200 sm:text-xs"
                  aria-label="Go to forgot password"
                >
                  Forgot Password?
                </Link>
              </div>

              <div className="text-right">
                <button
                  type="button"
                  className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ember-300 transition hover:text-ember-200 sm:text-xs"
                  aria-label="Open sign up modal"
                  onClick={handleOpenSignUpModal}
                >
                  Create Account
                </button>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-ember-400 to-ember-500 px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.11em] text-black transition hover:brightness-110 sm:rounded-md sm:text-sm"
                aria-label="Sign in to account"
                disabled={isSigningIn}
              >
                {isSigningIn ? 'Signing In...' : 'Sign In'}
              </button>

              <button
                type="button"
                className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-white transition hover:border-ember-300 hover:text-ember-200 sm:rounded-md sm:text-sm"
                aria-label="Sign in with Google"
                onClick={handleSignInWithGoogle}
              >
                Sign In with Google
              </button>
            </form>
          </div>
        </div>
      ) : null}
      {supportsInlineAuthModals && isSignUpModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 sm:px-5"
          onClick={(event) => {
            if (event.currentTarget !== event.target) {
              return
            }
            handleCloseSignUpModal()
          }}
          aria-label="Sign up modal backdrop"
          role="presentation"
        >
          <div className="w-full max-w-md rounded-[24px] border border-ember-300/20 bg-[#171411]/95 p-4 shadow-ember backdrop-blur sm:p-6 md:p-8">
            <h2 className="font-[family-name:var(--font-heading)] text-[28px] font-extrabold uppercase tracking-[0.05em] text-white sm:text-4xl sm:tracking-wider">
              Create Account
            </h2>
            <p className="mt-2 text-[13px] leading-5 text-white/70 sm:mt-3 sm:text-sm">Register a new account to access your account and character management.</p>

            <form className="mt-4 space-y-3.5 sm:mt-5 sm:space-y-4" aria-label="Sign up form" onSubmit={handleSignUpSubmit}>
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
                className="w-full rounded-xl bg-gradient-to-r from-ember-400 to-ember-500 px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.11em] text-black transition hover:brightness-110 sm:rounded-md sm:text-sm"
                aria-label="Create account"
                disabled={isSigningUp}
              >
                {isSigningUp ? 'Creating Account...' : 'Sign Up'}
              </button>

              <button
                type="button"
                onClick={handleSignInWithGoogle}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-white transition hover:border-ember-300 hover:text-ember-200 sm:rounded-md sm:text-sm"
                aria-label="Sign up with Google"
              >
                Sign Up with Google
              </button>

              <p className="text-[12px] text-white/70 sm:text-xs">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    clearAuthError()
                    setSignUpErrorMessage(null)
                    setIsSignUpModalOpen(false)
                    setIsSignInModalOpen(true)
                    if (supportsInlineAuthModals) {
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
