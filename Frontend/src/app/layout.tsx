import type { Metadata } from 'next'
import { Barlow_Condensed, Sora } from 'next/font/google'
import { AuthProvider } from '@/components/providers/auth-provider'
import { MaintenanceProvider } from '@/components/providers/maintenance-provider'
import UnityScanReportListener from '@/components/providers/unity-scan-report-listener'
import Footer from '@/components/shared/footer'
import Header from '@/components/shared/header'
import './globals.css'

const bodyFont = Sora({
  subsets: ['latin'],
  variable: '--font-body'
})

const headingFont = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-heading'
})

export const metadata: Metadata = {
  title: 'SecretWaifu | Home Page',
  description: 'AI Chat Game platform login and homepage preview'
}

type RootLayoutProps = Readonly<{
  children: React.ReactNode
}>

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${bodyFont.variable} ${headingFont.variable} bg-[#030303] text-white antialiased`}
      >
        <AuthProvider>
          <MaintenanceProvider>
            <UnityScanReportListener />
            <Header />
            {children}
            <Footer />
          </MaintenanceProvider>
        </AuthProvider>
      </body>
    </html>
  )
}

export default RootLayout
