'use client'

import AuthInputField from '@/components/ui-elements/auth-input-field'
import { requestPasswordResetLink } from '@/lib/auth-api'
import Link from 'next/link'
import { useState } from 'react'

const ForgotPasswordPage = () => {
  const [emailInputValue, setEmailInputValue] = useState('')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setStatusMessage(null)

    try {
      await requestPasswordResetLink({
        email: emailInputValue.trim().toLowerCase()
      })

      // Keep response generic to match backend anti-enumeration behavior.
      setStatusMessage('If this account exists, a reset link has been sent to your inbox.')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to process password reset request.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.15),transparent_34%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px] opacity-45" />

        <div className="relative z-10 mx-auto w-full max-w-md pt-24">
          <div className="rounded-2xl border border-ember-300/20 bg-[#171411]/95 p-6 shadow-ember backdrop-blur md:p-8">
            <h1 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold uppercase tracking-wider text-white">
              Forgot Password
            </h1>
            <p className="mt-3 text-sm text-white/70">
              Enter your account email and we will send a password reset link.
            </p>

            <form className="mt-5 space-y-4" onSubmit={handleSubmit} aria-label="Forgot password form">
              <AuthInputField
                label="Email Address"
                name="email"
                type="email"
                ariaLabel="Email address for reset link"
                value={emailInputValue}
                onChange={setEmailInputValue}
                autoComplete="email"
              />

              {statusMessage ? <p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-200">{statusMessage}</p> : null}

              <button
                type="submit"
                className="w-full rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:brightness-110"
                disabled={isSubmitting}
                aria-label="Send password reset link"
              >
                {isSubmitting ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between text-xs text-white/70">
              <Link href="/" className="font-semibold text-ember-300 transition hover:text-ember-200" aria-label="Return to home">
                Back To Home
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

export default ForgotPasswordPage
