'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type CharacterCard = {
  id: string
  name: string
  likes: string
  gradientClassName: string
}

type FaqItem = {
  id: string
  question: string
  answer: string
}

const topRatedCharacters: CharacterCard[] = [
  {
    id: 'airi-1',
    name: 'Airi Akizuki',
    likes: '2.4k',
    gradientClassName: 'from-[#5b0f0f] to-[#1e0707]'
  },
  {
    id: 'airi-2',
    name: 'Airi Akizuki',
    likes: '2.4k',
    gradientClassName: 'from-[#8f7040] to-[#2c1f09]'
  },
  {
    id: 'airi-3',
    name: 'Airi Akizuki',
    likes: '2.4k',
    gradientClassName: 'from-[#1d1b32] to-[#0a0911]'
  },
  {
    id: 'airi-4',
    name: 'Airi Akizuki',
    likes: '2.4k',
    gradientClassName: 'from-[#5a1212] to-[#210606]'
  }
]

const frequentlyAskedQuestions: FaqItem[] = [
  {
    id: 'faq-vr',
    question: 'Which VR devices are supported?',
    answer:
      'Our interaction engine works on PCVR headsets first. Mobile VR compatibility is tested separately and receives updates as optimized builds are released.'
  },
  {
    id: 'faq-access',
    question: 'How does Patreon access work?',
    answer:
      'After signing in, connect your Patreon account in profile settings. Your tier is verified on the server and gated characters unlock immediately when the membership is active.'
  }
]

const LoginHomePage = () => {
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false)

  const handleOpenSignInModal = () => {
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

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030303] text-white">
      <section className="relative isolate h-screen min-h-[100vh] border-b border-white/10">
        <div className="absolute inset-0 h-screen bg-[#070605]" />
        <div className="absolute inset-0 h-screen bg-[radial-gradient(circle_at_50%_15%,rgba(244,99,19,0.28),transparent_34%),radial-gradient(circle_at_0%_5%,rgba(114,39,16,0.4),transparent_32%),radial-gradient(circle_at_100%_0%,rgba(212,75,9,0.28),transparent_30%)]" />
        <div className="absolute inset-0 h-screen bg-[linear-gradient(to_bottom,rgba(3,3,3,0.35),rgba(3,3,3,0.95))]" />

        <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 md:px-8">
          <Link
            href="/"
            className="font-[family-name:var(--font-heading)] text-xl font-bold tracking-wide text-ember-100"
            aria-label="SecretWaifu home"
          >
            SecretWaifu
          </Link>

          <nav className="hidden items-center gap-7 text-xs font-semibold uppercase tracking-[0.14em] text-white/80 md:flex">
            <Link href="/" className="transition hover:text-ember-300" aria-label="Go to home">
              Home
            </Link>
            <Link href="/characters" className="transition hover:text-ember-300" aria-label="Go to characters">
              Characters
            </Link>
            <Link href="/community" className="transition hover:text-ember-300" aria-label="Go to community">
              Community
            </Link>
          </nav>

          <button
            type="button"
            className="rounded-md border border-ember-400/60 bg-ember-500/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-ember-100 transition hover:bg-ember-500/50"
            aria-label="Open sign in modal"
            onClick={handleOpenSignInModal}
          >
            Sign In
          </button>
        </header>

        <div className="relative z-10 mx-auto flex h-[calc(100vh-88px)] w-full max-w-6xl items-center justify-center px-5 pb-14 md:px-8">
          <div className="max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-200/95">Ai Character Project</p>
            <h1 className="mt-4 font-[family-name:var(--font-heading)] text-6xl font-extrabold uppercase leading-none text-white md:text-7xl">
              Chat Connect Collect
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm text-white/80 md:text-base">
              Explore top VRoid personalities, support creators, and jump into the web demo with instant gated access through Patreon.
            </p>
          </div>
        </div>

        {isSignInModalOpen ? (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 px-5"
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

              <form className="space-y-4" aria-label="Sign in form">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Username</span>
                  <input
                    type="text"
                    name="username"
                    className="w-full rounded-md border border-ember-200/35 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-ember-300 focus:ring-2 focus:ring-ember-400/45"
                    aria-label="Username"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Email Address</span>
                  <input
                    type="email"
                    name="email"
                    className="w-full rounded-md border border-ember-200/35 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-ember-300 focus:ring-2 focus:ring-ember-400/45"
                    aria-label="Email address"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Password</span>
                  <input
                    type="password"
                    name="password"
                    className="w-full rounded-md border border-ember-200/35 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-ember-300 focus:ring-2 focus:ring-ember-400/45"
                    aria-label="Password"
                  />
                </label>

                <div className="pt-1 text-right">
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs font-semibold uppercase tracking-[0.08em] text-ember-300 transition hover:text-ember-200"
                    aria-label="Go to forgot password"
                  >
                    Forgot Password?
                  </Link>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:brightness-110"
                  aria-label="Sign in to account"
                >
                  Sign In
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-5 py-16 md:px-8">
        <h2 className="text-center font-[family-name:var(--font-heading)] text-4xl font-bold italic text-white/90">
          Top Rated Characters
        </h2>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {topRatedCharacters.map((character) => (
            <article
              key={character.id}
              className="overflow-hidden rounded-2xl border border-ember-400/20 bg-[#0b0b0b] shadow-[0_20px_45px_rgba(0,0,0,0.45)]"
            >
              <div className={`relative h-64 bg-gradient-to-b ${character.gradientClassName}`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.2),transparent_42%)]" />
                <div className="absolute right-3 top-3 rounded-full bg-black/40 px-2 py-1 text-[11px] font-bold text-ember-100">
                  {character.likes}
                </div>
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold italic text-white/95">{character.name}</p>
                  <Link
                    href={`/characters/${character.id}`}
                    className="mt-2 inline-flex rounded-md border border-ember-200/30 bg-black/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-white transition hover:border-ember-300/70 hover:text-ember-200"
                    aria-label={`Open ${character.name} profile`}
                  >
                    View Profile
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <button
            type="button"
            className="rounded-md border border-ember-500/60 bg-transparent px-6 py-2 text-xs font-bold uppercase tracking-[0.15em] text-ember-200 transition hover:bg-ember-500/15"
            aria-label="Browse all characters"
          >
            Browse All Characters
          </button>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-5xl px-5 pb-20 md:px-8">
        <h2 className="text-center font-[family-name:var(--font-heading)] text-4xl font-bold italic text-white/90">Frequently Asked Questions</h2>

        <div className="mt-8 space-y-4">
          {frequentlyAskedQuestions.map((faqItem) => (
            <details
              key={faqItem.id}
              className="group rounded-xl border border-ember-300/25 bg-[#0f0d0b]/90 px-5 py-4 open:border-ember-300/60"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ember-200/95">
                <span>{faqItem.question}</span>
                <span className="text-lg leading-none text-ember-300 group-open:hidden">+</span>
                <span className="hidden text-lg leading-none text-ember-300 group-open:inline">−</span>
              </summary>
              <p className="pt-4 text-sm leading-relaxed text-white/75">{faqItem.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[radial-gradient(circle_at_20%_140%,rgba(244,99,19,0.58),transparent_36%),linear-gradient(to_top,#0a0604,#080808)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-10 md:flex-row md:items-end md:justify-between md:px-8">
          <div className="max-w-md">
            <p className="font-[family-name:var(--font-heading)] text-2xl font-bold text-ember-100">SecretWaifu</p>
            <p className="mt-3 text-sm text-white/70">
              Explore immersive character interactions and discover new VRoid personalities in a creator-first platform.
            </p>
            <p className="mt-4 text-xs text-white/50">© 2026 SecretWaifu. All rights reserved</p>
          </div>

          <nav className="grid grid-cols-2 gap-3 text-xs font-semibold uppercase tracking-[0.11em] text-white/70">
            <Link href="/" className="transition hover:text-ember-200" aria-label="Home link in footer">
              Home
            </Link>
            <Link href="/characters" className="transition hover:text-ember-200" aria-label="Characters link in footer">
              Characters
            </Link>
            <Link href="/support" className="transition hover:text-ember-200" aria-label="Support link in footer">
              Support
            </Link>
            <Link href="/members" className="transition hover:text-ember-200" aria-label="Members link in footer">
              Members
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  )
}

export default LoginHomePage
