'use client'

import CharacterGalleryCard from '@/components/ui-elements/character-gallery-card'
import CtaLinkButton from '@/components/ui-elements/cta-link-button'
import FaqItem from '@/components/ui-elements/faq-item'
import { useAuth } from '@/components/providers/auth-provider'
import { useWebglPreloadIntent } from '@/components/providers/webgl-preload-provider'
import PlatformItem from '@/components/ui-elements/platform-item'
import type { PlatformIconType } from '@/components/ui-elements/platform-item'
import SectionHeading from '@/components/ui-elements/section-heading'
import { listCharacters, type CharacterListRecord, type ThumbnailSource } from '@/lib/character-api'
import { buildAiGirlfriendRouteKey } from '@/lib/ai-girlfriend-route'
import { formatCompactCount } from '@/lib/format-compact-count'
import { buildTrackedRoutePath, isLandingSignupHandoff, readCampaignAttribution } from '@/lib/landing-attribution'
import { trackLandingVisit } from '@/lib/landing-page-api'
import { AUTH_OPEN_SIGN_UP_MODAL_EVENT } from '@/lib/auth-events'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { type MouseEvent, useEffect, useRef, useState } from 'react'

type HomePageProps = {
  initialPopularCharacters?: CharacterCardData[]
  defaultLandingPageKey?: string
  defaultLandingPageName?: string
  defaultVariantKey?: string
  defaultVariantName?: string
  heroVariant?: 'default' | 'ahri'
  popularSectionTitle?: string
  browseCharactersHref?: string
  popularThumbnailSource?: ThumbnailSource
}

type CharacterCardData = {
  id: string
  slug: string
  name: string
  likes: string
  messages: string
  gradientClassName: string
  tagline?: string
  description?: string
  previewImageUrl?: string | null
  cardThumbnailDesktopUrl?: string | null
  cardThumbnailMobileUrl?: string | null
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

const popularGradientClasses = ['from-[#5b0f0f] to-[#1e0707]', 'from-[#8f7040] to-[#2c1f09]', 'from-[#1d1b32] to-[#0a0911]', 'from-[#5a1212] to-[#210606]']

const toPopularCharacterCardData = (characterList: CharacterListRecord[]): CharacterCardData[] => {
  return characterList
    .filter((character) => character.status === 'APPROVED')
    .slice(0, 16)
    .map((character, index) => ({
      id: character.id,
      slug: character.slug,
      name: character.name,
      likes: formatCompactCount(character.heartsCount),
      messages: formatCompactCount(character.messageCount),
      gradientClassName: popularGradientClasses[index % popularGradientClasses.length],
      tagline: character.tagline ?? undefined,
      description: character.description ?? undefined,
      previewImageUrl: character.previewImageUrl,
      cardThumbnailDesktopUrl: character.cardThumbnailDesktopUrl,
      cardThumbnailMobileUrl: character.cardThumbnailMobileUrl
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
      'After signing in, connect your Patreon account in profile settings. Your tier is verified on the server and unlocks member perks while approved characters remain available to registered players.'
  }
]

const HomePage = ({
  initialPopularCharacters = [],
  defaultLandingPageKey = 'home1',
  defaultLandingPageName = 'Homepage Variant 1',
  defaultVariantKey = 'default',
  defaultVariantName = 'Default Route',
  heroVariant = 'default',
  popularSectionTitle = 'Popular AI Girlfriends',
  browseCharactersHref = '/ai-girlfriends',
  popularThumbnailSource = 'card'
}: HomePageProps) => {
  const { sessionUser } = useAuth()
  const { preloadOnIntent } = useWebglPreloadIntent()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsString = searchParams.toString()
  const windowsExeHref = process.env.NEXT_PUBLIC_WINDOWS_BUILD_URL?.trim() || '/download'
  const playBrowserHref = sessionUser ? '/play' : '/?openSignIn=1'
  const signUpPromptSearchParams = new URLSearchParams(searchParamsString)
  signUpPromptSearchParams.delete('openSignIn')
  signUpPromptSearchParams.set('openSignUp', '1')
  const signUpPromptHref = `${pathname}?${signUpPromptSearchParams.toString()}`
  const {
    source: campaignSource,
    medium: campaignMedium,
    campaign: campaignName,
    content: campaignContent,
    term: campaignTerm,
    shortUrlKey
  } = readCampaignAttribution(searchParams)
  const trackedLandingPageKey = searchParams.get('sw_landing_page') ?? defaultLandingPageKey
  const trackedLandingPageName = searchParams.get('sw_landing_page_name') ?? defaultLandingPageName
  const shouldSkipLandingVisit = isLandingSignupHandoff(searchParams)
  const [popularCharacters, setPopularCharacters] = useState<CharacterCardData[]>(initialPopularCharacters)
  const [isPopularLoading, setIsPopularLoading] = useState(initialPopularCharacters.length === 0)
  const didSkipInitialPopularFetchRef = useRef(initialPopularCharacters.length > 0)

  // Hero tiles: Browser = WebGL play page; Windows = download hub; PCVR = FAQ route; EXE = direct Windows build link.
  const heroPlatforms: HeroPlatformData[] = [
    {
      id: 'browser',
      label: 'Browser',
      iconType: 'browser',
      href: playBrowserHref,
      ariaLabel: sessionUser ? 'Play the game in your browser' : 'Open sign in modal to play in browser'
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

  const handleSignUpPromptClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }

    event.preventDefault()
    window.history.pushState({}, '', signUpPromptHref)
    window.dispatchEvent(new Event(AUTH_OPEN_SIGN_UP_MODAL_EVENT))
  }

  useEffect(() => {
    if (shouldSkipLandingVisit) {
      return
    }

    void trackLandingVisit({
      landingPageKey: trackedLandingPageKey,
      landingPageName: trackedLandingPageName,
      variantKey: defaultVariantKey,
      variantName: trackedLandingPageKey === defaultLandingPageKey ? defaultVariantName : 'Default Route',
      shortUrlKey,
      routePath: buildTrackedRoutePath(pathname, new URLSearchParams(searchParamsString)),
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
  }, [
    campaignContent,
    campaignMedium,
    campaignName,
    campaignSource,
    campaignTerm,
    pathname,
    searchParams,
    searchParamsString,
    shortUrlKey,
    trackedLandingPageKey,
    trackedLandingPageName,
    defaultLandingPageKey,
    defaultVariantKey,
    defaultVariantName,
    shouldSkipLandingVisit
  ])

  useEffect(() => {
    if (didSkipInitialPopularFetchRef.current) {
      didSkipInitialPopularFetchRef.current = false
      setIsPopularLoading(false)
      return
    }

    let isCancelled = false

    Promise.resolve().then(async () => {
      setIsPopularLoading(true)
      try {
        const payload = await listCharacters({
          galleryScope: 'all',
          sort: 'popular',
          limit: 32,
          thumbnailSource: popularThumbnailSource
        })

        if (!isCancelled) {
          setPopularCharacters(toPopularCharacterCardData(payload.data))
        }
      } catch {
        if (!isCancelled) {
          setPopularCharacters([])
        }
      } finally {
        if (!isCancelled) {
          setIsPopularLoading(false)
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [popularThumbnailSource])

  const defaultHero = (
      <section className="relative isolate min-h-[500px] pb-8 pt-3 sm:h-[70vh] sm:min-h-[460px] sm:max-h-[780px] sm:pb-0 sm:pt-0">
        <div className="absolute inset-0 bg-[url('/images/BannerBackground.png')] bg-cover bg-center bg-no-repeat" />
        <div className="absolute inset-0 bg-[#070605]/52" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(244,99,19,0.28),transparent_34%),radial-gradient(circle_at_0%_5%,rgba(114,39,16,0.4),transparent_32%),radial-gradient(circle_at_100%_0%,rgba(212,75,9,0.28),transparent_30%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,3,3,0.06)_0%,rgba(3,3,3,0.18)_48%,rgba(24,10,6,0.68)_78%,rgba(3,3,3,1)_100%)]" />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl items-start justify-center px-4 pb-10 pt-20 md:px-6 md:pt-24">
          <div className="max-w-3xl text-center">
            <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-ember-200/95 sm:text-sm sm:font-normal">
              Ai Character Project
            </p>

            <h1 className="mt-4 font-[family-name:var(--font-heading)] text-[34px] font-black leading-[0.92] tracking-[-0.045em] text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)] sm:mt-6 sm:text-4xl md:text-4xl lg:text-5xl xl:text-6xl">
              <span className="block">Chat With Your Perfect</span>
              <span className="mt-1 block text-ember-400">Anime Girlfriend</span>
            </h1>

            <div className="mx-auto mt-5 grid max-w-[290px] grid-cols-2 gap-1.5 sm:mt-3 sm:max-w-[340px] sm:grid-cols-4 sm:gap-1">
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

            <div className="mx-auto mt-6 flex max-w-[430px] flex-col gap-2.5 sm:mt-4 sm:flex-row sm:justify-center">
              <CtaLinkButton
                href={playBrowserHref}
                label="Play In Browser"
                variant="light"
                ariaLabel={sessionUser ? 'Play in browser' : 'Open sign in modal to play in browser'}
                iconType="chrome"
                onFocus={preloadOnIntent}
                onPointerEnter={preloadOnIntent}
                onTouchStart={preloadOnIntent}
              />
              <CtaLinkButton href={windowsExeHref} label="Download EXE" variant="accent" ariaLabel="Download executable" />
            </div>
          </div>
        </div>
      </section>
  )

  const ahriHero = (
    <section className="relative isolate min-h-[680px] overflow-hidden bg-[#030405] pb-8 pt-20 sm:min-h-[620px] sm:pb-0 md:h-[72vh] md:max-h-[800px]">
      <div className="absolute inset-0 bg-[url('/images/BannerBackground.png')] bg-cover bg-center bg-no-repeat opacity-35 saturate-[0.8]" />
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(3,4,5,0.98)_0%,rgba(7,20,22,0.9)_38%,rgba(34,11,20,0.76)_67%,rgba(5,3,5,0.98)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(to_bottom,rgba(3,4,5,0)_0%,rgba(3,3,3,1)_88%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-[0.16]" />
      <div className="absolute left-0 top-24 h-px w-full bg-[linear-gradient(90deg,transparent,rgba(83,236,205,0.42),rgba(255,138,90,0.3),transparent)]" />

      <div className="relative z-10 mx-auto grid h-full w-full max-w-6xl items-center gap-4 px-4 pb-12 pt-3 sm:px-5 md:grid-cols-[0.88fr_1.12fr] md:gap-6 md:px-8 md:pb-16">
        <div className="relative z-20 max-w-2xl pt-3 text-center md:text-left">
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#71f0d4] sm:text-sm">
            SecretWaifu / AI Anime Girlfriend
          </p>

          <h1 className="mt-4 font-[family-name:var(--font-heading)] text-[32px] font-black leading-[0.98] text-white drop-shadow-[0_8px_18px_rgba(0,0,0,0.55)] sm:text-[38px] md:text-[58px] md:leading-[0.94] lg:text-[66px]">
            <span className="block">Chat With Your Anime Girl</span>
            <span className="block text-[#ff9f62]">Inside SecretWaifu</span>
          </h1>

          <p className="mx-auto mt-4 max-w-[540px] text-[15px] leading-6 text-white/74 md:mx-0">
            A cinematic AI girlfriend experience with expressive characters, live conversation, browser play, Windows builds, and PCVR support.
          </p>

          <div className="mx-auto mt-6 hidden max-w-[340px] grid-cols-4 gap-1.5 md:mx-0 md:grid">
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

          <div className="mx-auto mt-6 hidden max-w-[430px] flex-col gap-2.5 sm:flex-row md:mx-0 md:flex">
            <CtaLinkButton
              href={playBrowserHref}
              label="Play In Browser"
              variant="light"
              ariaLabel={sessionUser ? 'Play in browser' : 'Open sign in modal to play in browser'}
              iconType="chrome"
              onFocus={preloadOnIntent}
              onPointerEnter={preloadOnIntent}
              onTouchStart={preloadOnIntent}
            />
            <CtaLinkButton href={windowsExeHref} label="Download EXE" variant="accent" ariaLabel="Download executable" />
          </div>
        </div>

        <div className="relative z-10 mx-auto flex min-h-[360px] w-full max-w-[620px] items-end justify-center md:h-full md:min-h-[520px] md:max-w-none">
          <div className="absolute bottom-10 left-1/2 h-[58%] w-[82%] -translate-x-1/2 rounded-[50%] bg-[linear-gradient(90deg,rgba(83,236,205,0.2),rgba(255,159,98,0.25))] blur-3xl" />
          <div className="absolute bottom-5 h-[18%] w-[72%] rounded-[50%] bg-black/45 blur-2xl" />

          <video
            className="relative z-10 h-[400px] w-full max-w-[500px] object-contain object-bottom mix-blend-screen drop-shadow-[0_34px_58px_rgba(0,0,0,0.72)] [clip-path:inset(0_7%_0_0)] [mask-image:linear-gradient(90deg,transparent_0%,black_16%,black_78%,transparent_96%)] sm:h-[440px] md:h-[min(70vh,650px)] md:max-w-[620px]"
            src="/videos/landing-chat/mita-idle.webm"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            aria-label="Mita character preview"
          />

          <div className="absolute left-3 top-6 z-20 w-[142px] rounded-xl border border-[#71f0d4]/30 bg-black/[0.36] px-2.5 py-2 text-left shadow-[0_18px_42px_rgba(0,0,0,0.46)] backdrop-blur-md md:left-auto md:right-0 md:top-20 md:w-[min(78vw,280px)] md:rounded-[18px] md:px-4 md:py-3">
            <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#71f0d4] md:text-[10px] md:tracking-[0.18em]">Mita is online</p>
            <p className="mt-1 hidden text-[11px] leading-4 text-white/78 sm:block md:mt-1.5 md:text-[13px] md:leading-5 md:text-white/82">&ldquo;Tell me what kind of world you want to escape into.&rdquo;</p>
          </div>

          <Link
            href={signUpPromptHref}
            className="absolute bottom-8 left-1/2 z-20 flex w-[min(86vw,390px)] -translate-x-1/2 items-center gap-3 rounded-full border border-white/14 bg-white/[0.07] px-4 py-3 shadow-[0_18px_42px_rgba(0,0,0,0.4)] backdrop-blur-md transition hover:border-[#71f0d4]/45 hover:bg-white/[0.1] md:bottom-12"
            aria-label="Open sign up to send your first message"
            onClick={handleSignUpPromptClick}
          >
            <span className="size-2.5 shrink-0 rounded-full bg-[#71f0d4] shadow-[0_0_18px_rgba(113,240,212,0.9)]" />
            <span className="min-w-0 truncate text-left text-[13px] text-white/76">Type your first message...</span>
          </Link>
        </div>

        <div className="relative z-20 mx-auto w-full max-w-[430px] md:hidden">
          <div className="mx-auto grid max-w-[340px] grid-cols-4 gap-1.5">
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

          <div className="mx-auto mt-5 flex max-w-[430px] flex-col gap-2.5 sm:flex-row">
            <CtaLinkButton
              href={playBrowserHref}
              label="Play In Browser"
              variant="light"
              ariaLabel={sessionUser ? 'Play in browser' : 'Open sign in modal to play in browser'}
              iconType="chrome"
              onFocus={preloadOnIntent}
              onPointerEnter={preloadOnIntent}
              onTouchStart={preloadOnIntent}
            />
            <CtaLinkButton href={windowsExeHref} label="Download EXE" variant="accent" ariaLabel="Download executable" />
          </div>
        </div>
      </div>
    </section>
  )

  return (
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      {heroVariant === 'ahri' ? ahriHero : defaultHero}

      <section className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-5 md:px-8 md:py-10">
        <SectionHeading text={popularSectionTitle} />

        {isPopularLoading ? (
          <p className="mt-8 text-center text-sm text-white/70">Loading popular AI girlfriends...</p>
        ) : popularCharacters.length > 0 ? (
          <div className="mt-8 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {popularCharacters.map((character) => (
              <CharacterGalleryCard
                key={character.id}
                routeId={buildAiGirlfriendRouteKey(character.name, character.id)}
                name={character.name}
                likes={character.likes}
                messages={character.messages}
                gradientClassName={character.gradientClassName}
                className="w-full overflow-hidden rounded-[26px] border border-[#8a4f2b]/80 bg-[#111111] shadow-[0_18px_34px_rgba(0,0,0,0.4)]"
                tagline={character.tagline}
                description={character.description}
                previewImageUrl={character.previewImageUrl}
                cardThumbnailDesktopUrl={character.cardThumbnailDesktopUrl}
                cardThumbnailMobileUrl={character.cardThumbnailMobileUrl}
              />
            ))}
          </div>
        ) : (
          <p className="mt-8 text-center text-[15px] text-white/70 sm:text-sm">No popular AI girlfriends are available yet.</p>
        )}

        <div className="mt-8 flex justify-center">
          <Link
            href={browseCharactersHref}
            className="min-h-[42px] rounded-xl border border-ember-500/60 bg-transparent px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.13em] text-ember-200 transition hover:bg-ember-500/15 sm:min-h-0 sm:rounded-md sm:py-2 sm:text-xs sm:font-normal"
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
