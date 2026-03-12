'use client'

import CharacterCard from '@/components/ui-elements/character-card'
import CtaLinkButton from '@/components/ui-elements/cta-link-button'
import FaqItem from '@/components/ui-elements/faq-item'
import PlatformItem from '@/components/ui-elements/platform-item'
import type { PlatformIconType } from '@/components/ui-elements/platform-item'
import SectionHeading from '@/components/ui-elements/section-heading'

type CharacterCardData = {
  id: string
  name: string
  likes: string
  gradientClassName: string
}

type FaqItemData = {
  id: string
  question: string
  answer: string
}

type HeroPlatformData = {
  id: string
  label: string
  iconType: PlatformIconType
}

const topRatedCharacters: CharacterCardData[] = [
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

const frequentlyAskedQuestions: FaqItemData[] = [
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

const heroPlatforms: HeroPlatformData[] = [
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
                <PlatformItem key={platformItem.id} label={platformItem.label} iconType={platformItem.iconType} />
              ))}
            </div>

            <div className="mx-auto mt-5 flex max-w-[470px] flex-col gap-3 sm:flex-row sm:justify-center">
              <CtaLinkButton href="/play-demo" label="Play In Browser" variant="light" ariaLabel="Play demo in browser" />
              <CtaLinkButton href="/download" label="Download EXE" variant="accent" ariaLabel="Download executable" />
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-5 py-16 md:px-8">
        <SectionHeading text="Top Rated Characters" />

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {topRatedCharacters.map((character) => (
            <CharacterCard
              key={character.id}
              id={character.id}
              name={character.name}
              likes={character.likes}
              gradientClassName={character.gradientClassName}
            />
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
        <SectionHeading text="Frequently Asked Questions" />

        <div className="mt-8 space-y-4">
          {frequentlyAskedQuestions.map((faqItem) => (
            <FaqItem key={faqItem.id} question={faqItem.question} answer={faqItem.answer} />
          ))}
        </div>
      </section>
    </main>
  )
}

export default HomePage
