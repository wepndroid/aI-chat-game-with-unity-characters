import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/ai-girlfriends', '/download'],
        disallow: [
          '/character',
          '/chat-faq',
          '/account',
          '/admin',
          '/auth',
          '/members',
          '/lp-1',
          '/play-demo',
          '/profile',
          '/sign-out',
          '/sign-up',
          '/stories',
          '/support',
          '/upload-vrm',
          '/your-characters',
          '/your-scenarios',
          '/ai-girlfriends/*/edit-scenario/*',
          '/ai-girlfriends/*/write-scenario',
          '/characters/*/edit-scenario/*',
          '/characters/*/write-scenario'
        ]
      }
    ],
    sitemap: absoluteUrl('/sitemap.xml')
  }
}
