'use client'

import { useAuth } from '@/components/providers/auth-provider'
import AccountSideMenu from '@/components/shared/account-side-menu'
import { resendVerificationCode, verifyEmailCode } from '@/lib/auth-api'
import { removeUserAvatar, uploadUserAvatar } from '@/lib/user-api'
import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState } from 'react'

const ProfilePage = () => {
  const { sessionUser, isAuthLoading, refreshSessionUser } = useAuth()
  const [verificationCodeInputValue, setVerificationCodeInputValue] = useState('')
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null)
  const [isVerificationBusy, setIsVerificationBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarMessage, setAvatarMessage] = useState<{ text: string; variant: 'success' | 'error' } | null>(null)
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null)

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
      const payload = await resendVerificationCode()

      if (payload.data.alreadyVerified) {
        await refreshSessionUser()
        setVerificationMessage('Your email is already verified.')
        return
      }

      setVerificationCodeInputValue('')
      setVerificationMessage('A new verification code was sent. Previous codes are now invalid.')
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
      const rawMessage = error instanceof Error ? error.message : 'Verification failed.'
      const normalizedMessage = rawMessage.trim().toLowerCase()

      if (normalizedMessage.includes('invalid') || normalizedMessage.includes('expired')) {
        setVerificationMessage('Code is invalid or expired. Click Resend Code to get a fresh code.')
      } else {
        setVerificationMessage(rawMessage)
      }
    } finally {
      setIsVerificationBusy(false)
    }
  }

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file || !sessionUser) {
      return
    }

    if (!sessionUser.isEmailVerified) {
      setAvatarMessage({ text: 'Verify your email before uploading a profile photo.', variant: 'error' })
      return
    }

    setAvatarMessage(null)
    setAvatarBusy(true)

    try {
      await uploadUserAvatar(file)
      await refreshSessionUser()
      setAvatarMessage({ text: 'Profile photo updated.', variant: 'success' })
    } catch (error) {
      setAvatarMessage({
        text: error instanceof Error ? error.message : 'Upload failed.',
        variant: 'error'
      })
    } finally {
      setAvatarBusy(false)
    }
  }

  const handleRemoveAvatar = async () => {
    if (!sessionUser?.avatarUrl) {
      return
    }

    setAvatarMessage(null)
    setAvatarBusy(true)

    try {
      await removeUserAvatar()
      await refreshSessionUser()
      setAvatarMessage({ text: 'Profile photo removed.', variant: 'success' })
    } catch (error) {
      setAvatarMessage({
        text: error instanceof Error ? error.message : 'Could not remove photo.',
        variant: 'error'
      })
    } finally {
      setAvatarBusy(false)
    }
  }

  return (
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-150px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_0%,rgba(244,99,19,0.12),transparent_36%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-50" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-4xl font-normal italic leading-none text-white md:text-5xl">
            Profile
          </h1>

          <div className="mt-10 grid min-w-0 gap-8 lg:grid-cols-[380px_1fr]">
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

              {sessionUser ? (
                <div className="mt-6 rounded-md border border-white/10 bg-black/20 p-4 md:p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/70">Profile photo</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/55">
                    Used in the site header. JPEG, PNG, WebP, or GIF — up to 3MB.
                  </p>
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    aria-hidden
                    tabIndex={-1}
                    onChange={handleAvatarFileChange}
                  />
                  <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                    <div className="relative flex size-[104px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-ember-500/35 to-black text-3xl font-bold uppercase text-white">
                      {sessionUser.avatarUrl ? (
                        <Image
                          src={sessionUser.avatarUrl}
                          alt=""
                          width={104}
                          height={104}
                          unoptimized
                          className="size-[104px] object-cover"
                        />
                      ) : (
                        <span aria-hidden>{sessionUser.username.slice(0, 1)}</span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="inline-flex h-10 items-center justify-center rounded-md border border-ember-500/55 bg-[#2b160f]/85 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ember-100 transition hover:bg-[#3a1d13] disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={avatarBusy || !sessionUser.isEmailVerified}
                          onClick={() => {
                            setAvatarMessage(null)
                            avatarFileInputRef.current?.click()
                          }}
                        >
                          {avatarBusy ? 'Uploading…' : 'Upload new photo'}
                        </button>
                        {sessionUser.avatarUrl ? (
                          <button
                            type="button"
                            className="inline-flex h-10 items-center justify-center rounded-md border border-rose-400/35 bg-transparent px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-200/95 transition hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={avatarBusy}
                            onClick={() => void handleRemoveAvatar()}
                          >
                            Remove photo
                          </button>
                        ) : null}
                      </div>
                      {!sessionUser.isEmailVerified ? (
                        <p className="text-[11px] leading-relaxed text-amber-200/85">
                          Verify your email to upload a profile photo.
                        </p>
                      ) : null}
                      {avatarMessage ? (
                        <p
                          className={`text-xs font-medium ${
                            avatarMessage.variant === 'success' ? 'text-emerald-200/95' : 'text-rose-200'
                          }`}
                          role={avatarMessage.variant === 'error' ? 'alert' : 'status'}
                        >
                          {avatarMessage.text}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

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

              {sessionUser ? (
                <div className="mt-5 rounded-md border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/70">Password reset</p>
                  <p className="mt-2 text-xs text-white/65">Forgot your password? Request a reset link by e-mail.</p>
                  <Link
                    href="/auth/forgot-password"
                    className="mt-3 inline-flex h-10 min-w-[180px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-white transition hover:brightness-110"
                    aria-label="Open forgot password page"
                  >
                    Password Reset
                  </Link>
                </div>
              ) : null}

            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default ProfilePage
