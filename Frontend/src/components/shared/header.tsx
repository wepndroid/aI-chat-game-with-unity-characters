'use client'

import AuthInputField from '@/components/ui-elements/auth-input-field'
import {
  AUTH_SESSION_CHANGED_EVENT,
  authenticateAuthUser,
  clearSessionUser,
  readSessionUser,
  writeSessionUser
} from '@/lib/auth-session'
import type { SessionUser } from '@/lib/auth-session'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

const Header = () => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false)
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(() => readSessionUser())
  const [usernameInputValue, setUsernameInputValue] = useState('')
  const [emailInputValue, setEmailInputValue] = useState('')
  const [passwordInputValue, setPasswordInputValue] = useState('')
  const [signInErrorMessage, setSignInErrorMessage] = useState<string | null>(null)

  const handleOpenSignInModal = () => {
    setSignInErrorMessage(null)
    setIsSignInModalOpen(true)
  }

  const handleCloseSignInModal = () => {
    setIsSignInModalOpen(false)
  }

  const handleModalContainerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) {
      return
    }

    handleCloseSignInModal()
  }

  const handleSignOut = () => {
    setSessionUser(null)
    clearSessionUser()
  }

  const handleSignInSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedEmail = emailInputValue.trim().toLowerCase()
    const normalizedPassword = passwordInputValue.trim()

    const authenticationResult = authenticateAuthUser(normalizedEmail, normalizedPassword)

    if (!authenticationResult.success) {
      setSignInErrorMessage(authenticationResult.message)
      return
    }

    const nextSessionUser: SessionUser = authenticationResult.sessionUser

    setSessionUser(nextSessionUser)
    writeSessionUser(nextSessionUser)
    setUsernameInputValue('')
    setEmailInputValue('')
    setPasswordInputValue('')
    setSignInErrorMessage(null)
    handleCloseSignInModal()
  }

  useEffect(() => {
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      handleCloseSignInModal()
    }

    window.addEventListener('keydown', handleDocumentKeyDown)

    return () => {
      window.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [])

  useEffect(() => {
    const handleSessionChanged = () => {
      setSessionUser(readSessionUser())
    }

    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, handleSessionChanged)
    window.addEventListener('storage', handleSessionChanged)

    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, handleSessionChanged)
      window.removeEventListener('storage', handleSessionChanged)
    }
  }, [])

  useEffect(() => {
    if (searchParams.get('openSignIn') !== '1') {
      return
    }

    setSignInErrorMessage(null)
    setIsSignInModalOpen(true)

    if (pathname === '/') {
      router.replace('/')
      return
    }

    router.replace(pathname)
  }, [pathname, router, searchParams])

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
            {sessionUser?.role === 'admin' ? (
              <Link href="/admin/dashboard" className="transition hover:text-ember-300" aria-label="Go to admin dashboard">
                Admin
              </Link>
            ) : null}
          </nav>

          {sessionUser ? (
            <div className="flex items-center gap-3">
              <p className="hidden text-[11px] font-semibold uppercase tracking-[0.08em] text-white/80 md:block">
                {sessionUser.username} ({sessionUser.role})
              </p>
              <button
                type="button"
                className="rounded-md border border-white/30 bg-transparent px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:border-ember-300 hover:text-ember-200"
                aria-label="Sign out"
                onClick={handleSignOut}
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="rounded-md border border-ember-500/65 bg-[#2b160f]/85 px-5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ember-100 transition hover:bg-[#3a1d13]"
              aria-label="Open sign in modal"
              onClick={handleOpenSignInModal}
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {isSignInModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5"
          onClick={handleModalContainerClick}
          aria-label="Sign in modal backdrop"
          role="presentation"
        >
          <div className="w-full max-w-md rounded-2xl border border-ember-300/20 bg-[#171411]/95 p-6 shadow-ember backdrop-blur md:p-8">
            <div className="mb-5 flex items-start justify-between gap-3">
              <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold uppercase tracking-wider text-white">
                Welcome Back
              </h2>
              <button
                type="button"
                className="rounded-md border border-ember-300/30 px-2 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-ember-200 transition hover:border-ember-200 hover:text-white"
                onClick={handleCloseSignInModal}
                aria-label="Close sign in modal"
              >
                Close
              </button>
            </div>

            <form className="space-y-4" aria-label="Sign in form" onSubmit={handleSignInSubmit}>
              <AuthInputField
                label="Username"
                name="username"
                type="text"
                ariaLabel="Username"
                value={usernameInputValue}
                onChange={setUsernameInputValue}
                autoComplete="username"
              />
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
              >
                Sign In
              </button>

              <p className="text-[11px] leading-5 text-white/60">
                Admin demo login: <span className="text-ember-300">admin@secretwaifu.com / admin123</span>
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default Header
