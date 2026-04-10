'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { ProfileAvatarCropDialog } from '@/components/profile/profile-avatar-crop-dialog'
import AccountSideMenu from '@/components/shared/account-side-menu'
import { resendVerificationCode, verifyEmailCode } from '@/lib/auth-api'
import { removeUserAvatar, uploadUserAvatar } from '@/lib/user-api'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

const ProfilePage = () => {
  const { sessionUser, isAuthLoading, refreshSessionUser } = useAuth()
  const [verificationCodeInputValue, setVerificationCodeInputValue] = useState('')
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null)
  const [isVerificationBusy, setIsVerificationBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarMessage, setAvatarMessage] = useState<{ text: string; variant: 'success' | 'error' } | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const [avatarCropSrc, setAvatarCropSrc] = useState<string | null>(null)
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl)
      }
    }
  }, [avatarPreviewUrl])

  useEffect(() => {
    return () => {
      if (avatarCropSrc?.startsWith('blob:')) {
        URL.revokeObjectURL(avatarCropSrc)
      }
    }
  }, [avatarCropSrc])

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

  const uploadCroppedAvatarBlob = useCallback(
    async (blob: Blob) => {
      const previewUrl = URL.createObjectURL(blob)
      setAvatarPreviewUrl(previewUrl)
      setAvatarMessage(null)
      setAvatarBusy(true)
      try {
        await uploadUserAvatar(new File([blob], 'profile-avatar.jpg', { type: 'image/jpeg' }))
        await refreshSessionUser()
        setAvatarPreviewUrl(null)
      } catch (error) {
        setAvatarMessage({
          text: error instanceof Error ? error.message : 'Upload failed.',
          variant: 'error'
        })
        setAvatarPreviewUrl(null)
      } finally {
        setAvatarBusy(false)
      }
    },
    [refreshSessionUser]
  )

  const handleAvatarCropConfirm = useCallback(
    (blob: Blob) => {
      setAvatarCropSrc(null)
      void uploadCroppedAvatarBlob(blob)
    },
    [uploadCroppedAvatarBlob]
  )

  const handleAvatarCropCancel = useCallback(() => {
    setAvatarCropSrc(null)
  }, [])

  const handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
    setAvatarCropSrc(URL.createObjectURL(file))
  }

  const handleOpenCropCurrentAvatar = useCallback(() => {
    if (!sessionUser?.isEmailVerified || avatarBusy) {
      return
    }
    const src = avatarPreviewUrl ?? sessionUser.avatarUrl
    if (!src) {
      return
    }
    setAvatarMessage(null)
    setAvatarCropSrc(src)
  }, [avatarBusy, avatarPreviewUrl, sessionUser?.avatarUrl, sessionUser?.isEmailVerified])

  const handleRemoveAvatar = async () => {
    if (!sessionUser?.avatarUrl) {
      return
    }

    setAvatarMessage(null)
    setAvatarBusy(true)

    try {
      await removeUserAvatar()
      setAvatarPreviewUrl(null)
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
            Account
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
                    Used in the site header. Choose a photo, then drag and zoom to fit the circle. JPEG, PNG, WebP, or GIF — up to 3MB.
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
                  <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                    <div className="relative size-[104px] shrink-0">
                      <div className="group relative flex size-[104px] items-center justify-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-ember-500/35 to-black text-3xl font-bold uppercase text-white">
                        {avatarPreviewUrl ? (
                          <Image
                            src={avatarPreviewUrl}
                            alt=""
                            width={104}
                            height={104}
                            unoptimized
                            className="size-[104px] object-cover object-center"
                          />
                        ) : sessionUser.avatarUrl ? (
                          <Image
                            src={sessionUser.avatarUrl}
                            alt=""
                            width={104}
                            height={104}
                            unoptimized
                            className="size-[104px] object-cover object-center"
                          />
                        ) : (
                          <span aria-hidden>{sessionUser.username.slice(0, 1)}</span>
                        )}
                        {sessionUser.isEmailVerified && (avatarPreviewUrl || sessionUser.avatarUrl) ? (
                          <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
                            <div className="absolute inset-x-0 bottom-0 flex h-[46%] min-h-[40px] translate-y-full transform-gpu items-end justify-center bg-gradient-to-t from-black/80 via-black/45 to-transparent pb-2 backdrop-blur-[3px] transition-transform duration-300 ease-out will-change-transform motion-reduce:transition-none group-hover:translate-y-0 group-focus-within:translate-y-0">
                              <button
                                type="button"
                                className="pointer-events-auto flex size-9 items-center justify-center rounded-full border border-white/25 bg-black/55 text-white shadow-md transition hover:bg-black/70 hover:text-ember-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400 disabled:cursor-not-allowed disabled:opacity-40"
                                disabled={avatarBusy}
                                aria-label="Crop profile photo"
                                title="Crop photo"
                                onClick={() => handleOpenCropCurrentAvatar()}
                              >
                                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M4 8V4h4M20 16v4h-4M16 4h4v4M8 20H4v-4M9 9h6v6H9V9z"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="absolute right-0 top-0 z-10 flex size-8 items-center justify-center rounded-full border border-ember-500/60 bg-[#1a0f0c]/95 text-ember-100 shadow-md backdrop-blur-sm transition hover:bg-[#2b160f] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={avatarBusy || !sessionUser.isEmailVerified}
                        aria-label={avatarBusy ? 'Uploading profile photo' : 'Upload profile photo'}
                        title="Upload photo"
                        onClick={() => {
                          setAvatarMessage(null)
                          avatarFileInputRef.current?.click()
                        }}
                      >
                        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                          />
                        </svg>
                      </button>
                      {sessionUser.avatarUrl && !avatarPreviewUrl ? (
                        <button
                          type="button"
                          className="absolute bottom-0 right-0 z-10 flex size-8 items-center justify-center rounded-full border border-rose-400/45 bg-[#1a0f0c]/95 text-rose-200 shadow-md backdrop-blur-sm transition hover:bg-rose-950/50 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={avatarBusy}
                          aria-label="Remove profile photo"
                          title="Remove photo"
                          onClick={() => void handleRemoveAvatar()}
                        >
                          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                            />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
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
      {avatarCropSrc ? (
        <ProfileAvatarCropDialog
          imageSrc={avatarCropSrc}
          onCancel={handleAvatarCropCancel}
          onConfirm={handleAvatarCropConfirm}
          isBusy={false}
        />
      ) : null}
    </main>
  )
}

export default ProfilePage
