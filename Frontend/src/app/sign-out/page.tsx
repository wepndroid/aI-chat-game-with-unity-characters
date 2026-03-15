'use client'

import { clearSessionUser } from '@/lib/auth-session'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect } from 'react'

const SignOutPage = () => {
  const router = useRouter()

  useEffect(() => {
    clearSessionUser()
    router.replace('/')
  }, [router])

  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.16),transparent_34%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-45" />

        <div className="relative z-10 mx-auto w-full max-w-5xl pt-24 text-center">
          <h1 className="font-[family-name:var(--font-heading)] text-5xl font-semibold italic leading-none text-white md:text-6xl">
            Signed Out
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/75">
            Your session has been cleared. Redirecting to home...
          </p>

          <div className="mt-8 flex justify-center">
            <Link
              href="/"
              className="inline-flex h-11 min-w-[220px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-xs font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110"
              aria-label="Return to home"
            >
              Return Home
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

export default SignOutPage
