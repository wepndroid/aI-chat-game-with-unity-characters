'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AI_GIRLFRIEND_ROUTE_BASE } from '@/lib/ai-girlfriend-route'

const Footer = () => {
  const pathname = usePathname()

  if (pathname.startsWith('/admin')) {
    return null
  }

  return (
    <footer className="relative overflow-hidden bg-[radial-gradient(circle_at_18%_115%,rgba(237,90,20,0.62),rgba(237,90,20,0.08)_36%,transparent_60%),radial-gradient(circle_at_70%_122%,rgba(237,90,20,0.4),rgba(237,90,20,0.04)_30%,transparent_56%),linear-gradient(to_right,#130804,#070707_42%,#050505)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent opacity-70" />
      <div className="mx-auto flex h-auto w-full max-w-[1240px] flex-col justify-between px-8 py-10 !pb-[50px] md:px-12">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between md:gap-8">
          <div className="w-full max-w-[360px]">
            <div className="inline-flex items-center">
              <Image
                src="/images/SecretWaifu Logo White.svg"
                alt="SecretWaifu logo"
                width={164}
                height={44}
                className="h-8 w-auto opacity-95"
                suppressHydrationWarning
              />
            </div>
            <p className="mt-4 text-[14px] leading-[1.45] text-white/45">
              Step into a world, interactive world with your favorite VRoid girl uncensored and completely immersive VR supported
            </p>
          </div>

          <div className="flex w-full flex-col items-start md:w-auto md:items-end">
            <nav className="mt-1 flex flex-col items-start gap-[2px] text-[13px] font-semibold uppercase tracking-[0.12em] text-white/35 md:items-end">
              <Link href="/" className="transition hover:text-white/60" aria-label="Home link in footer">
                Home
              </Link>
              <Link href="/chat-faq" className="transition hover:text-white/60" aria-label="Chat FAQ link in footer">
                Chat FAQ
              </Link>
              <Link href={AI_GIRLFRIEND_ROUTE_BASE} className="transition hover:text-white/60" aria-label="AI girlfriends link in footer">
                AI Girlfriends
              </Link>
              <a
                href="https://discord.gg/EmmSC3N5ww"
                target="_blank"
                rel="noreferrer noopener"
                className="transition hover:text-white/60"
                aria-label="Discord link in footer"
              >
                Discord
              </a>
              <Link href="/members" className="transition hover:text-white/60" aria-label="Membership link in footer">
                Membership
              </Link>
              <Link href="/news" className="transition hover:text-white/60" aria-label="News link in footer">
                News
              </Link>
              <Link href="/legal" className="transition hover:text-white/60" aria-label="Legal link in footer">
                Legal
              </Link>
            </nav>
            <p className="mt-9 text-[34px] font-semibold italic tracking-[0.02em] text-white/70">VISA</p>
          </div>
        </div>

        <div className="mt-8 pt-5 text-[13px] leading-[1.35] text-white/35">
          <div className="mb-5 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-60" />
          <p>© 2026 - Copyright</p>
          <p>All rights reserved</p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
