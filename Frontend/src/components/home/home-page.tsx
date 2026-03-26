'use client'

import CharacterCard from '@/components/ui-elements/character-card'
import CtaLinkButton from '@/components/ui-elements/cta-link-button'
import FaqItem from '@/components/ui-elements/faq-item'
import PlatformItem from '@/components/ui-elements/platform-item'
import type { PlatformIconType } from '@/components/ui-elements/platform-item'
import SectionHeading from '@/components/ui-elements/section-heading'
import Link from 'next/link'

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
  href: string
  ariaLabel: string
}

type MarketingFeatureItem = {
  id: string
  title: string
  description: string
}

type MarketingPurchasePathItem = {
  id: string
  title: string
  description: string
  ctaLabel: string
  href: string
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

const featureList: MarketingFeatureItem[] = [
  {
    id: 'feature-webgl',
    title: 'Play Instantly In Browser',
    description: 'Launch the WebGL demo with no install and continue on desktop builds when you are ready.'
  },
  {
    id: 'feature-gallery',
    title: 'Community Character Gallery',
    description: 'Browse curated and community VRoid characters with hearts and written reviews.'
  },
  {
    id: 'feature-dashboard',
    title: 'Creator Upload Dashboard',
    description: 'Upload VRM files, edit metadata, and track moderation status from one creator workspace.'
  },
  {
    id: 'feature-membership',
    title: 'Patreon Tier Unlocks',
    description: 'Link Patreon to unlock gated characters and premium content using server-verified entitlements.'
  },
  {
    id: 'feature-admin',
    title: 'Admin Moderation Tools',
    description: 'Review submissions, manage users, and monitor platform trends from the admin control panel.'
  },
  {
    id: 'feature-api',
    title: 'Game-Ready API Structure',
    description: 'Website and game integration share a clean API and schema foundation for long-term growth.'
  }
]

const HomePage = () => {
  const trailerEmbedUrl = process.env.NEXT_PUBLIC_TRAILER_EMBED_URL
  const trailerVideoUrl = process.env.NEXT_PUBLIC_TRAILER_VIDEO_URL
  // Set NEXT_PUBLIC_ITCH_IO_URL in .env.local to your full itch.io game page (https://…)
  const itchIoUrl = process.env.NEXT_PUBLIC_ITCH_IO_URL?.trim() || 'https://itch.io'
  const patreonUrl = process.env.NEXT_PUBLIC_PATREON_URL ?? '/members'
  // Direct / third-party checkout (Gumroad, Stripe link, etc.). If unset, send users to the on-site purchase hub (not itch — that has its own button).
  const directPurchaseUrl = process.env.NEXT_PUBLIC_DIRECT_PURCHASE_URL?.trim() || '/download'
  const windowsExeHref = process.env.NEXT_PUBLIC_WINDOWS_BUILD_URL?.trim() || '/download#windows-build'

  // Hero tiles: Browser = WebGL demo; Windows = download hub (Windows section); PCVR = VR / headset FAQ; EXE = Windows build URL or same anchor as Download EXE.
  const heroPlatforms: HeroPlatformData[] = [
    {
      id: 'browser',
      label: 'Browser',
      iconType: 'browser',
      href: '/play-demo',
      ariaLabel: 'Play the game in your browser (WebGL demo)'
    },
    {
      id: 'windows',
      label: 'Windows',
      iconType: 'windows',
      href: '/download#windows-build',
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

  const purchasePathList: MarketingPurchasePathItem[] = [
    {
      id: 'purchase-itch',
      title: 'Buy On itch.io',
      description: 'Best path for game checkout and full build access.',
      ctaLabel: 'Open itch.io',
      href: itchIoUrl
    },
    {
      id: 'purchase-patreon',
      title: 'Unlock With Patreon',
      description: 'Link your tier to unlock premium and gated character content.',
      ctaLabel: 'Open Patreon',
      href: patreonUrl
    },
    {
      id: 'purchase-direct',
      title: 'Direct Purchase Path',
      description: 'Reserved for website-native payments and account-bound entitlement unlocks.',
      ctaLabel: 'Open Purchase Options',
      href: directPurchaseUrl
    }
  ]

  const isExternalHref = (href: string) => href.startsWith('http://') || href.startsWith('https://')

  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
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
              <CtaLinkButton href="/play-demo" label="Play In Browser" variant="light" ariaLabel="Play demo in browser" />
              <CtaLinkButton href={windowsExeHref} label="Download EXE" variant="accent" ariaLabel="Download executable" />
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-5 py-16 md:px-8">
        <SectionHeading text="Official Trailer" />

        <div className="mt-8 overflow-hidden rounded-2xl border border-white/15 bg-[#0b0b0b] shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          <div className="aspect-video w-full">
            {trailerEmbedUrl ? (
              <iframe
                src={trailerEmbedUrl}
                title="AI Chat Game Trailer"
                className="h-full w-full"
                loading="lazy"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
              />
            ) : trailerVideoUrl ? (
              <video src={trailerVideoUrl} controls className="h-full w-full bg-black" preload="metadata" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
                <p className="font-[family-name:var(--font-heading)] text-4xl font-normal text-white">Trailer Ready</p>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                  Set `NEXT_PUBLIC_TRAILER_EMBED_URL` or `NEXT_PUBLIC_TRAILER_VIDEO_URL` to show the official trailer here.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-center">
          <Link
            href="/play-demo"
            className="inline-flex h-10 items-center justify-center rounded-md border border-ember-300/50 px-5 text-xs font-normal uppercase tracking-[0.1em] text-ember-200 transition hover:border-ember-300 hover:text-white"
            aria-label="Open browser demo page"
          >
            Open Demo Page
          </Link>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-5 py-6 md:px-8 md:py-10">
        <SectionHeading text="Feature List" />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featureList.map((featureItem) => (
            <article key={featureItem.id} className="rounded-xl border border-white/10 bg-[#121212]/90 p-5">
              <h3 className="font-[family-name:var(--font-heading)] text-[30px] font-normal leading-none text-ember-200">
                {featureItem.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-white/70">{featureItem.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-5 py-6 md:px-8 md:py-10">
        <SectionHeading text="Purchase Paths" />

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {purchasePathList.map((purchasePathItem) => (
            <article key={purchasePathItem.id} className="rounded-xl border border-white/10 bg-[#121212]/95 p-5">
              <h3 className="font-[family-name:var(--font-heading)] text-[30px] font-normal leading-none text-white">
                {purchasePathItem.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-white/70">{purchasePathItem.description}</p>

              {isExternalHref(purchasePathItem.href) ? (
                <a
                  href={purchasePathItem.href}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex h-10 min-w-[180px] items-center justify-center rounded-md border border-ember-300/45 px-4 text-[11px] font-normal uppercase tracking-[0.1em] text-ember-200 transition hover:border-ember-300 hover:text-white"
                >
                  {purchasePathItem.ctaLabel}
                </a>
              ) : (
                <Link
                  href={purchasePathItem.href}
                  className="mt-5 inline-flex h-10 min-w-[180px] items-center justify-center rounded-md border border-ember-300/45 px-4 text-[11px] font-normal uppercase tracking-[0.1em] text-ember-200 transition hover:border-ember-300 hover:text-white"
                >
                  {purchasePathItem.ctaLabel}
                </Link>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-5 py-6 md:px-8 md:py-10">
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
