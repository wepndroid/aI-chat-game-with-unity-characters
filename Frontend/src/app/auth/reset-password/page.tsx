'use client'

import AuthInputField from '@/components/ui-elements/auth-input-field'
import { resetPasswordWithToken } from '@/lib/auth-api'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const ResetPasswordPage = () => {
  const [resetToken, setResetToken] = useState('')
  const [passwordInputValue, setPasswordInputValue] = useState('')
  const [confirmPasswordInputValue, setConfirmPasswordInputValue] = useState('')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResetComplete, setIsResetComplete] = useState(false)

  useEffect(() => {
    const url = new URL(window.location.href)
    const token = url.searchParams.get('token')?.trim()
    if (!token) {
      return
    }

    setResetToken(token)
    url.searchParams.delete('token')
    const query = url.searchParams.toString()
    window.history.replaceState({}, '', query ? `${url.pathname}?${query}${url.hash}` : `${url.pathname}${url.hash}`)
  }, [])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedResetToken = resetToken.trim()

    if (normalizedResetToken.length === 0) {
      setStatusMessage('Reset code is required.')
      return
    }

    if (passwordInputValue.trim() !== confirmPasswordInputValue.trim()) {
      setStatusMessage('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    setStatusMessage(null)

    try {
      await resetPasswordWithToken({
        token: normalizedResetToken,
        password: passwordInputValue
      })

      setIsResetComplete(true)
      setPasswordInputValue('')
      setConfirmPasswordInputValue('')
      setStatusMessage('Password reset completed. You can sign in with your new password.')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to reset password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.15),transparent_34%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px] opacity-45" />

        <div className="relative z-10 mx-auto w-full max-w-md pt-24">
          <div className="rounded-2xl border border-ember-300/20 bg-[#171411]/95 p-6 shadow-ember backdrop-blur md:p-8">
            <h1 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold uppercase tracking-wider text-white">
              Reset Password
            </h1>
            <p className="mt-3 text-sm text-white/70">
              Enter the reset code from your email and choose a new password.
            </p>

            <form className="mt-5 space-y-4" onSubmit={handleSubmit} aria-label="Reset password form">
              <AuthInputField
                label="Reset Code"
                name="reset-code"
                type="text"
                ariaLabel="Reset code"
                value={resetToken}
                onChange={setResetToken}
                autoComplete="one-time-code"
              />
              <AuthInputField
                label="New Password"
                name="new-password"
                type="password"
                ariaLabel="New password"
                value={passwordInputValue}
                onChange={setPasswordInputValue}
                autoComplete="new-password"
              />
              <AuthInputField
                label="Confirm Password"
                name="confirm-password"
                type="password"
                ariaLabel="Confirm new password"
                value={confirmPasswordInputValue}
                onChange={setConfirmPasswordInputValue}
                autoComplete="new-password"
              />

              {statusMessage ? <p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-200">{statusMessage}</p> : null}

              <button
                type="submit"
                className="w-full rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:brightness-110"
                disabled={isSubmitting || isResetComplete}
                aria-label="Submit new password"
              >
                {isSubmitting ? 'Resetting...' : isResetComplete ? 'Password Updated' : 'Update Password'}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between text-xs text-white/70">
              <Link href="/auth/forgot-password" className="font-semibold text-ember-300 transition hover:text-ember-200" aria-label="Request another reset link">
                Request New Link
              </Link>
              <Link href="/?openSignIn=1" className="font-semibold text-ember-300 transition hover:text-ember-200" aria-label="Open sign in modal">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default ResetPasswordPage
