import type { Metadata } from 'next'
import { Inter, Sora } from 'next/font/google'
import GoogleAnalytics from '@/components/analytics/google-analytics'
import { AuthProvider } from '@/components/providers/auth-provider'
import { MaintenanceProvider } from '@/components/providers/maintenance-provider'
import { WebglPreloadProvider } from '@/components/providers/webgl-preload-provider'
import UnityScanReportListener from '@/components/providers/unity-scan-report-listener'
import { ConditionalHeader, ConditionalFooter } from '@/components/shared/layout-wrapper'
import { siteMetadataBase } from '@/lib/site'
import './globals.css'

const bodyFont = Inter({
  subsets: ['latin'],
  variable: '--font-body'
})

const headingFont = Sora({
  subsets: ['latin'],
  variable: '--font-heading'
})

export const metadata: Metadata = {
  metadataBase: siteMetadataBase,
  title: {
    default: 'SecretWaifu.com',
    template: '%s | SecretWaifu.com'
  },
  description:
    'Transcend reality in a living digital sanctuary with hand-crafted VRoid AI girlfriends, voice chat, speech-to-text, deep customization, VR support, and monthly updates.',
  alternates: {
    canonical: '/'
  },
  openGraph: {
    type: 'website',
    siteName: 'SecretWaifu.com',
    title: 'SecretWaifu.com',
    description:
      'Transcend reality in a living digital sanctuary with hand-crafted VRoid AI girlfriends, voice chat, speech-to-text, deep customization, VR support, and monthly updates.',
    url: '/',
    images: [
      {
        url: '/images/Homepage.png',
        width: 1200,
        height: 630,
        alt: 'SecretWaifu homepage preview'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SecretWaifu.com',
    description:
      'Transcend reality in a living digital sanctuary with hand-crafted VRoid AI girlfriends, voice chat, speech-to-text, deep customization, VR support, and monthly updates.',
    images: ['/images/Homepage.png']
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico'
  }
}

type RootLayoutProps = Readonly<{
  children: React.ReactNode
}>

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${bodyFont.variable} ${headingFont.variable} bg-[#030303] text-white antialiased`}>
        <GoogleAnalytics />
        <AuthProvider>
          <MaintenanceProvider>
            <WebglPreloadProvider>
              <UnityScanReportListener />
              <ConditionalHeader />
              {children}
              <ConditionalFooter />
            </WebglPreloadProvider>
          </MaintenanceProvider>
        </AuthProvider>
      </body>
    </html>
  )
}

export default RootLayout
