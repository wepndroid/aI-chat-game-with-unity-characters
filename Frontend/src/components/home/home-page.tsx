'use client'

import CharacterGalleryCard from '@/components/ui-elements/character-gallery-card'
import CtaLinkButton from '@/components/ui-elements/cta-link-button'
import FaqItem from '@/components/ui-elements/faq-item'
import { useAuth } from '@/components/providers/auth-provider'
import PlatformItem from '@/components/ui-elements/platform-item'
import type { PlatformIconType } from '@/components/ui-elements/platform-item'
import SectionHeading from '@/components/ui-elements/section-heading'
import { listCharacters, type CharacterListRecord } from '@/lib/character-api'
import Link from 'next/link'
import { useEffect, useState } from 'react'

type CharacterCardData = {
  id: string
  slug: string
  name: string
  likes: string
  chats: string
  gradientClassName: string
  description?: string
  previewImageUrl?: string | null
  isPatreonGated: boolean
  minimumTierCents: number | null
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
  href: string
  ariaLabel: string
}

const topRatedGradientClasses = ['from-[#5b0f0f] to-[#1e0707]', 'from-[#8f7040] to-[#2c1f09]', 'from-[#1d1b32] to-[#0a0911]', 'from-[#5a1212] to-[#210606]']

const formatHeartsCount = (count: number) => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`
  }

  return String(count)
}

const toTopRatedCharacterCardData = (characterList: CharacterListRecord[]): CharacterCardData[] => {
  return characterList
    .filter((character) => character.status === 'APPROVED' && character.visibility === 'PUBLIC')
    .slice(0, 4)
    .map((character, index) => ({
      id: character.id,
      slug: character.slug,
      name: character.name,
      likes: formatHeartsCount(character.heartsCount),
      chats: formatHeartsCount(character.viewsCount),
      gradientClassName: topRatedGradientClasses[index % topRatedGradientClasses.length],
      description: character.tagline ?? undefined,
      previewImageUrl: character.previewImageUrl,
      isPatreonGated: character.isPatreonGated,
      minimumTierCents: character.minimumTierCents
    }))
}

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

const HomePage = () => {
  const { sessionUser } = useAuth()
  const windowsExeHref = process.env.NEXT_PUBLIC_WINDOWS_BUILD_URL?.trim() || '/download'
  const playBrowserHref = sessionUser ? '/play-demo' : '/?openSignIn=1'
  const [topRatedCharacters, setTopRatedCharacters] = useState<CharacterCardData[]>([])
  const [isTopRatedLoading, setIsTopRatedLoading] = useState(true)

  // Hero tiles: Browser = WebGL demo; Windows = download hub; PCVR = FAQ route; EXE = direct Windows build link.
  const heroPlatforms: HeroPlatformData[] = [
    {
      id: 'browser',
      label: 'Browser',
      iconType: 'browser',
      href: playBrowserHref,
      ariaLabel: sessionUser ? 'Play the game in your browser (WebGL demo)' : 'Open sign in modal to play in browser'
    },
    {
      id: 'windows',
      label: 'Windows',
      iconType: 'windows',
      href: '/download',
      ariaLabel: 'Download and purchase options for Windows'
    },
    {
      id: 'pcvr',
      label: 'PCVR',
      iconType: 'pcvr',
      href: '/chat-faq',
      ariaLabel: 'PC VR and headset frequently asked questions'
    },
    {
      id: 'exe',
      label: 'EXE',
      iconType: 'exe',
      href: windowsExeHref,
      ariaLabel: 'Download the Windows executable or build'
    }
  ]

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(async () => {
      setIsTopRatedLoading(true)

      try {
        const payload = await listCharacters({
          galleryScope: 'all',
          sort: 'hearts',
          limit: 20
        })

        if (!isCancelled) {
          setTopRatedCharacters(toTopRatedCharacterCardData(payload.data))
        }
      } catch {
        if (!isCancelled) {
          setTopRatedCharacters([])
        }
      } finally {
        if (!isCancelled) {
          setIsTopRatedLoading(false)
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [])

  return (
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      <section className="relative isolate h-screen min-h-[100vh] border-b border-white/10">
        <div className="absolute inset-0 h-screen bg-[url('/images/BannerBackground.png')] bg-cover bg-center bg-no-repeat" />
        <div className="absolute inset-0 h-screen bg-[#070605]/52" />
        <div className="absolute inset-0 h-screen bg-[radial-gradient(circle_at_50%_15%,rgba(244,99,19,0.28),transparent_34%),radial-gradient(circle_at_0%_5%,rgba(114,39,16,0.4),transparent_32%),radial-gradient(circle_at_100%_0%,rgba(212,75,9,0.28),transparent_30%)]" />
        <div className="absolute inset-0 h-screen bg-[linear-gradient(to_bottom,rgba(3,3,3,0.2),rgba(3,3,3,0.78))]" />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl items-start justify-center px-5 pb-14 pt-24 md:px-8 md:pt-28">
          <div className="max-w-3xl text-center">
            <p className="text-sm font-normal uppercase tracking-[0.22em] text-ember-200/95">Ai Character Project</p>

            <h1 className="mt-6 font-[family-name:var(--font-heading)] text-5xl font-extrabold italic leading-[0.9] text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)] md:text-8xl">
              <span className="block">Chat With Your Perfect</span>
              <span className="mt-1 block text-ember-400">Anime</span>
            </h1>

            <div className="mx-auto mt-4 grid max-w-[370px] grid-cols-2 gap-1 sm:grid-cols-4 sm:gap-1">
              {heroPlatforms.map((platformItem) => (
                <PlatformItem
                  key={platformItem.id}
                  label={platformItem.label}
                  iconType={platformItem.iconType}
                  href={platformItem.href}
                  ariaLabel={platformItem.ariaLabel}
                />
              ))}
            </div>

            <div className="mx-auto mt-5 flex max-w-[470px] flex-col gap-3 sm:flex-row sm:justify-center">
              <CtaLinkButton
                href={playBrowserHref}
                label="Play In Browser"
                variant="light"
                ariaLabel={sessionUser ? 'Play demo in browser' : 'Open sign in modal to play demo in browser'}
                iconType="chrome"
              />
              <CtaLinkButton href={windowsExeHref} label="Download EXE" variant="accent" ariaLabel="Download executable" />
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-5 py-6 md:px-8 md:py-10">
        <SectionHeading text="Top Rated Characters" />

        {isTopRatedLoading ? (
          <p className="mt-8 text-center text-sm text-white/70">Loading top rated characters...</p>
        ) : topRatedCharacters.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {topRatedCharacters.map((character) => (
              <CharacterGalleryCard
                key={character.id}
                routeId={character.slug}
                name={character.name}
                likes={character.likes}
                chats={character.chats}
                gradientClassName={character.gradientClassName}
                description={character.description}
                previewImageUrl={character.previewImageUrl}
                isPatreonGated={character.isPatreonGated}
                hasGatedAccess={!character.isPatreonGated}
                requiredTierCents={character.minimumTierCents}
              />
            ))}
          </div>
        ) : (
          <p className="mt-8 text-center text-sm text-white/70">No top rated characters are available yet.</p>
        )}

        <div className="mt-8 flex justify-center">
          <Link
            href="/characters"
            className="rounded-md border border-ember-500/60 bg-transparent px-6 py-2 text-xs font-normal uppercase tracking-[0.15em] text-ember-200 transition hover:bg-ember-500/15"
            aria-label="Browse all characters"
          >
            Browse All Characters
          </Link>
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
