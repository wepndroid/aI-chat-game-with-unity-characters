'use client'

import Link from 'next/link'

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

type HeroPlatform = {
  id: string
  label: string
  iconType: 'browser' | 'windows' | 'pcvr' | 'meta-quest'
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

const heroPlatforms: HeroPlatform[] = [
  {
    id: 'browser',
    label: 'Browser',
    iconType: 'browser'
  },
  {
    id: 'windows',
    label: 'Windows',
    iconType: 'windows'
  },
  {
    id: 'pcvr',
    label: 'PCVR',
    iconType: 'pcvr'
  },
  {
    id: 'meta-quest',
    label: 'Meta Quest',
    iconType: 'meta-quest'
  }
]

type PlatformIconProps = {
  iconType: HeroPlatform['iconType']
}

const PlatformIcon = ({ iconType }: PlatformIconProps) => {
  if (iconType === 'browser') {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7 text-white/85" aria-hidden="true">
        <circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 12L18.7 8.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 12L7.5 19.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (iconType === 'windows') {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7 text-white/90" aria-hidden="true">
        <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="2.5" fill="#d88b6a" opacity="0.75" />
        <rect x="6.3" y="6.4" width="4.8" height="4.3" fill="currentColor" />
        <rect x="12.8" y="6.4" width="4.8" height="4.3" fill="currentColor" />
        <rect x="6.3" y="12.2" width="4.8" height="4.3" fill="currentColor" />
        <rect x="12.8" y="12.2" width="4.8" height="4.3" fill="currentColor" />
      </svg>
    )
  }

  if (iconType === 'pcvr') {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7 text-white/88" aria-hidden="true">
        <rect x="3.7" y="8.6" width="16.6" height="7.1" rx="3.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7.5 8.6L8.9 6.9H15.1L16.5 8.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="9.3" cy="12.15" r="1.05" fill="currentColor" />
        <circle cx="14.7" cy="12.15" r="1.05" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-white/85" aria-hidden="true">
      <path
        d="M5.2 13.2C5.2 10.9 6.8 9.2 8.8 9.2C10.4 9.2 11.6 10.2 12 11.7C12.4 10.2 13.6 9.2 15.2 9.2C17.2 9.2 18.8 10.9 18.8 13.2C18.8 15.4 17.2 17.1 15.2 17.1C13.6 17.1 12.4 16.1 12 14.7C11.6 16.1 10.4 17.1 8.8 17.1C6.8 17.1 5.2 15.4 5.2 13.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const HomePage = () => {
  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative isolate h-screen min-h-[100vh] border-b border-white/10">
        <div className="absolute inset-0 h-screen bg-[url('/images/BannerBackground.png')] bg-cover bg-center bg-no-repeat" />
        <div className="absolute inset-0 h-screen bg-[#070605]/52" />
        <div className="absolute inset-0 h-screen bg-[radial-gradient(circle_at_50%_15%,rgba(244,99,19,0.28),transparent_34%),radial-gradient(circle_at_0%_5%,rgba(114,39,16,0.4),transparent_32%),radial-gradient(circle_at_100%_0%,rgba(212,75,9,0.28),transparent_30%)]" />
        <div className="absolute inset-0 h-screen bg-[linear-gradient(to_bottom,rgba(3,3,3,0.2),rgba(3,3,3,0.78))]" />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl items-start justify-center px-5 pb-14 pt-24 md:px-8 md:pt-28">
          <div className="max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-ember-200/95">Ai Character Project</p>

            <h1 className="mt-6 font-[family-name:var(--font-heading)] text-5xl font-extrabold italic leading-[0.9] text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)] md:text-8xl">
              <span className="block">Chat With Your Perfect</span>
              <span className="mt-1 block text-ember-400">Anime</span>
            </h1>

            <div className="mx-auto mt-4 grid max-w-[370px] grid-cols-2 gap-1 sm:grid-cols-4 sm:gap-1">
              {heroPlatforms.map((platformItem) => (
                <div key={platformItem.id} className="flex flex-col items-center">
                  <div className="relative flex h-[50px] w-[56px] items-center justify-center overflow-hidden rounded-[13px] border-[2px] border-white/80 bg-black/12">
                    <div className="absolute inset-0 bg-white/40" aria-hidden="true" />
                    <div className="relative z-10">
                      <PlatformIcon iconType={platformItem.iconType} />
                    </div>
                  </div>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.07em] text-white/95">{platformItem.label}</p>
                </div>
              ))}
            </div>

            <div className="mx-auto mt-5 flex max-w-[470px] flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/play-demo"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-white/60 bg-white px-5 text-sm font-bold uppercase tracking-[0.07em] text-[#1f1f1f] transition hover:bg-white/90 sm:w-1/2"
                aria-label="Play demo in browser"
              >
                Play In Browser
                <span className="inline-flex size-5 items-center justify-center rounded-full border border-[#1f1f1f]/30 text-[11px] leading-none">
                  o
                </span>
              </Link>

              <Link
                href="/download"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-5 text-sm font-bold uppercase tracking-[0.07em] text-white transition hover:brightness-110 sm:w-1/2"
                aria-label="Download executable"
              >
                Download EXE
                <span className="inline-flex size-5 items-center justify-center rounded-full border border-white/45 text-[11px] leading-none">
                  o
                </span>
              </Link>
            </div>
          </div>
        </div>
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
                <span className="hidden text-lg leading-none text-ember-300 group-open:inline">-</span>
              </summary>
              <p className="pt-4 text-sm leading-relaxed text-white/75">{faqItem.answer}</p>
            </details>
          ))}
        </div>
      </section>

    </main>
  )
}

export default HomePage
