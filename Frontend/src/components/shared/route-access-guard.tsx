'use client'

import { useAuth } from '@/components/providers/auth-provider'
import type { SessionUserRole } from '@/lib/session-user'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type RouteAccessGuardProps = {
  children: React.ReactNode
  requiredRole?: SessionUserRole
}

const RouteAccessGuard = ({ children, requiredRole }: RouteAccessGuardProps) => {
  const { sessionUser, isAuthLoading } = useAuth()
  const pathname = usePathname()

  if (isAuthLoading) {
    return (
      <main className="relative overflow-hidden bg-[#030303] text-white">
        <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.12),transparent_35%)]" />
          <div className="relative z-10 mx-auto flex w-full max-w-[900px] items-center justify-center pt-28">
            <div className="rounded-xl border border-white/12 bg-[#141216]/92 px-7 py-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Checking session...</p>
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (!sessionUser) {
    return (
      <main className="relative overflow-hidden bg-[#030303] text-white">
        <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.12),transparent_35%)]" />
          <div className="relative z-10 mx-auto w-full max-w-[900px] pt-24">
            <div className="rounded-xl border border-rose-300/25 bg-[#151214]/95 p-7">
              <h1 className="font-[family-name:var(--font-heading)] text-4xl font-normal italic leading-none text-white">
                Sign In Required
              </h1>
              <p className="mt-3 max-w-[680px] text-sm leading-7 text-white/72">
                This page requires an authenticated account. Sign in to continue.
              </p>
              <p className="mt-3 text-xs uppercase tracking-[0.09em] text-white/55">Requested path: {pathname}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/"
                  className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white transition hover:border-ember-300 hover:text-ember-200"
                  aria-label="Return to home"
                >
                  Go Home
                </Link>
                <Link
                  href="/sign-up"
                  className="inline-flex h-10 items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-black transition hover:brightness-110"
                  aria-label="Open sign up page"
                >
                  Sign Up or Sign In
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (requiredRole && sessionUser.role !== requiredRole) {
    return (
      <main className="relative overflow-hidden bg-[#030303] text-white">
        <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.12),transparent_35%)]" />
          <div className="relative z-10 mx-auto w-full max-w-[900px] pt-24">
            <div className="rounded-xl border border-rose-300/25 bg-[#151214]/95 p-7">
              <h1 className="font-[family-name:var(--font-heading)] text-4xl font-normal italic leading-none text-white">
                Access Denied
              </h1>
              <p className="mt-3 max-w-[680px] text-sm leading-7 text-white/72">
                You are signed in as <span className="uppercase">{sessionUser.role.toLowerCase()}</span>, but this area requires{' '}
                <span className="uppercase">{requiredRole.toLowerCase()}</span> role permissions.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/"
                  className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white transition hover:border-ember-300 hover:text-ember-200"
                  aria-label="Return to home page"
                >
                  Return Home
                </Link>
                <Link
                  href="/profile"
                  className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white transition hover:border-ember-300 hover:text-ember-200"
                  aria-label="Open profile page"
                >
                  Open Profile
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return <>{children}</>
}

export default RouteAccessGuard
