'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import PlatformItem from '@/components/ui-elements/platform-item'
import type { PlatformIconType } from '@/components/ui-elements/platform-item'
import StoryTypewriter from '@/components/landing/story-typewriter'
import { buildLandingSignupHref, readCampaignAttribution } from '@/lib/landing-attribution'
import { trackLandingVisit } from '@/lib/landing-page-api'

const lp1LandingPage = {
  key: 'lp-1',
  name: 'Landing Page 1'
}

const Lp1Page = () => {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const signUpHref = buildLandingSignupHref(searchParams, lp1LandingPage)
  const {
    source: campaignSource,
    medium: campaignMedium,
    campaign: campaignName,
    content: campaignContent,
    term: campaignTerm,
    shortUrlKey
  } = readCampaignAttribution(searchParams)

  React.useEffect(() => {
    void trackLandingVisit({
      landingPageKey: lp1LandingPage.key,
      landingPageName: lp1LandingPage.name,
      variantKey: 'control',
      variantName: 'Control',
      shortUrlKey,
      routePath: pathname,
      source: campaignSource,
      medium: campaignMedium,
      campaign: campaignName,
      content: campaignContent,
      term: campaignTerm,
      landingUrl: typeof window === 'undefined' ? null : window.location.href,
      referrer: typeof document === 'undefined' ? null : document.referrer || null
    }).catch(() => {
      // Analytics must never block the landing page experience.
    })
  }, [campaignContent, campaignMedium, campaignName, campaignSource, campaignTerm, pathname, shortUrlKey])

  const heroPlatforms: { id: string; label: string; iconType: PlatformIconType; href: string; ariaLabel: string }[] = [
    { id: 'browser', label: 'Browser', iconType: 'browser', href: signUpHref, ariaLabel: 'Sign up to start in browser' },
    { id: 'windows', label: 'Windows', iconType: 'windows', href: signUpHref, ariaLabel: 'Sign up for Windows access' },
    { id: 'pcvr', label: 'PCVR', iconType: 'pcvr', href: signUpHref, ariaLabel: 'Sign up for PC VR access' },
    { id: 'exe', label: 'EXE', iconType: 'exe', href: signUpHref, ariaLabel: 'Sign up to download the executable' }
  ]

  return (
    <div className="min-h-screen bg-[#121212] text-white font-sans overflow-x-hidden">

      {/* --- HERO SECTION --- */}
      <header className="relative w-full max-w-7xl mx-auto pt-6 md:pt-10 pb-6 px-6 flex flex-col md:flex-row items-center justify-center">

        {/* Left Character Image */}
        <div className="w-full md:w-1/2 flex justify-center md:justify-end relative z-20 -mr-0 md:-mr-20">
          <div className="relative w-[85%] md:w-[130%] aspect-[3/4]">
            <Image
              src="/images/landing/header-girl.png"
              alt="Character"
              fill
              className="object-contain drop-shadow-[0_0_30px_rgba(255,85,0,0.3)]"
              style={{ maskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)' }}
              priority
            />
          </div>
        </div>

        {/* Right Content */}
        <div className="w-full md:w-1/2 flex flex-col items-center text-center z-10 mt-10 md:mt-0 md:-mt-16">
          <div className="mb-6 flex flex-col items-center">
            <h1 className="font-black italic uppercase leading-[0.75] tracking-tighter">
              <span className="block text-[6rem] md:text-[12rem] bg-clip-text text-transparent bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] md:-ml-56">SECRET</span>
              <span className="block text-[5.5rem] md:text-[10rem] text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)]">WAIFU</span>
            </h1>
          </div>

          <p className="text-xl md:text-2xl text-gray-300 mb-8 font-light max-w-sm text-center">
            Choose or Create<br /><span className="font-bold text-white">Any Waifu You Can Imagine</span>
          </p>

          <Link href={signUpHref} className="w-full max-w-md">
            <button className="w-full py-5 px-8 rounded-md bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 text-white font-black text-xl md:text-2xl uppercase tracking-widest hover:scale-[1.03] active:scale-[0.98] transition-all duration-200 shadow-[0_0_25px_rgba(236,72,153,0.4)]">
              Start chatting immediately!
            </button>
          </Link>

          {/* Platform Icons */}
          <div className="flex gap-5 mt-8 justify-center items-start">
            {heroPlatforms.map((p) => (
              <PlatformItem
                key={p.id}
                label={p.label}
                iconType={p.iconType}
                href={p.href}
                ariaLabel={p.ariaLabel}
              />
            ))}
          </div>
        </div>
      </header>

      {/* --- BANNER SECTION --- */}
      <section className="w-full relative py-6 text-center my-2 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent"></div>
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent"></div>
        <div className="absolute inset-0 bg-[#0a0a0a] -z-10"></div>
        <h2 className="text-3xl md:text-5xl font-black uppercase tracking-[0.15em] leading-tight">
          <span className="text-white drop-shadow-lg">TRANSCEND REALITY</span><br />
          <span className="text-orange-400 text-xl md:text-2xl mt-3 block font-bold tracking-[0.3em]">IN A LIVING DIGITAL SANCTUARY</span>
        </h2>
      </section>

      {/* --- FEATURES GRID --- */}
      <section className="max-w-6xl mx-auto px-6 py-12 flex flex-col gap-8">

        {/* ROW 1: Vroid Characters */}
        <div className="bg-gradient-to-br from-[#0f0f11] to-[#050505] border border-gray-800 rounded-2xl overflow-hidden relative flex flex-col md:flex-row min-h-[450px] group">
          <div className="p-5 md:w-1/2 z-20 flex flex-col">
            <h3 className="text-3xl md:text-4xl font-extrabold text-orange-400 uppercase mb-4 tracking-wider leading-none">
              VROID CHARACTERS<br /><span className="text-white opacity-90">(NEW MODELS)</span>
            </h3>
            <p className="text-lg text-gray-400 mb-10 max-w-lg leading-relaxed">
              Chat with one of our hand-crafted V-tuber characters, or soon import your own custom VRM models.
            </p>
            {/* Character preview cards */}
            <div className="flex gap-4 mt-auto">
              {[
                { src: '/images/landing/vroid-char-1.png', alt: 'Vroid Character 1' },
                { src: '/images/landing/vroid-char-2.png', alt: 'Vroid Character 2' },
                { src: '/images/landing/vroid-char-3.png', alt: 'Vroid Character 3' },
              ].map((char, i) => (
                <div key={i} className="relative w-40 md:w-52 h-80 md:h-96 border border-orange-900/30 rounded-xl overflow-hidden bg-black/60 hover:border-orange-500/50 transition-all duration-300 group/card">
                  <Image
                    src={char.src}
                    alt={char.alt}
                    fill
                    className="object-cover object-top group-hover/card:scale-105 transition-transform duration-500"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="absolute right-0 bottom-0 w-full md:w-[45%] h-[80%] z-10 flex items-end justify-end pointer-events-none transition-transform duration-700 group-hover:scale-[1.02]">
            <div className="relative w-full h-full">
              <Image
                src="/images/landing/vroid-girls.jpg"
                alt="Vroid Characters"
                fill
                className="object-contain object-right-bottom translate-y-[2%] translate-x-[2%]"
              />
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent z-15 pointer-events-none md:block hidden"></div>
        </div>

        {/* ROW 2: Voice, Updates, Customization */}
        <div className="flex flex-col md:flex-row gap-8">
          {/* Left Column (Voice & Updates) */}
          <div className="flex flex-col gap-8 w-full md:w-1/3">
            <div className="bg-[#0f0f11] border border-gray-800 rounded-2xl p-6 hover:border-orange-500/30 transition-all duration-300">
              <h3 className="text-xl font-black text-orange-400 uppercase mb-2 tracking-widest">FULL VOICE SUPPORT</h3>
              <p className="text-base text-gray-400 leading-relaxed">Hear who you are chatting with thanks to character voice and a built-in learning pace.</p>
            </div>
            <div className="bg-[#0f0f11] border border-gray-800 rounded-2xl p-6 hover:border-orange-500/30 transition-all duration-300">
              <h3 className="text-xl font-black text-orange-400 uppercase mb-2 tracking-widest">CONSTANT UPDATES</h3>
              <p className="text-base text-gray-400 leading-relaxed">We are actively developing this game and dropping new features every single month.</p>
            </div>
          </div>

          {/* Right Column (Customization) */}
          <div className="bg-[#0f0f11] border border-gray-800 rounded-2xl p-6 w-full md:w-2/3 flex flex-col hover:border-orange-500/30 transition-all duration-300 relative overflow-hidden group">
            <h3 className="text-2xl font-black text-orange-400 uppercase mb-2 tracking-widest z-10">DEEP CUSTOMIZATION</h3>
            <p className="text-base text-gray-400 mb-6 z-10 max-w-md leading-relaxed">Change the personality, and the history of the character to create the exact dynamic you want.</p>
            {/* Animated story editor */}
            <StoryTypewriter />
            <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-orange-600/5 blur-3xl rounded-full group-hover:bg-orange-600/10 transition-colors"></div>
          </div>
        </div>

        {/* ROW 3: Evolving Relationships */}
        <div className="bg-[#0f0f11] border border-gray-800 rounded-2xl overflow-hidden relative flex flex-col md:flex-row min-h-[400px] group">
          <div className="p-5 md:w-[45%] z-20 flex flex-col">
            <h3 className="text-3xl font-black text-orange-400 uppercase mb-4 tracking-widest leading-none">
              EVOLVING RELATIONSHIPS<br /><span className="text-white opacity-90">(WITH NSFW H-SCENES)</span>
            </h3>
            <p className="text-lg text-gray-400 mb-8 max-w-md leading-relaxed">
              Hold a conversation that naturally ends in romance, lewdity, and fully interactive sex.
            </p>
            {/* Interaction preview boxes */}
            <div className="flex gap-4 mt-auto">
              {[
                { src: '/images/landing/hscene-1.png', alt: 'H-Scene 1' },
                { src: '/images/landing/hscene-2.png', alt: 'H-Scene 2' },
              ].map((img, i) => (
                <div key={i} className="relative w-40 md:w-52 h-60 md:h-80 border border-orange-900/30 rounded-xl overflow-hidden bg-black/60 hover:border-orange-500/50 transition-all duration-300 group/card">
                  <Image
                    src={img.src}
                    alt={img.alt}
                    fill
                    className="object-cover group-hover/card:scale-105 transition-transform duration-500"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="w-full md:absolute md:right-0 md:top-0 md:w-[60%] h-80 md:h-full z-10 border-l border-gray-800 overflow-hidden relative">
            <Image
              src="/images/landing/hscene-preview.jpg"
              alt="Evolving Relationships"
              fill
              className="object-cover group-hover:scale-110 transition-transform duration-[2000ms]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/20 to-transparent pointer-events-none md:block hidden"></div>
          </div>
        </div>

        {/* ROW 4: Type, VR */}
        <div className="flex flex-col md:flex-row gap-8">
          <div className="bg-[#0f0f11] border border-gray-800 rounded-2xl p-6 flex-1 hover:border-orange-500/30 transition-all duration-300 flex flex-col items-center text-center">
            <h3 className="text-xl font-black text-orange-400 uppercase mb-2 tracking-[0.2em]">NO NEED TO TYPE</h3>
            <p className="text-base text-gray-400 leading-relaxed">Use speech-to-text so you can just talk instead of typing.</p>
          </div>
          <div className="bg-[#0f0f11] border border-gray-800 rounded-2xl p-6 flex-1 hover:border-orange-500/30 transition-all duration-300 flex flex-col items-center text-center">
            <h3 className="text-xl font-black text-orange-400 uppercase mb-2 tracking-[0.2em]">VR SUPPORT</h3>
            <p className="text-base text-gray-400 leading-relaxed">VR pass-through is live right now, allowing you to interact face-to-face. (Meta Quest build coming soon.)</p>
          </div>
        </div>
      </section>

      {/* --- FOOTER CTA SECTION --- */}
      <footer className="w-full mt-0 relative overflow-hidden bg-[#080808] border-t border-gray-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(255,108,55,0.05)_0%,transparent_60%)]"></div>
        <div className="max-w-6xl mx-auto px-6 py-0 flex flex-col md:flex-row items-center relative z-10">

          {/* Left Image */}
          <div className="w-full md:w-5/12 relative flex justify-center md:justify-start -mb-20 md:-mb-32 z-10 order-2 md:order-1 mt-12 md:mt-0 transition-transform duration-500 hover:translate-y-[-5px]">
            <div className="relative w-[110%] md:w-[150%] aspect-[3/4]">
              <Image
                src="/images/landing/footer-girl.png"
                alt="Character"
                fill
                className="object-contain"
              />
            </div>
          </div>

          {/* Right Content */}
          <div className="w-full md:w-7/12 flex flex-col items-center md:items-start text-center md:text-left z-20 order-1 md:order-2 pl-0 md:pl-16">

            {/* Logo Area */}
            <div className="flex items-center mb-8">
              <Image
                src="/images/SecretWaifu Logo White.svg"
                alt="SecretWaifu Logo"
                width={300}
                height={80}
                className="h-16 md:h-20 w-auto brightness-110"
              />
            </div>

            <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-4 leading-none text-white drop-shadow-2xl italic">
              STEP INTO THE STORY
            </h2>
            <p className="text-orange-500/80 uppercase tracking-widest text-sm md:text-base mb-10 font-black">
              BECAUSE SOME CONVERSATIONS ARE BETTER IN PERSON.
            </p>

            <Link href={signUpHref} className="w-full max-w-sm">
              <button className="w-full py-5 px-10 rounded-md bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 text-white font-black text-2xl uppercase tracking-[0.2em] hover:scale-[1.05] active:scale-[0.95] transition-all duration-200 shadow-[0_0_30px_rgba(236,72,153,0.3)]">
                ENTER NOW
              </button>
            </Link>
          </div>
        </div>
      </footer>

    </div>
  )
}

export default Lp1Page
