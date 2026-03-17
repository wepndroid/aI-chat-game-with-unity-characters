'use client'

import { useAuth } from '@/components/providers/auth-provider'
import AccountSideMenu from '@/components/shared/account-side-menu'
import { resendVerificationCode, verifyEmailCode } from '@/lib/auth-api'
import { useState } from 'react'

const ProfilePage = () => {
  const { sessionUser, isAuthLoading, refreshSessionUser } = useAuth()
  const [verificationCodeInputValue, setVerificationCodeInputValue] = useState('')
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null)
  const [isVerificationBusy, setIsVerificationBusy] = useState(false)

  const memberSinceLabel = (() => {
    if (!sessionUser?.createdAt) {
      return 'Member Since -'
    }

    const parsedDate = new Date(sessionUser.createdAt)

    if (Number.isNaN(parsedDate.getTime())) {
      return 'Member Since -'
    }

    return `Member Since ${new Intl.DateTimeFormat('en-US', {
      month: 'short',
      year: 'numeric'
    }).format(parsedDate)}`
  })()

  const handleResendVerificationCode = async () => {
    if (!sessionUser || sessionUser.isEmailVerified) {
      return
    }

    setIsVerificationBusy(true)
    setVerificationMessage(null)

    try {
      await resendVerificationCode()
      setVerificationMessage('Verification code sent. Please check your Gmail inbox.')
    } catch (error) {
      setVerificationMessage(error instanceof Error ? error.message : 'Unable to send verification code.')
    } finally {
      setIsVerificationBusy(false)
    }
  }

  const handleVerifyEmailCode = async () => {
    if (!sessionUser || sessionUser.isEmailVerified) {
      return
    }

    const normalizedCode = verificationCodeInputValue.trim().toUpperCase()

    if (normalizedCode.length < 6) {
      setVerificationMessage('Enter a valid verification code.')
      return
    }

    setIsVerificationBusy(true)
    setVerificationMessage(null)

    try {
      await verifyEmailCode({
        code: normalizedCode
      })

      await refreshSessionUser()
      setVerificationCodeInputValue('')
      setVerificationMessage('Email verified successfully.')
    } catch (error) {
      setVerificationMessage(error instanceof Error ? error.message : 'Verification failed.')
    } finally {
      setIsVerificationBusy(false)
    }
  }

  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-150px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_0%,rgba(244,99,19,0.12),transparent_36%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-50" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-4xl font-normal italic leading-none text-white md:text-5xl">
            Profile
          </h1>

          <div className="mt-10 grid gap-8 lg:grid-cols-[380px_1fr]">
            <AccountSideMenu activeKey="profile" />

            <div className="rounded-md border border-white/10 bg-[#1a1414]/95 p-6 md:p-10">
              <h2 className="font-[family-name:var(--font-heading)] text-4xl font-normal italic leading-none text-white md:text-5xl">
                {isAuthLoading ? 'Loading...' : sessionUser?.username || 'Guest'}
              </h2>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">{memberSinceLabel}</p>
              {sessionUser ? (
                <p className="mt-2 text-[11px] uppercase tracking-[0.08em] text-white/55">
                  {sessionUser.email} | {sessionUser.isEmailVerified ? 'Email Verified' : 'Email Not Verified'}
                </p>
              ) : (
                <p className="mt-2 text-[11px] uppercase tracking-[0.08em] text-rose-300">Sign in to access account details</p>
              )}
              {sessionUser && !sessionUser.isEmailVerified ? (
                <div className="mt-5 rounded-md border border-amber-300/25 bg-amber-300/10 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-100">
                    Verify your e-mail with one-time code
                  </p>
                  <p className="mt-2 text-xs text-white/75">
                    Click resend, check Gmail inbox, then enter the code below.
                  </p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={verificationCodeInputValue}
                      onChange={(event) => setVerificationCodeInputValue(event.target.value)}
                      placeholder="Enter code"
                      className="h-11 w-full rounded-md border border-white/20 bg-black/25 px-3 text-sm uppercase tracking-[0.08em] text-white outline-none transition placeholder:text-white/35 focus:border-ember-300"
                      aria-label="Email verification code"
                    />
                    <button
                      type="button"
                      className="inline-flex h-11 min-w-[160px] items-center justify-center rounded-md border border-white/20 bg-white/5 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white transition hover:border-ember-300 hover:text-ember-200 disabled:opacity-60"
                      onClick={handleVerifyEmailCode}
                      disabled={isVerificationBusy}
                    >
                      Verify Code
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-11 min-w-[160px] items-center justify-center rounded-md border border-white/20 bg-white/5 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white transition hover:border-ember-300 hover:text-ember-200 disabled:opacity-60"
                      onClick={handleResendVerificationCode}
                      disabled={isVerificationBusy}
                    >
                      Resend Code
                    </button>
                  </div>
                  {verificationMessage ? <p className="mt-2 text-xs text-amber-100">{verificationMessage}</p> : null}
                </div>
              ) : null}

              <button
                type="button"
                className="mt-12 inline-flex h-12 min-w-[250px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-[11px] font-bold uppercase tracking-[0.08em] text-white transition hover:brightness-110"
                aria-label="Connect Patreon account"
                disabled={!sessionUser}
              >
                Connect With Patreon o
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default ProfilePage
