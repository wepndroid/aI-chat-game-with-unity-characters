'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { verifyEmailWithToken } from '@/lib/auth-api'
import Link from 'next/link'
import { useEffect, useState } from 'react'

type VerificationStatus = 'loading' | 'success' | 'error'

const VerifyEmailPage = () => {
  const { refreshSessionUser } = useAuth()
  const [token] = useState(() => {
    if (typeof window === 'undefined') {
      return ''
    }

    return new URLSearchParams(window.location.search).get('token')?.trim() ?? ''
  })
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>(token ? 'loading' : 'error')
  const [statusMessage, setStatusMessage] = useState(
    token ? 'Verifying your email...' : 'Verification token is missing. Please request a new verification email.'
  )

  useEffect(() => {
    if (!token) {
      return
    }

    const run = async () => {
      try {
        await verifyEmailWithToken(token)
        await refreshSessionUser()
        setVerificationStatus('success')
        setStatusMessage('Email verified successfully. Your account is now active.')
      } catch (error) {
        setVerificationStatus('error')
        setStatusMessage(error instanceof Error ? error.message : 'Verification failed. Please request a new code.')
      }
    }

    run().catch(() => {
      setVerificationStatus('error')
      setStatusMessage('Verification failed. Please request a new code.')
    })
  }, [refreshSessionUser, token])

  return (
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.15),transparent_34%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px] opacity-45" />

        <div className="relative z-10 mx-auto w-full max-w-md pt-24">
          <div className="rounded-2xl border border-ember-300/20 bg-[#171411]/95 p-6 shadow-ember backdrop-blur md:p-8">
            <h1 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold uppercase tracking-wider text-white">
              Verify Email
            </h1>

            <p
              className={`mt-5 rounded-md border px-4 py-3 text-sm ${
                verificationStatus === 'success'
                  ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
                  : verificationStatus === 'error'
                    ? 'border-rose-300/30 bg-rose-300/10 text-rose-100'
                    : 'border-amber-300/25 bg-amber-300/10 text-amber-100'
              }`}
            >
              {statusMessage}
            </p>

            <div
              className={`mt-5 flex items-center text-xs text-white/70 ${
                verificationStatus === 'success' ? 'justify-start' : 'justify-between'
              }`}
            >
              <Link href="/profile" className="font-semibold text-ember-300 transition hover:text-ember-200" aria-label="Go to account page">
                Open Account
              </Link>
              {verificationStatus !== 'success' ? (
                <Link href="/sign-up" className="font-semibold text-ember-300 transition hover:text-ember-200" aria-label="Go to sign in/sign up">
                  Sign In
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default VerifyEmailPage
