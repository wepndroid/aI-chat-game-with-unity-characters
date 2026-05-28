'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { buildLandingSignupHref, buildTrackedRoutePath, readCampaignAttribution } from '@/lib/landing-attribution'
import { trackLandingSignupClick, trackLandingVisit } from '@/lib/landing-page-api'

type ChatTurn = {
  id: string
  role: 'ai' | 'user' | 'system'
  text?: string
  segments?: ChatSegment[]
  b_typewriter?: boolean
}

type ChatSegment = {
  id: string
  text: string
  tone: 'dialogue' | 'narration'
}

type PreviewResponse = {
  id: string
  text: string
  webmSrc: string
  movSrc?: string
  posterSrc: string
}

type CharacterVideoMode = 'idle' | 'response'

type CharacterVideo = {
  id: string
  webmSrc: string
  movSrc?: string
  posterSrc: string
  b_loop: boolean
  b_muted: boolean
}

const idleCharacterVideo: CharacterVideo = {
  id: 'ahri-idle-loop',
  webmSrc: '/videos/landing-chat/ahri-idle-loop.webm',
  posterSrc: '/images/landing/header-girl.png',
  b_loop: true,
  b_muted: true
}

const previewResponses: PreviewResponse[] = [
  {
    id: 'first-reply',
    text: 'If you want to talk to me, then please create an account',
    webmSrc: '/videos/landing-chat/ahri-answer.webm',
    posterSrc: '/images/landing/header-girl.png'
  }
]
const preloadedResponseVideoSrc = previewResponses[0].webmSrc

const openingTurns: ChatTurn[] = [
  {
    id: 'opening-ai',
    role: 'ai',
    segments: [
      {
        id: 'opening-1',
        tone: 'narration',
        text: 'You gasp for air as the last jungle monster dissolves into shimmering particles. A warm hand grips your shoulder, steadying you. When you look up, nine flowing tails frame your vision.'
      },
      {
        id: 'opening-2',
        tone: 'dialogue',
        text: '“You really have no idea what you’re doing, do you?”'
      },
      {
        id: 'opening-3',
        tone: 'narration',
        text: 'Ahri steps in front of you, eyes glowing softly as she scans you from head to toe — not with judgment, but curiosity.'
      },
      {
        id: 'opening-4',
        tone: 'dialogue',
        text: '“A brand-new champion wandering into the jungle alone… You’re lucky I was passing by.”'
      },
      {
        id: 'opening-5',
        tone: 'narration',
        text: 'She flicks one of her tails against your arm, gently teasing.'
      },
      {
        id: 'opening-6',
        tone: 'dialogue',
        text: '“Come on, get up. I’m not letting you die five minutes after arrival.”'
      },
      {
        id: 'opening-7',
        tone: 'narration',
        text: 'She offers her hand — warm, confident, and just a little mischievous.'
      },
      {
        id: 'opening-8',
        tone: 'dialogue',
        text: '“I’ll teach you how this place works. But you’d better listen… or next time, even I might not reach you in time.”'
      },
      {
        id: 'opening-9',
        tone: 'narration',
        text: 'Her smile softens.'
      },
      {
        id: 'opening-10',
        tone: 'dialogue',
        text: '“Ready to learn, rookie?”'
      }
    ]
  }
]

const responseDelayMs = 780
const signupGateDelayMs = 1200
const typewriterIntervalMs = 34

const lpChatLandingPage = {
  key: 'lp-chat',
  name: 'Ahri Chat Preview Landing Page'
}

const RelationshipGauge = ({
  label,
  value,
  accentColor
}: {
  label: string
  value: number
  accentColor: string
}) => {
  const clampedValue = Math.min(99, Math.max(0, value))
  const rotationDegrees = clampedValue * 3.6

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#2d3a50] bg-[#0a101b]/80 px-3 py-2 shadow-[0_14px_30px_rgba(0,0,0,0.3)]">
      <div
        className="relative flex h-14 w-14 items-center justify-center rounded-full transition-all duration-700"
        style={{
          background: `conic-gradient(${accentColor} ${rotationDegrees}deg, rgba(45,58,80,0.72) 0deg)`,
          boxShadow: `0 0 24px ${accentColor}44`
        }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#07101f] text-sm font-black text-white">
          {clampedValue.toString().padStart(2, '0')}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-black tracking-[0.16em]" style={{ color: accentColor }}>
          {label}
        </p>
        <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-[#263247]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${clampedValue}%`,
              backgroundColor: accentColor,
              boxShadow: `0 0 14px ${accentColor}`
            }}
          />
        </div>
      </div>
    </div>
  )
}

const ChatMessageText = ({ turn }: { turn: ChatTurn }) => {
  if (turn.segments) {
    return (
      <>
        {turn.segments.map((segment) => (
          <span
            key={segment.id}
            className={
              segment.tone === 'narration'
                ? 'mb-3 block italic leading-6 text-[#b8a7ff]'
                : 'mb-3 block leading-6 text-white'
            }
          >
            {segment.text}
          </span>
        ))}
      </>
    )
  }

  return (
    <>
      {turn.text}
      {turn.b_typewriter ? (
        <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-[#f58f40]" />
      ) : null}
    </>
  )
}

const CharacterPreviewStage = ({
  activeCharacterVideo,
  posterSrc,
  b_videoUnavailable,
  characterVideoMode,
  videoRef,
  className,
  onVideoUnavailable,
  onResponseComplete
}: {
  activeCharacterVideo: CharacterVideo
  posterSrc: string
  b_videoUnavailable: boolean
  characterVideoMode: CharacterVideoMode
  videoRef: React.RefObject<HTMLVideoElement | null>
  className: string
  onVideoUnavailable: () => void
  onResponseComplete: () => void
}) => {
  return (
    <div className={className}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_44%,rgba(245,143,64,0.18),transparent_42%)]" />
      <div className="relative h-full w-full">
        {b_videoUnavailable ? (
          <Image
            src={posterSrc}
            alt="Ahri character preview"
            fill
            className="object-contain object-bottom drop-shadow-[0_0_40px_rgba(245,143,64,0.22)]"
            priority
          />
        ) : (
          <video
            key={activeCharacterVideo.id}
            ref={videoRef}
            className="h-full w-full object-contain object-bottom drop-shadow-[0_0_40px_rgba(245,143,64,0.22)]"
            autoPlay={activeCharacterVideo.b_loop}
            loop={activeCharacterVideo.b_loop}
            muted={activeCharacterVideo.b_muted}
            playsInline
            preload={characterVideoMode === 'response' ? 'auto' : 'metadata'}
            onError={onVideoUnavailable}
            onEnded={onResponseComplete}
          >
            <source src={activeCharacterVideo.webmSrc} type="video/webm" />
            {activeCharacterVideo.movSrc ? <source src={activeCharacterVideo.movSrc} type="video/quicktime" /> : null}
          </video>
        )}
      </div>
    </div>
  )
}

const LpChatPage = () => {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const signUpHref = React.useMemo(() => buildLandingSignupHref(searchParams, lpChatLandingPage), [searchParams])
  const {
    source: campaignSource,
    medium: campaignMedium,
    campaign: campaignName,
    content: campaignContent,
    term: campaignTerm,
    shortUrlKey
  } = readCampaignAttribution(searchParams)
  const [turns, setTurns] = React.useState<ChatTurn[]>(openingTurns)
  const [inputValue, setInputValue] = React.useState('')
  const [isResponding, setIsResponding] = React.useState(false)
  const [isSignupGateOpen, setIsSignupGateOpen] = React.useState(false)
  const [activeResponseIndex, setActiveResponseIndex] = React.useState(0)
  const [characterVideoMode, setCharacterVideoMode] = React.useState<CharacterVideoMode>('idle')
  const [b_videoUnavailable, setVideoUnavailable] = React.useState(false)
  const [loveValue, setLoveValue] = React.useState(25)
  const [lustValue, setLustValue] = React.useState(2)
  const [typewriterText, setTypewriterText] = React.useState('')
  const chatScrollRef = React.useRef<HTMLDivElement | null>(null)
  const mobileResponseVideoRef = React.useRef<HTMLVideoElement | null>(null)
  const desktopResponseVideoRef = React.useRef<HTMLVideoElement | null>(null)
  const responseTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const typewriterIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const signupGateTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeResponse = previewResponses[activeResponseIndex]
  const activeCharacterVideo: CharacterVideo =
    characterVideoMode === 'response'
      ? {
          id: activeResponse.id,
          webmSrc: activeResponse.webmSrc,
          movSrc: activeResponse.movSrc,
          posterSrc: activeResponse.posterSrc,
          b_loop: false,
          b_muted: false
        }
      : idleCharacterVideo

  React.useEffect(() => {
    const existingPreloadLink = document.head.querySelector<HTMLLinkElement>(
      `link[data-secretwaifu-lp-chat-preload="${preloadedResponseVideoSrc}"]`
    )

    if (existingPreloadLink) {
      return
    }

    const preloadLink = document.createElement('link')
    preloadLink.rel = 'preload'
    preloadLink.as = 'video'
    preloadLink.href = preloadedResponseVideoSrc
    preloadLink.type = 'video/webm'
    preloadLink.setAttribute('data-secretwaifu-lp-chat-preload', preloadedResponseVideoSrc)
    document.head.appendChild(preloadLink)

    return () => {
      preloadLink.remove()
    }
  }, [])

  React.useEffect(() => {
    void trackLandingVisit({
      landingPageKey: lpChatLandingPage.key,
      landingPageName: lpChatLandingPage.name,
      variantKey: 'unity-chat-preview',
      variantName: 'Unity Chat Preview',
      shortUrlKey,
      routePath: buildTrackedRoutePath(pathname, searchParams),
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
  }, [campaignContent, campaignMedium, campaignName, campaignSource, campaignTerm, pathname, searchParams, shortUrlKey])

  React.useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: 'smooth'
    })
  }, [turns, isResponding, typewriterText])

  React.useEffect(() => {
    return () => {
      if (responseTimeoutRef.current) {
        clearTimeout(responseTimeoutRef.current)
      }
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current)
      }
      if (signupGateTimeoutRef.current) {
        clearTimeout(signupGateTimeoutRef.current)
      }
    }
  }, [])

  const playActiveResponse = React.useCallback(() => {
    const playableVideos = [mobileResponseVideoRef.current, desktopResponseVideoRef.current].filter((video): video is HTMLVideoElement => {
      if (!video) {
        return false
      }

      const bounds = video.getBoundingClientRect()
      return bounds.width > 1 && bounds.height > 1
    })

    for (const video of playableVideos) {
      video.currentTime = 0
      video.muted = characterVideoMode !== 'response'
      video.volume = characterVideoMode === 'response' ? 1 : 0
      void video.play().catch(() => {
        // Some browsers block unmuted playback; the replay button remains available.
      })
    }
  }, [characterVideoMode])

  React.useEffect(() => {
    if (characterVideoMode !== 'response') {
      return
    }

    requestAnimationFrame(playActiveResponse)
  }, [characterVideoMode, playActiveResponse])

  const submitPreviewMessage = (message: string) => {
    const trimmedMessage = message.trim()

    if (!trimmedMessage || isResponding) {
      return
    }

    if (responseTimeoutRef.current) {
      clearTimeout(responseTimeoutRef.current)
    }
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current)
    }
    if (signupGateTimeoutRef.current) {
      clearTimeout(signupGateTimeoutRef.current)
    }

    const nextResponseIndex = activeResponseIndex % previewResponses.length
    const nextResponse = previewResponses[nextResponseIndex]
    setActiveResponseIndex(nextResponseIndex)
    setCharacterVideoMode('idle')
    setVideoUnavailable(false)
    setTurns((currentTurns) => [
      ...currentTurns,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        text: trimmedMessage
      }
    ])
    setInputValue('')
    setIsResponding(true)
    setIsSignupGateOpen(false)
    setTypewriterText('')

    responseTimeoutRef.current = setTimeout(() => {
      const aiTurnId = `ai-${Date.now()}`
      setTurns((currentTurns) => [
        ...currentTurns,
        {
          id: aiTurnId,
          role: 'ai',
          text: '',
          b_typewriter: true
        }
      ])
      setIsResponding(false)
      setLoveValue((currentValue) => Math.min(99, currentValue + 13))
      setLustValue((currentValue) => Math.min(99, currentValue + 8))
      setCharacterVideoMode('response')

      let nextCharacterIndex = 0
      typewriterIntervalRef.current = setInterval(() => {
        nextCharacterIndex += 1
        const nextText = nextResponse.text.slice(0, nextCharacterIndex)
        setTypewriterText(nextText)
        setTurns((currentTurns) =>
          currentTurns.map((turn) =>
            turn.id === aiTurnId
              ? {
                  ...turn,
                  text: nextText
                }
              : turn
          )
        )

        if (nextCharacterIndex >= nextResponse.text.length) {
          if (typewriterIntervalRef.current) {
            clearInterval(typewriterIntervalRef.current)
            typewriterIntervalRef.current = null
          }

          setTurns((currentTurns) =>
            currentTurns.map((turn) =>
              turn.id === aiTurnId
                ? {
                    ...turn,
                    text: nextResponse.text,
                    b_typewriter: false
                  }
                : turn
            )
          )

          signupGateTimeoutRef.current = setTimeout(() => {
            setIsSignupGateOpen(true)
          }, signupGateDelayMs)
        }
      }, typewriterIntervalMs)
    }, responseDelayMs)
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitPreviewMessage(inputValue)
  }

  const handleSignupClick = () => {
    void trackLandingSignupClick().catch(() => {
      // Signup click analytics should not block navigation.
    })
  }

  const handleCharacterVideoUnavailable = () => {
    if (characterVideoMode === 'response') {
      setCharacterVideoMode('idle')
      return
    }

    setVideoUnavailable(true)
  }

  const handleResponseVideoComplete = () => setCharacterVideoMode('idle')

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#060914] text-[#f8fafc]">
      <div className="absolute inset-0 bg-[url('/images/BannerBackground.png')] bg-cover bg-center opacity-45" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.96)_0%,rgba(7,13,27,0.82)_44%,rgba(10,13,18,0.38)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_24%,rgba(245,143,64,0.28),transparent_32%),radial-gradient(circle_at_84%_72%,rgba(153,103,255,0.22),transparent_28%),linear-gradient(to_bottom,rgba(6,9,20,0.08)_0%,rgba(6,9,20,0.9)_100%)]" />

      <section className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-8 pt-5 sm:px-6 sm:pt-8 lg:px-10">
        <h1 className="sr-only">SecretWaifu chat preview with Ahri</h1>

        <div className="relative min-h-[calc(100svh-2.5rem)] overflow-hidden rounded-2xl border border-[#2d3a50] bg-[#060914]/42 shadow-[0_28px_70px_rgba(0,0,0,0.4)] md:h-[max(78vh,728px)] md:min-h-0">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,9,20,0.96)_0%,rgba(6,9,20,0.9)_46%,rgba(6,9,20,0.18)_100%)]" />

          <CharacterPreviewStage
            activeCharacterVideo={activeCharacterVideo}
            posterSrc={activeResponse.posterSrc}
            b_videoUnavailable={b_videoUnavailable}
            characterVideoMode={characterVideoMode}
            videoRef={desktopResponseVideoRef}
            className="absolute bottom-0 right-0 top-0 hidden w-[54%] items-end justify-center md:flex"
            onVideoUnavailable={handleCharacterVideoUnavailable}
            onResponseComplete={handleResponseVideoComplete}
          />

          <div className="relative flex min-h-[calc(100svh-2.5rem)] flex-col p-4 sm:p-6 md:h-full md:min-h-0 lg:w-[58%] lg:p-8">
            <CharacterPreviewStage
              activeCharacterVideo={activeCharacterVideo}
              posterSrc={activeResponse.posterSrc}
              b_videoUnavailable={b_videoUnavailable}
              characterVideoMode={characterVideoMode}
              videoRef={mobileResponseVideoRef}
              className="pointer-events-none absolute inset-x-[-18%] bottom-[4.75rem] top-[5.5rem] z-20 flex translate-x-[17%] items-end justify-center overflow-hidden md:hidden"
              onVideoUnavailable={handleCharacterVideoUnavailable}
              onResponseComplete={handleResponseVideoComplete}
            />

            <div className="relative z-10 flex flex-wrap justify-end gap-2 sm:gap-3">
              <RelationshipGauge label="LOVE" value={loveValue} accentColor="#e85a9c" />
              <RelationshipGauge label="LUST" value={lustValue} accentColor="#9967ff" />
            </div>

            <div ref={chatScrollRef} className="relative z-10 mt-4 min-h-[230px] flex-1 overflow-y-auto pr-1 sm:min-h-[300px] md:mt-5 md:min-h-0">
              <div className="flex min-h-full flex-col justify-end gap-4 pb-5">
                {turns.map((turn) => (
                  <div
                    key={turn.id}
                    className={
                      turn.role === 'user'
                        ? 'ml-auto max-w-[70%] rounded-xl border border-[#f58f40]/50 bg-[#f58f40]/18 px-3 py-2 text-[12px] leading-5 text-white shadow-[0_14px_30px_rgba(0,0,0,0.34)] backdrop-blur-md sm:max-w-[72%] sm:px-4 sm:py-3 sm:text-sm md:max-w-[82%] md:px-5 md:py-4'
                        : turn.role === 'system'
                          ? 'max-w-[72%] rounded-lg border border-[#43536f]/60 bg-[#0f172a]/72 px-3 py-2 text-[12px] italic leading-5 text-[#d6deea] shadow-[0_14px_30px_rgba(0,0,0,0.3)] backdrop-blur-md sm:max-w-[76%] sm:px-4 sm:py-3 sm:text-sm md:max-w-[88%]'
                          : 'max-w-[74%] sm:max-w-[78%] md:max-w-[88%]'
                    }
                  >
                    {turn.role === 'ai' ? (
                      <>
                        <p className="w-fit rounded-t-lg border border-[#f58f40]/45 bg-[#f58f40]/18 px-2.5 py-1 text-[10px] font-bold text-white shadow-[0_10px_24px_rgba(0,0,0,0.32)] backdrop-blur-md sm:px-3 sm:text-xs">
                          AHRI
                        </p>
                        <p className="max-h-[42svh] overflow-y-auto rounded-b-xl rounded-tr-xl border border-[#2d3a50]/90 bg-[#0b1220]/82 px-3 py-2 text-[12px] leading-5 text-white shadow-[0_18px_40px_rgba(0,0,0,0.42)] backdrop-blur-md sm:max-h-[46svh] sm:px-4 sm:py-3 sm:text-sm sm:leading-6 md:max-h-none md:bg-[#0b1220] md:px-5 md:py-4">
                          <ChatMessageText turn={turn} />
                        </p>
                      </>
                    ) : (
                      turn.text
                    )}
                  </div>
                ))}

                {isResponding ? (
                  <div className="max-w-[88%]">
                    <p className="w-fit rounded-t-lg border border-[#f58f40]/45 bg-[#f58f40]/18 px-2.5 py-1 text-[10px] font-bold text-white shadow-[0_10px_24px_rgba(0,0,0,0.32)] backdrop-blur-md sm:px-3 sm:text-xs">
                      AHRI
                    </p>
                    <div className="flex w-fit gap-1 rounded-b-xl rounded-tr-xl border border-[#2d3a50] bg-[#0b1220]/82 px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.42)] backdrop-blur-md sm:px-5 sm:py-4 md:bg-[#0b1220]">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[#f58f40]" />
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[#e85a9c] [animation-delay:120ms]" />
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[#9967ff] [animation-delay:240ms]" />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="relative z-10 flex min-h-[60px] items-center gap-2 rounded-2xl border border-[#2d3a50] bg-[#0b1220]/88 px-3 py-2 shadow-[0_18px_42px_rgba(0,0,0,0.38)] backdrop-blur-md md:bg-[#0b1220]">
              <input
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder="Type your response..."
                className="h-11 flex-1 bg-transparent px-3 text-base text-white outline-none placeholder:text-[#93a0b4]"
                aria-label="Type your message to Ahri"
              />
              <button
                type="button"
                onClick={playActiveResponse}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#2d3a50] bg-[#182235] text-sm font-bold text-white transition hover:bg-[#263247]"
                aria-label="Replay character response"
              >
                {isResponding ? '...' : 'R'}
              </button>
              <button
                type="submit"
                disabled={isResponding}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f58f40] text-sm font-black text-[#1a120b] transition hover:bg-[#ffad67] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Send preview message"
              >
                {'>'}
              </button>
            </form>
          </div>

          {isSignupGateOpen ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#020617]/72 px-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-[#f58f40]/50 bg-[#0b1220] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
                <p className="text-sm font-bold text-[#f58f40]">Create your account to continue</p>
                <h2 className="mt-3 text-3xl font-black leading-tight text-white">Ahri is ready to answer inside SecretWaifu.</h2>
                <p className="mt-4 text-sm leading-6 text-[#d6deea]">
                  The preview shows the first reply. Sign up to keep the chat, unlock real AI responses, and continue with voice.
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <Link
                    href={signUpHref}
                    onClick={handleSignupClick}
                    className="flex min-h-12 items-center justify-center rounded-lg bg-[#f58f40] px-4 py-3 text-sm font-black text-[#1a120b] transition hover:bg-[#ffad67]"
                  >
                    Sign up free
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <video className="pointer-events-none fixed bottom-0 right-0 h-px w-px opacity-0" preload="auto" muted playsInline aria-hidden="true">
        <source src={preloadedResponseVideoSrc} type="video/webm" />
      </video>

    </main>
  )
}

export default LpChatPage
