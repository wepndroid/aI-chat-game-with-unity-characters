'use client'

import CharacterGalleryCard from '@/components/ui-elements/character-gallery-card'
import CtaLinkButton from '@/components/ui-elements/cta-link-button'
import FaqItem from '@/components/ui-elements/faq-item'
import { useAuth } from '@/components/providers/auth-provider'
import { useWebglWarm } from '@/components/providers/webgl-warm-provider'
import PlatformItem from '@/components/ui-elements/platform-item'
import type { PlatformIconType } from '@/components/ui-elements/platform-item'
import SectionHeading from '@/components/ui-elements/section-heading'
import { listCharacters, type CharacterListRecord } from '@/lib/character-api'
import { buildAiGirlfriendRouteKey } from '@/lib/ai-girlfriend-route'
import { trackLandingVisit } from '@/lib/landing-page-api'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, type MouseEvent } from 'react'

type HomePageProps = {
  initialTopRatedCharacters?: CharacterCardData[]
}

type CharacterCardData = {
  id: string
  slug: string
  name: string
  likes: string
  chats: string
  gradientClassName: string
  tagline?: string
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
    .filter((character) => character.status === 'APPROVED')
    .slice(0, 16)
    .map((character, index) => ({
      id: character.id,
      slug: character.slug,
      name: character.name,
      likes: formatHeartsCount(character.heartsCount),
      chats: formatHeartsCount(character.viewsCount),
      gradientClassName: topRatedGradientClasses[index % topRatedGradientClasses.length],
      tagline: character.tagline ?? undefined,
      description: character.description ?? undefined,
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

const HomePage = ({ initialTopRatedCharacters = [] }: HomePageProps) => {
  const { sessionUser } = useAuth()
  const warm = useWebglWarm()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const windowsExeHref = process.env.NEXT_PUBLIC_WINDOWS_BUILD_URL?.trim() || '/download'
  const playBrowserHref = sessionUser ? '/play-demo' : '/?openSignIn=1'
  const campaignSource = searchParams.get('utm_source') ?? searchParams.get('source')
  const campaignMedium = searchParams.get('utm_medium')
  const campaignName = searchParams.get('utm_campaign')
  const campaignContent = searchParams.get('utm_content')
  const campaignTerm = searchParams.get('utm_term')

  const handleHeroBrowserPlayClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!sessionUser || playBrowserHref !== '/play-demo') {
      return
    }

    if (
      warm.tryOpenWarmPlay({
        characterId: null,
        characterSlug: null,
        storyId: null
      })
    ) {
      event.preventDefault()
    }
  }
  const [topRatedCharacters, setTopRatedCharacters] = useState<CharacterCardData[]>(initialTopRatedCharacters)
  const [isTopRatedLoading, setIsTopRatedLoading] = useState(initialTopRatedCharacters.length === 0)
  const didSkipInitialTopRatedFetchRef = useRef(initialTopRatedCharacters.length > 0)

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
    void trackLandingVisit({
      landingPageKey: 'home',
      landingPageName: 'Homepage',
      variantKey: 'default',
      variantName: 'Default Homepage',
      routePath: pathname,
      source: campaignSource,
      medium: campaignMedium,
      campaign: campaignName,
      content: campaignContent,
      term: campaignTerm,
      landingUrl: typeof window === 'undefined' ? null : window.location.href,
      referrer: typeof document === 'undefined' ? null : document.referrer || null
    }).catch(() => {
      // Attribution should not block the homepage.
    })
  }, [campaignContent, campaignMedium, campaignName, campaignSource, campaignTerm, pathname, searchParams])

  useEffect(() => {
    if (didSkipInitialTopRatedFetchRef.current) {
      didSkipInitialTopRatedFetchRef.current = false
      setIsTopRatedLoading(false)
      return
    }

    let isCancelled = false

    Promise.resolve().then(async () => {
      setIsTopRatedLoading(true)
      try {
        const payload = await listCharacters({
          galleryScope: 'all',
          sort: 'hearts',
          limit: 32
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
      <section className="relative isolate min-h-[520px] pb-8 pt-3 sm:h-[70vh] sm:min-h-[460px] sm:max-h-[780px] sm:pb-0 sm:pt-0">
        <div className="absolute inset-0 bg-[url('/images/BannerBackground.png')] bg-cover bg-center bg-no-repeat" />
        <div className="absolute inset-0 bg-[#070605]/52" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(244,99,19,0.28),transparent_34%),radial-gradient(circle_at_0%_5%,rgba(114,39,16,0.4),transparent_32%),radial-gradient(circle_at_100%_0%,rgba(212,75,9,0.28),transparent_30%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,3,3,0.06)_0%,rgba(3,3,3,0.18)_48%,rgba(24,10,6,0.68)_78%,rgba(3,3,3,1)_100%)]" />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl items-start justify-center px-4 pb-10 pt-24 md:px-6 md:pt-24">
          <div className="max-w-3xl text-center">
            <p className="text-[14px] font-medium uppercase tracking-[0.22em] text-ember-200/95 sm:text-sm sm:font-normal">
              Ai Character Project
            </p>

            <h1 className="mt-5 font-[family-name:var(--font-heading)] text-[44px] font-black leading-[0.9] tracking-[-0.05em] text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)] sm:mt-6 sm:text-4xl md:text-4xl lg:text-5xl xl:text-6xl">
              <span className="block">Chat With Your Perfect</span>
              <span className="mt-1 block text-ember-400">Anime Girlfriend</span>
            </h1>

            <div className="mx-auto mt-5 grid max-w-[360px] grid-cols-2 gap-2 sm:mt-3 sm:max-w-[340px] sm:gap-0.5 sm:grid-cols-4 sm:gap-1">
              {heroPlatforms.map((platformItem) => (
                <PlatformItem
                  key={platformItem.id}
                  label={platformItem.label}
                  iconType={platformItem.iconType}
                  href={platformItem.href}
                  ariaLabel={platformItem.ariaLabel}
                  onLinkClick={platformItem.id === 'browser' ? handleHeroBrowserPlayClick : undefined}
                />
              ))}
            </div>

            <div className="mx-auto mt-6 flex max-w-[470px] flex-col gap-3 sm:mt-4 sm:flex-row sm:justify-center">
              <CtaLinkButton
                href={playBrowserHref}
                label="Play In Browser"
                variant="light"
                ariaLabel={sessionUser ? 'Play demo in browser' : 'Open sign in modal to play demo in browser'}
                iconType="chrome"
                onClick={sessionUser ? handleHeroBrowserPlayClick : undefined}
              />
              <CtaLinkButton href={windowsExeHref} label="Download EXE" variant="accent" ariaLabel="Download executable" />
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-5 md:px-8 md:py-10">
        <SectionHeading text="Top Rated AI Girlfriends" />

        {isTopRatedLoading ? (
          <p className="mt-8 text-center text-sm text-white/70">Loading top rated AI girlfriends...</p>
        ) : topRatedCharacters.length > 0 ? (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-3 lg:grid-cols-4">
            {topRatedCharacters.map((character) => (
              <CharacterGalleryCard
                key={character.id}
                routeId={buildAiGirlfriendRouteKey(character.name, character.id)}
                name={character.name}
                likes={character.likes}
                chats={character.chats}
                gradientClassName={character.gradientClassName}
                className="w-full overflow-hidden rounded-[26px] border border-[#8a4f2b]/80 bg-[#111111] shadow-[0_18px_34px_rgba(0,0,0,0.4)]"
                tagline={character.tagline}
                description={character.description}
                previewImageUrl={character.previewImageUrl}
                isPatreonGated={character.isPatreonGated}
                hasGatedAccess={!character.isPatreonGated}
                requiredTierCents={character.minimumTierCents}
              />
            ))}
          </div>
        ) : (
          <p className="mt-8 text-center text-[15px] text-white/70 sm:text-sm">No top rated AI girlfriends are available yet.</p>
        )}

        <div className="mt-8 flex justify-center">
          <Link
            href="/ai-girlfriends"
            className="min-h-[48px] rounded-xl border border-ember-500/60 bg-transparent px-6 py-3 text-[14px] font-semibold uppercase tracking-[0.15em] text-ember-200 transition hover:bg-ember-500/15 sm:min-h-0 sm:rounded-md sm:py-2 sm:text-xs sm:font-normal"
            aria-label="Browse all AI girlfriends"
          >
            Browse All AI Girlfriends
          </Link>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-5xl px-4 pb-20 sm:px-5 md:px-8">
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
