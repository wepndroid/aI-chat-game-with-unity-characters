'use client'

import Link from 'next/link'

const VerifyEmailPage = () => {
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

            <p className="mt-5 rounded-md border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              Verification links no longer auto-verify. Sign in, open your account page, then enter the verification code from your email.
            </p>

            <div className="mt-5 flex items-center justify-between text-xs text-white/70">
              <Link href="/profile" className="font-semibold text-ember-300 transition hover:text-ember-200" aria-label="Go to account page">
                Open Account
              </Link>
              <Link href="/sign-up" className="font-semibold text-ember-300 transition hover:text-ember-200" aria-label="Go to sign in/sign up">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default VerifyEmailPage
